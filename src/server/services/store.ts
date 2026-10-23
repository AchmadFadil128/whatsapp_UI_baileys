import fs from "fs";
import path from "path";
import { prisma } from "@/server/db/client";
import type { Chat, Message, Contact, MessageStatus, MessageType, QuotedMessage, SearchMessageResult } from "@/types";
import { createLogger } from "@/server/lib/logger";
import { resolveContactDisplayName, formatPhoneNumber } from "@/server/lib/contact-resolver";
import { normalizeJid } from "@/server/lib/message-transformer";

const logger = createLogger("store");

/**
 * PostgreSQL-backed Store for chats, messages, contacts, and media.
 * Maintains an in-memory cache of chats and contacts for sub-millisecond lookups
 * while persisting all operations transactionally to PostgreSQL.
 */
class Store {
  private chats: Map<string, Chat> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private lidToPn: Map<string, string> = new Map();
  private pnToLid: Map<string, string> = new Map();
  private pendingMappingSave: NodeJS.Timeout | null = null;
  private userJid?: string;
  private userLid?: string;
  private isInitialized = false;

  constructor() {
    this.init().catch((err) => {
      logger.error(err, "Failed to initialize store from database");
    });
  }

  /**
   * Loads initial state (chats, contacts, and LID mappings) from PostgreSQL into memory cache.
   */
  async init(): Promise<void> {
    try {
      const dbChats = await prisma.chat.findMany();
      for (const c of dbChats) {
        this.chats.set(c.id, {
          id: c.id,
          name: c.name,
          lastMessage: c.lastMessage || "",
          lastMessageTimestamp: Number(c.lastMessageTimestamp),
          unreadCount: c.unreadCount,
          isGroup: c.isGroup,
          isArchived: c.isArchived,
          isMuted: c.isMuted,
          isPinned: c.isPinned,
          profilePicUrl: c.profilePicUrl || undefined,
        });
      }

      const dbContacts = await prisma.contact.findMany();
      for (const c of dbContacts) {
        this.contacts.set(c.id, {
          id: c.id,
          name: c.name || undefined,
          pushName: c.pushName || undefined,
          verifiedName: c.verifiedName || undefined,
          profilePicUrl: c.profilePicUrl || undefined,
        });
      }

      // Load persistent LID <-> PN mappings from settings table
      try {
        const mappingSetting = await prisma.setting.findUnique({
          where: { key: "lid_pn_mappings" },
        });
        if (mappingSetting?.value && typeof mappingSetting.value === "object") {
          for (const [lid, pn] of Object.entries(mappingSetting.value as Record<string, string>)) {
            if (typeof lid === "string" && typeof pn === "string") {
              this.lidToPn.set(lid, pn);
              this.pnToLid.set(pn, lid);
            }
          }
        }
      } catch (mappingErr) {
        logger.warn({ mappingErr }, "Could not load lid_pn_mappings from settings");
      }

      // Try to load user credentials from disk to resolve "me" / self JID immediately
      try {
        const credsPath = path.join(process.cwd(), "data", "whatsapp", "auth", "creds.json");
        if (fs.existsSync(credsPath)) {
          const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
          if (creds?.me) {
            this.setUserJid(creds.me.id, creds.me.lid);
          }
        }
      } catch {
        // ignore
      }

      this.isInitialized = true;
      logger.info(
        { chats: this.chats.size, contacts: this.contacts.size, lidMappings: this.lidToPn.size },
        "Loaded store from PostgreSQL"
      );
    } catch (err) {
      logger.error(err, "Error loading store from PostgreSQL");
    }
  }

  // ─── LID <-> PN Mapping ───────────────────────────────────

  registerLidPn(rawLid: string, rawPn: string): void {
    if (!rawLid || !rawPn) return;
    let lid = rawLid.trim();
    let pn = rawPn.trim();
    if (lid.endsWith("@s.whatsapp.net") && pn.endsWith("@lid")) {
      const tmp = lid;
      lid = pn;
      pn = tmp;
    }
    if (!lid.endsWith("@lid") || !pn.endsWith("@s.whatsapp.net")) {
      return;
    }

    if (this.lidToPn.get(lid) === pn && this.pnToLid.get(pn) === lid) {
      return;
    }

    this.lidToPn.set(lid, pn);
    this.pnToLid.set(pn, lid);

    // Debounced persist to prisma.setting
    if (this.pendingMappingSave) {
      clearTimeout(this.pendingMappingSave);
    }
    this.pendingMappingSave = setTimeout(async () => {
      try {
        const obj: Record<string, string> = {};
        for (const [l, p] of this.lidToPn) {
          obj[l] = p;
        }
        await prisma.setting.upsert({
          where: { key: "lid_pn_mappings" },
          create: { key: "lid_pn_mappings", value: obj },
          update: { value: obj },
        });
        logger.info({ mappedCount: this.lidToPn.size }, "Persisted LID-to-PN mappings to DB");
      } catch (err) {
        logger.error({ err }, "Failed to persist LID-to-PN mappings");
      }
    }, 1000);
  }

