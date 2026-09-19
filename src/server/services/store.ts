import { prisma } from "@/server/db/client";
import type { Chat, Message, Contact, MessageStatus, MessageType, QuotedMessage } from "@/types";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("store");

/**
 * PostgreSQL-backed Store for chats, messages, contacts, and media.
 * Maintains an in-memory cache of chats and contacts for sub-millisecond lookups
 * while persisting all operations transactionally to PostgreSQL.
 */
class Store {
  private chats: Map<string, Chat> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private isInitialized = false;

  constructor() {
    this.init().catch((err) => {
      logger.error(err, "Failed to initialize store from database");
    });
  }

  /**
   * Loads initial state (chats & contacts) from PostgreSQL into memory cache.
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
        });
      }

      const dbContacts = await prisma.contact.findMany();
      for (const c of dbContacts) {
        this.contacts.set(c.id, {
          id: c.id,
          name: c.name || undefined,
          pushName: c.pushName || undefined,
        });
      }

      this.isInitialized = true;
      logger.info(
        { chats: this.chats.size, contacts: this.contacts.size },
        "Loaded store from PostgreSQL"
      );
    } catch (err) {
      logger.error(err, "Error loading store from PostgreSQL");
    }
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
        },
        update: {
          name: chat.name,
          lastMessage: chat.lastMessage || null,
          lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
          unreadCount: chat.unreadCount || 0,
          isGroup: Boolean(chat.isGroup),
        },
      });
    } catch (err) {
      logger.error({ err, chatId: chat.id }, "Failed to upsert chat to database");
    }
  }

  getChat(chatId: string): Chat | undefined {
    return this.chats.get(chatId);
  }

  getChats(): Chat[] {
    return Array.from(this.chats.values()).sort(
      (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp
    );
  }

  async getChatsFromDb(): Promise<Chat[]> {
    try {
      const dbChats = await prisma.chat.findMany({
        orderBy: { lastMessageTimestamp: "desc" },
      });
      return dbChats.map((c) => ({
        id: c.id,
        name: c.name,
        lastMessage: c.lastMessage || "",
        lastMessageTimestamp: Number(c.lastMessageTimestamp),
        unreadCount: c.unreadCount,
        isGroup: c.isGroup,
        isArchived: c.isArchived,
        isMuted: c.isMuted,
      }));
    } catch (err) {
      logger.error(err, "Failed to query chats from database, fallback to cache");
      return this.getChats();
    }
  }

  async updateChatLastMessage(chatId: string, message: Message): Promise<void> {
    const lastMessageText = message.text || `[${message.type}]`;
    const lastTimestamp = message.timestamp;

    const chat = this.chats.get(chatId);
    let unreadCount = 0;

    if (chat) {
      chat.lastMessage = lastMessageText;
      chat.lastMessageTimestamp = lastTimestamp;
      if (!message.fromMe) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
      unreadCount = chat.unreadCount;
    } else {
      unreadCount = message.fromMe ? 0 : 1;
      this.chats.set(chatId, {
        id: chatId,
        name: message.pushName || chatId.split("@")[0],
        lastMessage: lastMessageText,
        lastMessageTimestamp: lastTimestamp,
        unreadCount,
        isGroup: chatId.endsWith("@g.us"),
      });
    }

    try {
      await prisma.chat.upsert({
        where: { id: chatId },
        create: {
          id: chatId,
          name: message.pushName || chatId.split("@")[0],
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

  // ─── Messages ─────────────────────────────────────────────

  async addMessage(message: Message): Promise<void> {
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
        },
        update: {
          status: message.status || "pending",
          text: message.text || null,
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

  async getMessages(chatId: string, limit = 50, before?: number): Promise<Message[]> {
    try {
      const whereClause: {
        chatId: string;
        timestamp?: { lt: bigint };
      } = { chatId };

      if (before) {
        whereClause.timestamp = { lt: BigInt(before) };
      }

      const dbMessages = await prisma.message.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
      });

      // Reverse so messages are in chronological ascending order
      return dbMessages.reverse().map((m) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        timestamp: Number(m.timestamp),
        type: m.type as MessageType,
        text: m.text || undefined,
        media: m.media as Message["media"],
        quotedMessageId: m.quotedMessageId || undefined,
        quotedMessage: m.quotedMessage ? (m.quotedMessage as unknown as QuotedMessage) : undefined,
        fromMe: m.fromMe,
        status: (m.status || "pending") as MessageStatus,
        pushName: m.pushName || undefined,
      }));
    } catch (err) {
      logger.error({ err, chatId }, "Failed to query messages from database");
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
        timestamp: Number(m.timestamp),
        type: m.type as MessageType,
        text: m.text || undefined,
        media: m.media as Message["media"],
        quotedMessageId: m.quotedMessageId || undefined,
        quotedMessage: m.quotedMessage ? (m.quotedMessage as unknown as QuotedMessage) : undefined,
        fromMe: m.fromMe,
        status: (m.status || "pending") as MessageStatus,
        pushName: m.pushName || undefined,
      };
    } catch (err) {
      logger.error({ err, messageId }, "Failed to get message from database");
      return undefined;
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

  async upsertContact(contact: Contact): Promise<void> {
    const existing = this.contacts.get(contact.id);
    this.contacts.set(contact.id, existing ? { ...existing, ...contact } : contact);

    try {
      await prisma.contact.upsert({
        where: { id: contact.id },
        create: {
          id: contact.id,
          name: contact.name || null,
          pushName: contact.pushName || null,
        },
        update: {
          name: contact.name || null,
          pushName: contact.pushName || null,
        },
      });
    } catch (err) {
      logger.error({ err, contactId: contact.id }, "Failed to upsert contact to database");
    }
  }

  getContact(contactId: string): Contact | undefined {
    return this.contacts.get(contactId);
  }

  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  getContactName(jid: string): string | undefined {
    const contact = this.contacts.get(jid);
    return contact?.name || contact?.pushName;
  }

  /**
   * Synchronizes chat names from the contacts table.
   * Updates chat names that are currently just JID-based with proper contact names.
   */
  async syncChatNamesFromContacts(): Promise<void> {
    let synced = 0;
    for (const [chatId, chat] of this.chats) {
      const contactName = this.getContactName(chatId);
      if (!contactName) continue;

      // Only update if current name looks like a JID (no spaces, contains digits)
      const currentName = chat.name;
      const looksLikeJid =
        !currentName ||
        /^\d+$/.test(currentName) ||
        currentName.includes("@");

      if (looksLikeJid) {
        chat.name = contactName;
        this.chats.set(chatId, chat);

        try {
          await prisma.chat.updateMany({
            where: { id: chatId },
            data: { name: contactName },
          });
          synced++;
        } catch (err) {
          logger.error({ err, chatId }, "Failed to sync chat name from contact");
        }
      }
    }
    if (synced > 0) {
      logger.info({ synced }, "Synced chat names from contacts");
    }
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
      await prisma.media.upsert({
        where: { id: messageId },
        create: {
          id: messageId,
          mimetype,
          data: buffer,
          fileName: fileName || null,
          fileSize: fileSize || buffer.length,
        },
        update: {
          mimetype,
          data: buffer,
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
