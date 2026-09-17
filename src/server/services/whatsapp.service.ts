import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
  type BaileysEventMap,
  type ConnectionState,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { createLogger } from "@/server/lib/logger";
import { store } from "@/server/services/store";
import { transformMessage, normalizeJid, mapMessageStatus } from "@/server/lib/message-transformer";
import type {
  WhatsAppConnectionState,
  Chat,
  ConnectionUpdate,
  Message,
} from "@/types";

const logger = createLogger("whatsapp-service");

const AUTH_DIR = path.join(process.cwd(), "data", "whatsapp", "auth");
const MAX_RECONNECT_RETRIES = 5;
const BROWSER_IDENTITY: [string, string, string] = [
  "Homelab WhatsApp",
  "Chrome",
  "127.0.0",
];

/**
 * Centralized WhatsApp service — singleton that wraps Baileys.
 * All Baileys events flow through this service. Frontend never touches Baileys.
 *
 * Emits typed events that the Socket.IO layer subscribes to.
 */
class WhatsAppService extends EventEmitter {
  private socket: WASocket | null = null;
  private connectionState: WhatsAppConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private currentQrCode: string | null = null;
  private isConnecting = false;
  private isExplicitDisconnect = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private rawMessages = new Map<string, WAMessage>();

  getConnectionState(): WhatsAppConnectionState {
    return this.connectionState;
  }

  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async cleanupSocket(): Promise<void> {
    this.clearReconnectTimer();
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.end(undefined);
      } catch (err) {
        logger.error(err, "Error closing socket");
      }
      this.socket = null;
    }
  }

  /**
   * Initializes the Baileys socket and connects to WhatsApp.
   * Persists auth state to filesystem (data/whatsapp/auth/).
   */
  async connect(): Promise<void> {
    if (this.isConnected() && this.socket) {
      logger.info("Already connected to WhatsApp, skipping duplicate connect");
      return;
    }

    if (this.isConnecting) {
      logger.info("Connection attempt already in progress, skipping");
      return;
    }

    this.clearReconnectTimer();
    this.isExplicitDisconnect = false;
    this.isConnecting = true;

    if (this.socket) {
      logger.warn("Stale socket exists, disconnecting first");
      await this.cleanupSocket();
    }

    this.updateState("connecting");

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      logger.info({ version }, "Connecting to WhatsApp");

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: BROWSER_IDENTITY,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        fireInitQueries: false,
        defaultQueryTimeoutMs: 120000,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        getMessage: async (key) => {
          if (!key.id) return undefined;
          const raw = this.rawMessages.get(key.id);
          return raw?.message ?? undefined;
        },
      });

      this.socket = sock;

      // ─── Connection Updates ──────────────────────────────
      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        this.handleConnectionUpdate(update);
      });

      // ─── Credential Updates ──────────────────────────────
      sock.ev.on("creds.update", saveCreds);

      // ─── Message Events ──────────────────────────────────
      sock.ev.on("messages.upsert", (event: BaileysEventMap["messages.upsert"]) => {
        this.handleMessagesUpsert(event);
      });

      sock.ev.on("messages.update", (updates: BaileysEventMap["messages.update"]) => {
        this.handleMessagesUpdate(updates);
      });

      // ─── Chat Events ─────────────────────────────────────
      sock.ev.on("chats.upsert", (chats: BaileysEventMap["chats.upsert"]) => {
        this.handleChatsUpsert(chats);
      });

      sock.ev.on("chats.update", (updates: BaileysEventMap["chats.update"]) => {
        this.handleChatsUpdate(updates);
      });

      // ─── Contact Events ──────────────────────────────────
      sock.ev.on("contacts.upsert", (contacts: BaileysEventMap["contacts.upsert"]) => {
        this.handleContactsUpsert(contacts);
      });

      sock.ev.on("contacts.update", (updates: BaileysEventMap["contacts.update"]) => {
        this.handleContactsUpdate(updates);
      });

      // ─── History Sync ────────────────────────────────────
      sock.ev.on(
        "messaging-history.set",
        (data: BaileysEventMap["messaging-history.set"]) => {
          this.handleHistorySync(data);
        }
      );

      // ─── Presence Updates ────────────────────────────────
      sock.ev.on("presence.update", (presence: BaileysEventMap["presence.update"]) => {
        this.handlePresenceUpdate(presence);
      });
    } catch (error) {
      this.isConnecting = false;
      logger.error(error, "Failed to connect to WhatsApp");
      this.updateState("error", undefined, (error as Error).message);
      throw error;
    }
  }

  /**
   * Gracefully disconnects without clearing auth state.
   */
  async disconnect(): Promise<void> {
    this.isExplicitDisconnect = true;
    this.isConnecting = false;
    await this.cleanupSocket();
    this.reconnectAttempts = 0;
    this.currentQrCode = null;
    this.updateState("disconnected");
  }

  /**
   * Logs out, clears auth state, and disconnects.
   */
  async logout(): Promise<void> {
    this.isExplicitDisconnect = true;
    this.isConnecting = false;
    this.clearReconnectTimer();
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners("connection.update");
        await this.socket.logout();
      } catch (error) {
        logger.error(error, "Error during logout");
      }
      this.socket = null;
    }
    this.reconnectAttempts = 0;
    this.currentQrCode = null;
    this.clearAuthState();
    store.clear();
    this.updateState("logged_out");
  }

  /**
   * Sends a text message through the connected WhatsApp session.
   */
  async sendMessage(chatId: string, text: string): Promise<Message | null> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@")
        ? chatId
        : `${chatId}@s.whatsapp.net`;

      const sent = await this.socket.sendMessage(targetJid, { text });
      if (sent) {
        if (sent.key?.id && sent.message) {
          this.rawMessages.set(sent.key.id, sent);
        }
        const transformed = transformMessage(sent);
        if (transformed) {
          store.addMessage(transformed);
          store.updateChatLastMessage(transformed.chatId, transformed);
          this.emit("message:sent", { message: transformed });
          return transformed;
        }
      }
      return null;
    } catch (error) {
      logger.error(error, "Failed to send message");
      throw error;
    }
  }

  /**
   * Returns the raw WAMessage for a given message ID.
   */
  getRawMessage(messageId: string): WAMessage | undefined {
    return this.rawMessages.get(messageId);
  }

  /**
   * Downloads media from a message, returning the buffer and mimetype.
   * Checks database cache first before attempting download via Baileys.
   */
  async downloadMedia(
    messageId: string
  ): Promise<{ buffer: Buffer; mimetype: string } | null> {
    // 1. Check database cache first
    const cached = await store.getMedia(messageId);
    if (cached) {
      return cached;
    }

    // 2. Look up raw message in memory for Baileys download
    const raw = this.rawMessages.get(messageId);
    if (!raw) {
      logger.warn({ messageId }, "Raw message not found for media download");
      return null;
    }

    try {
      const buffer = await downloadMediaMessage(raw, "buffer", {});

      // Extract mimetype from the message content
      const content =
        raw.message?.imageMessage ||
        raw.message?.videoMessage ||
        raw.message?.audioMessage ||
        raw.message?.documentMessage ||
        raw.message?.stickerMessage;

      const mimetype = content?.mimetype || "application/octet-stream";
      const mediaBuffer = buffer as Buffer;

      // 3. Cache to database so it survives server restarts
      await store.saveMedia(messageId, mimetype, mediaBuffer);

      return { buffer: mediaBuffer, mimetype };
    } catch (error) {
      logger.error(error, "Failed to download media");
      return null;
    }
  }

  /**
   * Marks a chat as read.
   */
  async markChatRead(chatId: string): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      const messages = await store.getMessages(chatId, 1);
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        await this.socket.readMessages([
          {
            remoteJid: chatId,
            id: lastMsg.id,
            participant: chatId.endsWith("@g.us")
              ? lastMsg.senderId
              : undefined,
          },
        ]);
        store.markChatRead(chatId);
        const chat = store.getChat(chatId);
        if (chat) {
          this.emit("chat:updated", { chat });
        }
      }
    } catch (error) {
      logger.error(error, "Failed to mark chat as read");
    }
  }

  // ─── Private Event Handlers ─────────────────────────────────

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.currentQrCode = qr;
      this.updateState("qr", qr);
      logger.info("QR code generated");
    }

    if (connection === "open") {
      logger.info("Connected to WhatsApp");
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.currentQrCode = null;
      this.clearReconnectTimer();
      this.updateState("connected");
      return;
    }

    if (connection === "close") {
      this.isConnecting = false;
      this.currentQrCode = null;
      this.clearReconnectTimer();

      if (this.isExplicitDisconnect) {
        logger.info("WhatsApp socket closed intentionally, skipping reconnect");
        this.socket = null;
        return;
      }

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.info({ statusCode, err: lastDisconnect?.error }, "WhatsApp connection closed");

      if (statusCode === DisconnectReason.loggedOut) {
        logger.info("Logged out from WhatsApp");
        this.clearAuthState();
        this.updateState("logged_out");
        this.socket = null;
        store.clear();
        return;
      }

      const isRestartRequired = statusCode === DisconnectReason.restartRequired;

      if (this.reconnectAttempts < MAX_RECONNECT_RETRIES) {
        this.reconnectAttempts++;
        const delay = isRestartRequired
          ? 1000
          : Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        logger.info(
          { attempt: this.reconnectAttempts, delay, statusCode },
          "Reconnecting to WhatsApp"
        );
        this.updateState("reconnecting");
        this.socket = null;

        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect().catch((err) => {
            logger.error(err, "Reconnect attempt failed");
          });
        }, delay);
      } else {
        logger.error("Max reconnect attempts reached");
        this.updateState("error", undefined, "Max reconnect attempts reached");
        this.socket = null;
      }
    }
  }

  private handleMessagesUpsert(event: BaileysEventMap["messages.upsert"]): void {
    const { messages, type } = event;

    for (const raw of messages) {
      if (raw.key?.id && raw.message) {
        this.rawMessages.set(raw.key.id, raw);
      }

      const isStatusBroadcast = raw.key?.remoteJid === "status@broadcast";
      const isNewsletter = raw.key?.remoteJid?.endsWith("@newsletter") ?? false;
      const isReaction = !!raw.message?.reactionMessage;

      // ─── Reactions: don't store as messages, don't update chat ───
      if (isReaction) {
        logger.info(
          { chatId: raw.key?.remoteJid, from: raw.pushName },
          "Reaction received (ignored from chat)"
        );
        continue;
      }

      const message = transformMessage(raw);
      if (!message) continue;

      // ─── Status broadcasts: store message but don't update chat list ───
      if (isStatusBroadcast) {
        logger.info(
          { from: raw.pushName, type: message.type },
          "Status broadcast received (excluded from chat list)"
        );
        store.addMessage(message);
        if (type === "notify") {
          this.emit("message:received", { message });
        }
        continue;
      }

      // ─── Newsletters/Channels: store message but don't update chat list ───
      if (isNewsletter) {
        logger.info(
          { channelId: raw.key?.remoteJid, type: message.type },
          "Newsletter message received (excluded from chat list)"
        );
        store.addMessage(message);
        if (type === "notify") {
          this.emit("message:received", { message });
        }
        continue;
      }

      // ─── Regular chat messages ───
      store.addMessage(message);
      store.updateChatLastMessage(message.chatId, message);

      // Only emit realtime events for new incoming messages
      if (type === "notify") {
        this.emit("message:received", { message });
        const chat = store.getChat(message.chatId);
        if (chat) {
          this.emit("chat:updated", { chat });
        }
      }
    }
  }

  private handleMessagesUpdate(
    updates: BaileysEventMap["messages.update"]
  ): void {
    for (const update of updates) {
      if (!update.key?.id || !update.key?.remoteJid) continue;

      const chatId = normalizeJid(update.key.remoteJid);
      const messageId = update.key.id;

      if (update.update?.status) {
        const status = mapMessageStatus(update.update.status);
        store.updateMessageStatus(chatId, messageId, status);
        this.emit("message:updated", { messageId, chatId, status });
      }
    }
  }

  private handleChatsUpsert(rawChats: BaileysEventMap["chats.upsert"]): void {
    for (const raw of rawChats) {
      const chatId = normalizeJid(raw.id);
      // Skip status broadcast — not a real chat
      if (chatId === "status@broadcast") continue;
      const chat: Chat = {
        id: chatId,
        name: raw.name || store.getContactName(chatId) || chatId.split("@")[0],
        lastMessage: "",
        lastMessageTimestamp: Number(raw.conversationTimestamp) || 0,
        unreadCount: raw.unreadCount || 0,
        isGroup: chatId.endsWith("@g.us"),
      };
      store.upsertChat(chat);
      this.emit("chat:updated", { chat });
    }
  }

  private handleChatsUpdate(updates: BaileysEventMap["chats.update"]): void {
    for (const update of updates) {
      if (!update.id) continue;
      const chatId = normalizeJid(update.id);
      // Skip status broadcast — not a real chat
      if (chatId === "status@broadcast") continue;
      const existing = store.getChat(chatId);
      if (existing) {
        if (update.name) existing.name = update.name;
        if (update.unreadCount !== undefined && update.unreadCount !== null) {
          existing.unreadCount = update.unreadCount;
        }
        if (update.conversationTimestamp) {
          existing.lastMessageTimestamp = Number(update.conversationTimestamp);
        }
        store.upsertChat(existing);
        this.emit("chat:updated", { chat: existing });
      }
    }
  }

  private handleContactsUpsert(
    contacts: BaileysEventMap["contacts.upsert"]
  ): void {
    for (const raw of contacts) {
      const contactId = normalizeJid(raw.id);
      store.upsertContact({
        id: contactId,
        name: raw.name || undefined,
        pushName: raw.notify || undefined,
      });

      // Update chat name if we now know the contact name
      const chat = store.getChat(contactId);
      if (chat && (raw.name || raw.notify)) {
        chat.name = raw.name || raw.notify || chat.name;
        store.upsertChat(chat);
        this.emit("chat:updated", { chat });
      }
    }
  }

  private handleContactsUpdate(
    updates: BaileysEventMap["contacts.update"]
  ): void {
    for (const update of updates) {
      if (!update.id) continue;
      const contactId = normalizeJid(update.id);
      const existing = store.getContact(contactId);
      if (existing) {
        if (update.name) existing.name = update.name;
        if (update.notify) existing.pushName = update.notify;
        store.upsertContact(existing);
      }
    }
  }

  private handleHistorySync(
    data: BaileysEventMap["messaging-history.set"]
  ): void {
    const { chats, contacts, messages: syncMessages } = data;

    logger.info(
      {
        chats: chats?.length || 0,
        contacts: contacts?.length || 0,
        messages: syncMessages?.length || 0,
      },
      "Processing history sync"
    );

    // Process contacts
    if (contacts) {
      for (const raw of contacts) {
        const contactId = normalizeJid(raw.id);
        store.upsertContact({
          id: contactId,
          name: raw.name || undefined,
          pushName: raw.notify || undefined,
        });
      }
    }

    // Process chats
    if (chats) {
      for (const raw of chats) {
        const chatId = normalizeJid(raw.id);
        const contactName = store.getContactName(chatId);
        store.upsertChat({
          id: chatId,
          name: raw.name || contactName || chatId.split("@")[0],
          lastMessage: "",
          lastMessageTimestamp: Number(raw.conversationTimestamp) || 0,
          unreadCount: raw.unreadCount || 0,
          isGroup: chatId.endsWith("@g.us"),
        });
      }
    }

    // Process messages
    if (syncMessages) {
      for (const raw of syncMessages) {
        if (raw.key?.id && raw.message) {
          this.rawMessages.set(raw.key.id, raw);
        }
        const message = transformMessage(raw);
        if (message) {
          store.addMessage(message);
          store.updateChatLastMessage(message.chatId, message);
        }
      }
    }

    // Emit full chat list update after sync
    this.emit("history:synced");
  }

  private handlePresenceUpdate(
    presence: BaileysEventMap["presence.update"]
  ): void {
    const chatId = normalizeJid(presence.id);
    const presences = presence.presences;

    for (const [participantJid, presenceData] of Object.entries(presences)) {
      const senderId = normalizeJid(participantJid);
      const isTyping =
        presenceData.lastKnownPresence === "composing" ||
        presenceData.lastKnownPresence === "recording";

      this.emit("typing:updated", {
        chatId,
        senderId,
        isTyping,
      });
    }
  }

  private clearAuthState(): void {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        logger.info("Cleared auth directory");
      }
    } catch (err) {
      logger.error(err, "Failed to clear auth directory");
    }
  }

  private updateState(
    state: WhatsAppConnectionState,
    qrCode?: string,
    error?: string
  ): void {
    this.connectionState = state;
    const update: ConnectionUpdate = { state, qrCode, error };
    this.emit("whatsapp:connection", update);
    logger.info({ state }, "WhatsApp connection state changed");
  }
}

// Singleton instance
// Attach to globalThis for Next.js bundler compatibility
const globalForWhatsApp = globalThis as unknown as {
  __whatsappService?: WhatsAppService;
};

export const whatsappService =
  globalForWhatsApp.__whatsappService ?? new WhatsAppService();

if (!globalForWhatsApp.__whatsappService) {
  globalForWhatsApp.__whatsappService = whatsappService;
}