  getPnForLid(lid: string): string | undefined {
    return this.lidToPn.get(lid);
  }

  getLidForPn(pn: string): string | undefined {
    return this.pnToLid.get(pn);
  }

  getAllLidMappings(): Record<string, string> {
    return Object.fromEntries(this.lidToPn);
  }

  /**
   * Resolves a chat display name following:
   * 1. Address book contact name
   * 2. Mapped phone contact name (for LID chats)
   * 3. Push name (direct or mapped)
   * 4. Verified business name
   * 5. Current non-JID chat name (e.g. Copilot, ChatGPT, etc.)
   * 6. Formatted phone number (for mapped LID or PN)
   * 7. Fallback identifier
   */
  resolveChatName(chatId: string, currentChatName?: string): string {
    if (chatId.endsWith("@g.us")) {
      return currentChatName || chatId.split("@")[0];
    }

    // 1. Direct contact name
    const direct = this.contacts.get(chatId);
    if (direct?.name && direct.name.trim().length > 0) {
      return direct.name.trim();
    }

    // 2. Mapped PN contact name (for @lid chats)
    const mappedPn = this.lidToPn.get(chatId);
    if (mappedPn) {
      const pnContact = this.contacts.get(mappedPn);
      if (pnContact?.name && pnContact.name.trim().length > 0) {
        return pnContact.name.trim();
      }
      if (pnContact?.pushName && pnContact.pushName.trim().length > 0) {
        return pnContact.pushName.trim();
      }
      if (pnContact?.verifiedName && pnContact.verifiedName.trim().length > 0) {
        return pnContact.verifiedName.trim();
      }
    }

    // 3. Direct contact push name or verified business name
    if (direct?.pushName && direct.pushName.trim().length > 0) {
      return direct.pushName.trim();
    }
    if (direct?.verifiedName && direct.verifiedName.trim().length > 0) {
      return direct.verifiedName.trim();
    }

    // 4. Current chat name if it's not raw identifier digits
    if (
      currentChatName &&
      currentChatName.trim().length > 0 &&
      currentChatName !== chatId &&
      currentChatName !== chatId.split("@")[0]
    ) {
      return currentChatName.trim();
    }

    // 5. Formatted phone number
    if (mappedPn) {
      return formatPhoneNumber(mappedPn);
    }
    if (chatId.endsWith("@s.whatsapp.net")) {
      return formatPhoneNumber(chatId);
    }

    // 6. Final fallback identifier
    return chatId.split("@")[0];
  }

  // ─── Identity & Quoted Sender Resolution ────────────────────

  setUserJid(jid?: string, lid?: string): void {
    if (jid) this.userJid = normalizeJid(jid);
    if (lid) this.userLid = normalizeJid(lid);
  }

  getUserJid(): string | undefined {
    return this.userJid;
  }

  getUserLid(): string | undefined {
    return this.userLid;
  }

  isSelf(jid: string): boolean {
    if (!jid) return false;
    if (jid === "me") return true;
    const normalized = normalizeJid(jid);
    if (normalized === "me") return true;
    if (this.userJid && (normalized === this.userJid || jid === this.userJid)) return true;
    if (this.userLid && (normalized === this.userLid || jid === this.userLid)) return true;
    return false;
  }

  /**
   * Resolves the human-readable display name for the quoted message sender.
   * Priority:
   * 1. Self ("me" or matching userJid/userLid) -> "You"
   * 2. Already resolved valid name (if passed and not raw JID)
   * 3. In 1-on-1 chats, if not self -> resolved name of other person (chatId)
   * 4. Address-book contact name (via direct JID or mapped PN)
   * 5. Push name / verified business name
   * 6. Formatted phone number
   * 7. JID fallback
   */
  resolveQuotedSenderName(sender: string, chatId?: string, explicitSenderName?: string): string {
    if (!sender) return "Unknown";

    // 1. If self
    if (this.isSelf(sender)) {
      return "You";
    }

    // 2. If valid explicit senderName is already provided and isn't raw JID digits
    if (
      explicitSenderName &&
      explicitSenderName.trim().length > 0 &&
      explicitSenderName !== sender &&
      explicitSenderName !== sender.split("@")[0]
    ) {
      return explicitSenderName.trim();
    }

    // 3. In a 1-on-1 chat, if sender isn't self, it's the other participant
    if (chatId && !chatId.endsWith("@g.us")) {
      const resolved = this.resolveChatName(chatId);
      if (resolved && resolved !== chatId && resolved !== chatId.split("@")[0]) {
        return resolved;
      }
    }

    // 4. Resolve sender directly via resolveChatName (contacts, mapped PN, pushName, formatted phone)
    const directResolved = this.resolveChatName(sender);
    if (directResolved) {
      return directResolved;
    }

    return sender.split("@")[0];
  }

  resolveMessageSenderName(senderId: string, pushName?: string): string {
    if (!senderId) return "Unknown";
    if (this.isSelf(senderId)) return "You";
    if (senderId.endsWith("@g.us") || senderId === "unknown") {
      return pushName || "Member";
    }
    return this.resolveChatName(senderId, pushName);
  }

  private formatQuotedMessage(quoted: unknown, chatId: string): QuotedMessage | undefined {
    if (!quoted) return undefined;
    const q = quoted as QuotedMessage;
    return {
      ...q,
      senderName: this.resolveQuotedSenderName(q.sender, chatId, q.senderName),
    };
  }

  // ─── Chats ────────────────────────────────────────────────

  async upsertChat(chat: Chat): Promise<void> {
    const existing = this.chats.get(chat.id);
    const updated = existing ? { ...existing, ...chat } : chat;
    this.chats.set(chat.id, updated);

    try {
      await prisma.chat.upsert({
        where: { id: chat.id },
        create: {
          id: chat.id,
          name: chat.name,
          lastMessage: chat.lastMessage || null,
          lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
          unreadCount: chat.unreadCount || 0,
          isGroup: Boolean(chat.isGroup),
          isArchived: Boolean(chat.isArchived),
          isMuted: Boolean(chat.isMuted),
          isPinned: Boolean(chat.isPinned),
          profilePicUrl: chat.profilePicUrl || null,
        },
        update: {
          name: chat.name,
          lastMessage: chat.lastMessage || null,
          lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
          unreadCount: chat.unreadCount || 0,
          isGroup: Boolean(chat.isGroup),
          isArchived: chat.isArchived !== undefined ? Boolean(chat.isArchived) : undefined,
          isMuted: chat.isMuted !== undefined ? Boolean(chat.isMuted) : undefined,
          isPinned: chat.isPinned !== undefined ? Boolean(chat.isPinned) : undefined,
          profilePicUrl: chat.profilePicUrl || undefined,
        },
      });
    } catch (err) {
      logger.error({ err, chatId: chat.id }, "Failed to upsert chat to database");
    }
  }

  getChat(chatId: string): Chat | undefined {
    const chat = this.chats.get(chatId);
    if (!chat) return undefined;
    return {
      ...chat,
      name: this.resolveChatName(chat.id, chat.name),
    };
  }

  getChats(): Chat[] {
    return Array.from(this.chats.values())
      .map((c) => {
        const resolvedName = this.resolveChatName(c.id, c.name);
        return {
          ...c,
          name: resolvedName,
          lastMessage:
            c.lastMessage?.startsWith("[Event:") ||
            c.lastMessage === "Unsupported message" ||
            c.lastMessage === "[unknown]"
              ? ""
              : c.lastMessage,
        };
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.lastMessageTimestamp - a.lastMessageTimestamp;
      });
  }

  async getChatsFromDb(): Promise<Chat[]> {
    try {
      const dbChats = await prisma.chat.findMany({
        orderBy: [{ isPinned: "desc" }, { lastMessageTimestamp: "desc" }],
      });
      return dbChats.map((c) => {
        const resolvedName = this.resolveChatName(c.id, c.name);
        return {
          id: c.id,
          name: resolvedName,
          lastMessage:
            c.lastMessage?.startsWith("[Event:") ||
            c.lastMessage === "Unsupported message" ||
            c.lastMessage === "[unknown]"
              ? ""
              : c.lastMessage || "",
          lastMessageTimestamp: Number(c.lastMessageTimestamp),
          unreadCount: c.unreadCount,
          isGroup: c.isGroup,
          isArchived: c.isArchived,
          isMuted: c.isMuted,
          isPinned: c.isPinned,
          profilePicUrl: c.profilePicUrl || undefined,
        };
      });
    } catch (err) {
      logger.error(err, "Failed to query chats from database, fallback to cache");
      return this.getChats();
    }
  }

  async updateChatLastMessage(
    chatId: string,
    message: Message,
    isNewIncoming = false
  ): Promise<void> {
    if (
      message.type === "unknown" ||
      message.type === "reaction" ||
      message.text?.startsWith("[Event:") ||
      message.text === "Unsupported message"
    ) {
      return;
    }

    const lastMessageText = message.text || `[${message.type}]`;
    const lastTimestamp = message.timestamp;

    const chat = this.chats.get(chatId);
    let unreadCount = 0;

    if (chat) {
      const isNewer =
        !chat.lastMessageTimestamp || lastTimestamp >= chat.lastMessageTimestamp;
      if (isNewer) {
        chat.lastMessage = lastMessageText;
        chat.lastMessageTimestamp = lastTimestamp;
      }
      if (isNewIncoming && !message.fromMe) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
      unreadCount = chat.unreadCount;

      try {
        await prisma.chat.update({
          where: { id: chatId },
          data: {
            ...(isNewer
              ? {
                  lastMessage: lastMessageText,
                  lastMessageTimestamp: BigInt(lastTimestamp),
                }
              : {}),
            unreadCount,
          },
        });
      } catch (err) {
        logger.error({ err, chatId }, "Failed to update chat last message in database");
      }
    } else {
      unreadCount = isNewIncoming && !message.fromMe ? 1 : 0;
      const contact = this.contacts.get(chatId);
      const initialName =
        resolveContactDisplayName(contact, chatId) ||
        message.pushName ||
        chatId.split("@")[0];

      this.chats.set(chatId, {
        id: chatId,
        name: initialName,
        lastMessage: lastMessageText,
        lastMessageTimestamp: lastTimestamp,
        unreadCount,
        isGroup: chatId.endsWith("@g.us"),
      });

      try {
        await prisma.chat.upsert({
          where: { id: chatId },
          create: {
            id: chatId,
            name: initialName,
            lastMessage: lastMessageText,
            lastMessageTimestamp: BigInt(lastTimestamp),
            unreadCount,
            isGroup: chatId.endsWith("@g.us"),
          },
          update: {
            lastMessage: lastMessageText,
            lastMessageTimestamp: BigInt(lastTimestamp),
            unreadCount,
          },
        });
      } catch (err) {
        logger.error({ err, chatId }, "Failed to update chat last message in database");
      }
    }
  }

  async markChatRead(chatId: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.unreadCount = 0;
    }

    try {
      await prisma.chat.updateMany({
        where: { id: chatId },
        data: { unreadCount: 0 },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to mark chat as read in database");
    }
  }

  /**
   * Toggles the archived state for a chat.
   */
  async archiveChat(chatId: string, isArchived: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.isArchived = isArchived;
    }

    try {
      await prisma.chat.updateMany({
        where: { id: chatId },
        data: { isArchived },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to archive chat in database");
    }
  }

  /**
   * Toggles the muted state for a chat.
   */
  async muteChat(chatId: string, isMuted: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.isMuted = isMuted;
    }

    try {
      await prisma.chat.updateMany({
        where: { id: chatId },
        data: { isMuted },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to mute chat in database");
    }
  }

  /**
   * Toggles the pinned state for a chat.
   */
  async pinChat(chatId: string, isPinned: boolean): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.isPinned = isPinned;
    }

    try {
      await prisma.chat.updateMany({
        where: { id: chatId },
        data: { isPinned },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to pin chat in database");
    }
  }

  /**
   * Deletes a chat from cache and database (cascades messages).
   */
  async deleteChat(chatId: string): Promise<void> {
    this.chats.delete(chatId);
    try {
      await prisma.chat.deleteMany({
        where: { id: chatId },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to delete chat in database");
    }
  }

  /**
   * Updates low-res profile picture URL for a chat.
   */
  async updateChatProfilePicUrl(chatId: string, profilePicUrl: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.profilePicUrl = profilePicUrl;
    }
    try {
      await prisma.chat.updateMany({
        where: { id: chatId },
        data: { profilePicUrl },
      });
    } catch (err) {
      logger.error({ err, chatId }, "Failed to update chat profilePicUrl in database");
    }
  }

  // ─── Messages ─────────────────────────────────────────────

  async addMessage(message: Message): Promise<void> {
    if (
      message.type === "unknown" ||
      message.type === "reaction" ||
      message.text?.startsWith("[Event:") ||
      message.text === "Unsupported message"
    ) {
      return;
    }

    // Ensure quoted message senderName is populated using contact resolution
    if (message.quotedMessage) {
      message.quotedMessage.senderName = this.resolveQuotedSenderName(
        message.quotedMessage.sender,
        message.chatId,
        message.quotedMessage.senderName
      );
    }

    // Ensure message.senderName is populated using contact resolution
    if (!message.senderName) {
      message.senderName = this.resolveMessageSenderName(
        message.senderId,
        message.pushName
      );
    }

    try {
      // Ensure parent chat exists in database before inserting foreign-key message
      const chatExists = await prisma.chat.findUnique({
        where: { id: message.chatId },
        select: { id: true },
      });

      if (!chatExists) {
        await prisma.chat.create({
          data: {
            id: message.chatId,
            name: message.pushName || message.chatId.split("@")[0],
            isGroup: message.chatId.endsWith("@g.us"),
            lastMessage: message.text || `[${message.type}]`,
            lastMessageTimestamp: BigInt(message.timestamp),
          },
        });
      }

      await prisma.message.upsert({
        where: { id: message.id },
        create: {
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          timestamp: BigInt(message.timestamp),
          type: message.type,
          text: message.text || null,
          media: message.media ? (message.media as object) : undefined,
          quotedMessageId: message.quotedMessageId || null,
          quotedMessage: message.quotedMessage ? (message.quotedMessage as object) : undefined,
          fromMe: message.fromMe,
          pushName: message.pushName || null,
          status: message.status || "pending",
          isStarred: Boolean(message.isStarred),
        },
        update:
          message.chatId === "status@broadcast"
            ? { status: message.status || "pending" }
            : {
                status: message.status || "pending",
                text: message.text || null,
                isStarred: message.isStarred !== undefined ? Boolean(message.isStarred) : undefined,
              },
      });
    } catch (err) {
      logger.error({ err, messageId: message.id }, "Failed to save message to database");
    }
  }

  async addMessages(messages: Message[]): Promise<void> {
    for (const msg of messages) {
      await this.addMessage(msg);
    }
  }

  async getMessages(
    chatId: string,
    limit = 50,
    before?: number,
    around?: number
  ): Promise<Message[]> {
    try {
      let dbMessages;

      if (around) {
        const halfLimit = Math.floor(limit / 2);
        const [older, newer] = await Promise.all([
          prisma.message.findMany({
            where: { chatId, timestamp: { lte: BigInt(around) } },
            orderBy: { timestamp: "desc" },
            take: halfLimit,
          }),
          prisma.message.findMany({
            where: { chatId, timestamp: { gt: BigInt(around) } },
            orderBy: { timestamp: "asc" },
            take: Math.ceil(limit / 2),
          }),
        ]);
        const merged = [...older, ...newer];
        merged.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
        dbMessages = merged;
      } else {
        const whereClause: {
          chatId: string;
          timestamp?: { lt: bigint };
        } = { chatId };

        if (before) {
          whereClause.timestamp = { lt: BigInt(before) };
        }

        dbMessages = await prisma.message.findMany({
          where: whereClause,
          orderBy: { timestamp: "desc" },
          take: limit,
        });
      }

      // Filter out unsupported messages or events, reverse to chronological ascending order
      return dbMessages
        .filter(
          (m) =>
            m.type !== "unknown" &&
            m.type !== "reaction" &&
            m.text !== "Unsupported message" &&
            !m.text?.startsWith("[Event:")
        )
        .reverse()
        .map((m) => ({
          id: m.id,
          chatId: m.chatId,
          senderId: m.senderId,
          senderName: this.resolveMessageSenderName(m.senderId, m.pushName || undefined),
          timestamp: Number(m.timestamp),
          type: m.type as MessageType,
          text: m.text || undefined,
          media: m.media as Message["media"],
          quotedMessageId: m.quotedMessageId || undefined,
          quotedMessage: this.formatQuotedMessage(m.quotedMessage, m.chatId),
          fromMe: m.fromMe,
          status: (m.status || "pending") as MessageStatus,
          pushName: m.pushName || undefined,
          isStarred: m.isStarred,
        }));
    } catch (err) {
      logger.error({ err, chatId }, "Failed to query messages from database");
      return [];
    }
  }

  /**
   * Searches message content across all chats or within a specific chat.
   */
  async searchMessages(
    query: string,
    options?: { chatId?: string; limit?: number }
  ): Promise<SearchMessageResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const limit = Math.min(Math.max(options?.limit || 50, 1), 100);

    try {
      const whereClause: {
        text: { contains: string; mode: "insensitive" };
        type: { notIn: string[] };
        chatId: { not: string; equals?: string };
      } = {
        text: { contains: trimmed, mode: "insensitive" },
        type: { notIn: ["unknown", "reaction"] },
        chatId: {
          not: "status@broadcast",
          ...(options?.chatId ? { equals: options.chatId } : {}),
        },
      };

      const dbMessages = await prisma.message.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
        include: {
          chat: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return dbMessages
        .filter(
          (m) =>
            m.text !== "Unsupported message" &&
            !m.text?.startsWith("[Event:")
        )
        .map((m) => {
          const cachedChat = this.chats.get(m.chatId);
          const chatName = this.resolveChatName(
            m.chatId,
            cachedChat?.name || m.chat?.name
          );

          return {
            id: m.id,
            chatId: m.chatId,
            senderId: m.senderId,
            senderName: this.resolveMessageSenderName(m.senderId, m.pushName || undefined),
            timestamp: Number(m.timestamp),
            type: m.type as MessageType,
            text: m.text || undefined,
            media: m.media as Message["media"],
            quotedMessageId: m.quotedMessageId || undefined,
            quotedMessage: this.formatQuotedMessage(m.quotedMessage, m.chatId),
            fromMe: m.fromMe,
            status: (m.status || "pending") as MessageStatus,
            pushName: m.pushName || undefined,
            chatName,
            isStarred: m.isStarred,
          };
        });
    } catch (err) {
      logger.error({ err, query: trimmed }, "Failed to search messages in database");
      return [];
    }
  }

  async getMessage(chatId: string, messageId: string): Promise<Message | undefined> {
    try {
      const m = await prisma.message.findUnique({
        where: { id: messageId },
      });
      if (!m) return undefined;

      return {
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderName: this.resolveMessageSenderName(m.senderId, m.pushName || undefined),
        timestamp: Number(m.timestamp),
        type: m.type as MessageType,
        text: m.text || undefined,
        media: m.media as Message["media"],
        quotedMessageId: m.quotedMessageId || undefined,
        quotedMessage: this.formatQuotedMessage(m.quotedMessage, m.chatId),
        fromMe: m.fromMe,
        status: (m.status || "pending") as MessageStatus,
        pushName: m.pushName || undefined,
        isStarred: m.isStarred,
      };
    } catch (err) {
      logger.error({ err, messageId }, "Failed to get message from database");
      return undefined;
    }
  }

  /**
   * Gets the oldest message in a chat (used for backward pagination / fetchMessageHistory).
   */
  async getOldestMessage(chatId: string): Promise<Message | undefined> {
    try {
      const m = await prisma.message.findFirst({
        where: {
          chatId,
          type: { notIn: ["unknown", "reaction"] },
        },
        orderBy: { timestamp: "asc" },
      });
      if (!m) return undefined;
      return {
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        senderName: this.resolveMessageSenderName(m.senderId, m.pushName || undefined),
        timestamp: Number(m.timestamp),
        type: m.type as MessageType,
        text: m.text || undefined,
        media: m.media as Message["media"],
        quotedMessageId: m.quotedMessageId || undefined,
        quotedMessage: this.formatQuotedMessage(m.quotedMessage, m.chatId),
        fromMe: m.fromMe,
        status: (m.status || "pending") as MessageStatus,
        pushName: m.pushName || undefined,
        isStarred: m.isStarred,
      };
    } catch (err) {
      logger.error({ err, chatId }, "Failed to get oldest message");
      return undefined;
    }
  }

  /**
   * Toggles the starred state for a message.
   */
  async starMessage(_chatId: string, messageId: string, isStarred: boolean): Promise<void> {
    try {
      await prisma.message.updateMany({
        where: { id: messageId },
        data: { isStarred },
      });
    } catch (err) {
      logger.error({ err, messageId }, "Failed to star message in database");
    }
  }

  /**
   * Deletes a message and its media from database.
   */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      await prisma.media.deleteMany({ where: { id: messageId } });
      await prisma.message.deleteMany({ where: { id: messageId } });

      // Refresh chat last message if deleted message was the last one
      const remaining = await this.getMessages(chatId, 1);
      const chat = this.chats.get(chatId);
      if (chat) {
        if (remaining.length > 0) {
          const latest = remaining[0];
          chat.lastMessage = latest.text || `[${latest.type}]`;
          chat.lastMessageTimestamp = latest.timestamp;
        } else {
          chat.lastMessage = "";
        }
        await prisma.chat.updateMany({
          where: { id: chatId },
          data: {
            lastMessage: chat.lastMessage || null,
            lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
          },
        });
      }
    } catch (err) {
      logger.error({ err, messageId }, "Failed to delete message from database");
    }
  }

  async updateMessageStatus(
    _chatId: string,
    messageId: string,
    status: Message["status"]
  ): Promise<void> {
    try {
      await prisma.message.updateMany({
        where: { id: messageId },
        data: { status: status || "pending" },
      });
    } catch (err) {
      logger.error({ err, messageId }, "Failed to update message status in database");
    }
  }

  // ─── Status Management ────────────────────────────────────

  /**
   * Deletes a single status message and its associated media.
   */
  async deleteStatusMessage(messageId: string): Promise<void> {
    try {
      // Delete associated media first
      await prisma.media.deleteMany({ where: { id: messageId } });
      // Delete the message
      await prisma.message.deleteMany({ where: { id: messageId } });
      logger.info({ messageId }, "Deleted status message and media");
    } catch (err) {
      logger.error({ err, messageId }, "Failed to delete status message");
    }
  }

  /**
   * Deletes all status messages (and their media) posted by a single sender.
   * Returns the number of deleted statuses.
   */
  async deleteStatusesBySender(senderId: string): Promise<number> {
    try {
      const statusMessages = await prisma.message.findMany({
        where: { chatId: "status@broadcast", senderId },
        select: { id: true },
      });
      const ids = statusMessages.map((m) => m.id);

      if (ids.length > 0) {
        await prisma.media.deleteMany({ where: { id: { in: ids } } });
        await prisma.message.deleteMany({ where: { id: { in: ids } } });
      }
      logger.info({ count: ids.length }, "Deleted statuses for sender");
      return ids.length;
    } catch (err) {
      logger.error({ err }, "Failed to delete statuses for sender");
      throw err;
    }
  }

  /**
   * Clears all status broadcast messages and their associated media.
   */
  async clearAllStatuses(): Promise<void> {
    try {
      // Get all status message IDs to delete their media too
      const statusMessages = await prisma.message.findMany({
        where: { chatId: "status@broadcast" },
        select: { id: true },
      });
      const ids = statusMessages.map((m) => m.id);

      if (ids.length > 0) {
        await prisma.media.deleteMany({ where: { id: { in: ids } } });
        await prisma.message.deleteMany({ where: { chatId: "status@broadcast" } });
      }
      logger.info({ count: ids.length }, "Cleared all status messages and media");
    } catch (err) {
      logger.error(err, "Failed to clear all statuses");
    }
  }

  // ─── Contacts ─────────────────────────────────────────────

  async upsertContact(contact: Partial<Contact> & { id: string }): Promise<void> {
    const existing = this.contacts.get(contact.id);
    const name = contact.name?.trim() ? contact.name.trim() : existing?.name;
    const pushName = contact.pushName?.trim() ? contact.pushName.trim() : existing?.pushName;
    const verifiedName = contact.verifiedName?.trim() ? contact.verifiedName.trim() : existing?.verifiedName;
    const profilePicUrl = contact.profilePicUrl !== undefined ? contact.profilePicUrl : existing?.profilePicUrl;

    const merged: Contact = {
      id: contact.id,
      name,
      pushName,
      verifiedName,
      profilePicUrl,
    };
    this.contacts.set(contact.id, merged);

    try {
      await prisma.contact.upsert({
        where: { id: contact.id },
        create: {
          id: merged.id,
          name: merged.name || null,
          pushName: merged.pushName || null,
          verifiedName: merged.verifiedName || null,
          profilePicUrl: merged.profilePicUrl || null,
        },
        update: {
          ...(name ? { name } : {}),
          ...(pushName ? { pushName } : {}),
          ...(verifiedName ? { verifiedName } : {}),
          ...(profilePicUrl !== undefined ? { profilePicUrl } : {}),
        },
      });

      // If contact includes LID mapping, register it
      if (contact.lid && contact.id.endsWith("@s.whatsapp.net")) {
        this.registerLidPn(contact.lid, contact.id);
      } else if (contact.phone && contact.id.endsWith("@lid")) {
        this.registerLidPn(contact.id, contact.phone);
      }

      // If this contact corresponds to a 1-on-1 chat, update chat name in cache & DB if needed
      const targetChatIds = [contact.id];
      const mappedLid = this.pnToLid.get(contact.id);
      if (mappedLid) targetChatIds.push(mappedLid);
      const mappedPn = this.lidToPn.get(contact.id);
      if (mappedPn) targetChatIds.push(mappedPn);

      for (const targetId of targetChatIds) {
        const chat = this.chats.get(targetId);
        if (chat && !chat.isGroup) {
          const resolvedName = this.resolveChatName(chat.id, chat.name);
          if (resolvedName && chat.name !== resolvedName && resolvedName !== chat.id.split("@")[0]) {
            chat.name = resolvedName;
            await prisma.chat.updateMany({
              where: { id: chat.id },
              data: { name: resolvedName },
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err, contactId: contact.id }, "Failed to upsert contact to database");
    }
  }

  getContact(contactId: string): Contact | undefined {
    const direct = this.contacts.get(contactId);
    if (contactId.endsWith("@lid")) {
      const mappedPn = this.lidToPn.get(contactId);
      if (mappedPn) {
        const pnContact = this.contacts.get(mappedPn);
        if (pnContact) {
          return {
            ...pnContact,
            id: contactId,
            lid: contactId,
            phone: mappedPn,
            name: pnContact.name || direct?.name,
            pushName: direct?.pushName || pnContact.pushName,
            verifiedName: direct?.verifiedName || pnContact.verifiedName,
          };
        }
      }
    }
    return direct;
  }

  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  async reloadContactsFromDb(): Promise<void> {
    const dbContacts = await prisma.contact.findMany();
    for (const c of dbContacts) {
      this.contacts.set(c.id, {
        id: c.id,
        name: c.name || undefined,
        pushName: c.pushName || undefined,
        verifiedName: c.verifiedName || undefined,
        profilePicUrl: c.profilePicUrl || undefined,
      });
    }
  }

  getContactName(jid: string): string | undefined {
    const resolved = this.resolveChatName(jid);
    return resolved !== jid.split("@")[0] ? resolved : undefined;
  }

  /**
   * Synchronizes chat names from the contacts table and LID mappings.
   * Updates non-group chat names with proper contact names.
   */
  async syncChatNamesFromContacts(): Promise<number> {
    let synced = 0;
    for (const [chatId, chat] of this.chats) {
      if (chat.isGroup) continue;

      const resolved = this.resolveChatName(chatId, chat.name);
      if (resolved && chat.name !== resolved && resolved !== chatId.split("@")[0]) {
        chat.name = resolved;
        this.chats.set(chatId, chat);

        try {
          await prisma.chat.updateMany({
            where: { id: chatId },
            data: { name: resolved },
          });
          synced++;
        } catch (err) {
          logger.error({ err, chatId }, "Failed to sync chat name from contact");
        }
      }
    }
    if (synced > 0) {
      logger.info({ synced }, "Synced chat names from contacts and LID mappings");
    }
    return synced;
  }

  // ─── Media Storage ────────────────────────────────────────

  /**
   * Saves downloaded media binary buffer to PostgreSQL.
   */
  async saveMedia(
    messageId: string,
    mimetype: string,
    buffer: Buffer,
    fileName?: string,
    fileSize?: number
  ): Promise<void> {
    try {
      const bytesData = new Uint8Array(buffer);
      await prisma.media.upsert({
        where: { id: messageId },
        create: {
          id: messageId,
          mimetype,
          data: bytesData,
          fileName: fileName || null,
          fileSize: fileSize || buffer.length,
        },
        update: {
          mimetype,
          data: bytesData,
          fileName: fileName || null,
          fileSize: fileSize || buffer.length,
        },
      });
      logger.info({ messageId, size: buffer.length }, "Saved media to database");
    } catch (err) {
      logger.error({ err, messageId }, "Failed to save media to database");
    }
  }

  /**
   * Retrieves downloaded media binary buffer from PostgreSQL.
   */
  async getMedia(
    messageId: string
  ): Promise<{ buffer: Buffer; mimetype: string } | null> {
    try {
      const item = await prisma.media.findUnique({
        where: { id: messageId },
      });
      if (!item) return null;
      return {
        buffer: Buffer.from(item.data),
        mimetype: item.mimetype,
      };
    } catch (err) {
      logger.error({ err, messageId }, "Failed to get media from database");
      return null;
    }
  }

  // ─── Reset ────────────────────────────────────────────────

  async clear(): Promise<void> {
    logger.info("Clearing store and database records");
    this.chats.clear();
    this.contacts.clear();

    try {
      await prisma.message.deleteMany();
      await prisma.chat.deleteMany();
      await prisma.contact.deleteMany();
      await prisma.media.deleteMany();
    } catch (err) {
      logger.error(err, "Failed to clear database records");
    }
  }
}

// Singleton instance attached to globalThis
const globalForStore = globalThis as unknown as {
  __whatsappStore?: Store;
};

export const store = globalForStore.__whatsappStore ?? new Store();

if (!globalForStore.__whatsappStore) {
  globalForStore.__whatsappStore = store;
}
