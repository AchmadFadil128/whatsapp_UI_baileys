import net from "node:net";
if (typeof (net as any).setDefaultAutoSelectFamily === "function") {
  (net as any).setDefaultAutoSelectFamily(false);
}
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
  type WASocket,
  type WAMessage,
  type BaileysEventMap,
  type ConnectionState,
  type proto,
  type MinimalMessage,
  type CacheStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import NodeCache from "@cacheable/node-cache";
import { createLogger } from "@/server/lib/logger";
import { store } from "@/server/services/store";
import {
  transformMessage,
  normalizeJid,
  mapMessageStatus,
  unwrapMessage,
  extractParticipant,
} from "@/server/lib/message-transformer";
import type {
  WhatsAppConnectionState,
  Chat,
  ConnectionUpdate,
  Message,
} from "@/types";

const logger = createLogger("whatsapp-service");

const AUTH_DIR = path.join(process.cwd(), "data", "whatsapp", "auth");
const MAX_RECONNECT_RETRIES = 5;
const STATUS_BROADCAST_JID = "status@broadcast";
const BROWSER_IDENTITY: [string, string, string] = [
  "Homelab WhatsApp",
  "Chrome",
  "127.0.0",
];

/**
 * Adapter ensuring NodeCache fully satisfies Baileys' CacheStore generic contract.
 */
class NodeCacheAdapter implements CacheStore {
  private cache: NodeCache<any>;

  constructor(options?: { stdTTL?: number; useClones?: boolean }) {
    this.cache = new NodeCache(options);
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  del(key: string): void {
    this.cache.del(key);
  }

  flushAll(): void {
    this.cache.flushAll?.();
  }
}

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

  private currentPairingCode: string | null = null;

  // Persistent caches across reconnects to prevent Bad MAC, retry loops, and Signal session desync
  private msgRetryCounterCache = new NodeCacheAdapter({
    stdTTL: 3600,
    useClones: false,
  });
  private keyCache = new NodeCacheAdapter({
    stdTTL: 300,
    useClones: false,
  });

  getConnectionState(): WhatsAppConnectionState {
    return this.connectionState;
  }

  getCurrentQrCode(): string | null {
    return this.currentQrCode;
  }

  getCurrentPairingCode(): string | null {
    return this.currentPairingCode;
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
      const sock = this.socket;
      this.socket = null;
      try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("messages.upsert");
        sock.ev.removeAllListeners("messages.update");
        sock.ev.removeAllListeners("chats.upsert");
        sock.ev.removeAllListeners("chats.update");
        sock.ev.removeAllListeners("chats.phoneNumberShare");
        sock.ev.removeAllListeners("contacts.upsert");
        sock.ev.removeAllListeners("contacts.update");
        sock.ev.removeAllListeners("messaging-history.set");
        sock.ev.removeAllListeners("presence.update");
        try {
          sock.ws?.close();
        } catch {
          // ignore
        }
        sock.end(undefined);
      } catch (err) {
        logger.error(err, "Error closing socket");
      }
    }
  }

  /**
   * Initializes the Baileys socket and connects to WhatsApp.
   * Persists auth state to filesystem (data/whatsapp/auth/).
   */
  async connect(isRetry = false): Promise<void> {
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
    if (!isRetry) {
      this.reconnectAttempts = 0;
    }

    if (this.socket) {
      logger.warn("Stale socket exists, disconnecting first");
      await this.cleanupSocket();
    }

    this.updateState("connecting");

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      if (state.creds?.me) {
        store.setUserJid(state.creds.me.id, state.creds.me.lid);
      }
      const { version } = await fetchLatestBaileysVersion();

      logger.info({ version }, "Connecting to WhatsApp");

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger, this.keyCache),
        },
        msgRetryCounterCache: this.msgRetryCounterCache,
        browser: Browsers.ubuntu("Chrome"),
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
        fireInitQueries: false,
        defaultQueryTimeoutMs: 120000,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        getMessage: async (key) => {
          if (!key.id) return undefined;
          const raw = this.rawMessages.get(key.id);
          if (raw?.message) {
            return raw.message;
          }

          // Fallback to database store to fulfill retry requests from peer devices
          try {
            const chatId = normalizeJid(key.remoteJid);
            const dbMsg = await store.getMessage(chatId, key.id);
            if (dbMsg) {
              if (dbMsg.type === "text" && dbMsg.text) {
                return {
                  conversation: dbMsg.text,
                };
              }
              if (dbMsg.media) {
                if (dbMsg.type === "image") {
                  return {
                    imageMessage: {
                      caption: dbMsg.text || dbMsg.media.caption || "",
                      mimetype: dbMsg.media.mimetype,
                    },
                  };
                }
                if (dbMsg.type === "video") {
                  return {
                    videoMessage: {
                      caption: dbMsg.text || dbMsg.media.caption || "",
                      mimetype: dbMsg.media.mimetype,
                    },
                  };
                }
                if (dbMsg.type === "audio") {
                  return {
                    audioMessage: {
                      mimetype: dbMsg.media.mimetype,
                    },
                  };
                }
                if (dbMsg.type === "document") {
                  return {
                    documentMessage: {
                      title: dbMsg.media.fileName,
                      fileName: dbMsg.media.fileName,
                      mimetype: dbMsg.media.mimetype,
                    },
                  };
                }
              }
            }
          } catch (err) {
            logger.warn({ err, key }, "Failed to fetch message for getMessage callback");
          }

          return undefined;
        },
      });

      this.socket = sock;

      // ─── Connection Updates ──────────────────────────────
      sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        this.handleConnectionUpdate(update);
      });

      // ─── Credential Updates ──────────────────────────────
      sock.ev.on("creds.update", async () => {
        try {
          await saveCreds();
        } catch (err) {
          logger.error(err, "Failed to save credentials");
        }
        if (sock.user) {
          store.setUserJid(sock.user.id, sock.user.lid);
        }
      });

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

      sock.ev.on("chats.phoneNumberShare", ({ lid, jid }: { lid: string; jid: string }) => {
        if (lid && jid) {
          store.registerLidPn(lid, jid);
          store.syncChatNamesFromContacts().then(() => {
            const chat = store.getChat(normalizeJid(lid));
            if (chat) this.emit("chat:updated", { chat });
          }).catch(() => {});
        }
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
   * Requests a pairing code for linking via phone number instead of QR scan.
   * If socket is not yet connected or connecting, starts the connection first
   * and waits for readiness before calling sock.requestPairingCode().
   *
   * @param phoneNumber - digits only with country code, no +/spaces/dashes
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    const sanitized = phoneNumber.replace(/\D/g, "");
    if (!sanitized || sanitized.length < 7) {
      throw new Error("Invalid phone number. Include country code, digits only.");
    }

    if (this.isConnected()) {
      throw new Error("Device is already connected to WhatsApp.");
    }

    // If socket is not yet started or disconnected, start connect()
    if (
      !this.socket ||
      this.connectionState === "disconnected" ||
      this.connectionState === "logged_out" ||
      this.connectionState === "error"
    ) {
      logger.info("Initializing connection for pairing code request...");
      await this.connect();
    }

    // If socket is connecting and waiting for readiness (QR event is the readiness signal in Baileys)
    if (
      this.socket &&
      !this.currentQrCode &&
      !this.currentPairingCode &&
      !this.isConnected()
    ) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout waiting for WhatsApp connection readiness"));
        }, 30000);

        const onConnection = (update: ConnectionUpdate) => {
          if (update.qrCode || update.state === "qr") {
            cleanup();
            resolve();
          } else if (update.state === "connected") {
            cleanup();
            resolve();
          } else if (update.state === "error") {
            cleanup();
            reject(new Error(update.error || "Connection error while waiting to pair"));
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.off("whatsapp:connection", onConnection);
        };

        this.on("whatsapp:connection", onConnection);
      });
    }

    if (!this.socket) {
      throw new Error("WhatsApp socket not initialized.");
    }

    if (this.socket.authState.creds.registered) {
      throw new Error("Device is already registered. No pairing needed.");
    }

    try {
      const code = await this.socket.requestPairingCode(sanitized);
      this.currentPairingCode = code;
      this.updateState("pairing", undefined, undefined, code);
      logger.info({ code }, "Pairing code generated");
      return code;
    } catch (error) {
      logger.error(error, "Failed to request pairing code");
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
    this.currentPairingCode = null;
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
        await this.socket.logout();
      } catch (error) {
        logger.error(error, "Error during logout");
      }
      await this.cleanupSocket();
    }
    this.reconnectAttempts = 0;
    this.currentQrCode = null;
    this.currentPairingCode = null;
    this.clearAuthState();
    this.msgRetryCounterCache.flushAll?.();
    this.keyCache.flushAll?.();
    // Chat history is kept persistent — only auth state is cleared
    this.updateState("logged_out");
  }

  /**
   * Sends a text message through the connected WhatsApp session.
   */
  async sendMessage(chatId: string, text: string, replyToMessageId?: string): Promise<Message | null> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@")
        ? chatId
        : `${chatId}@s.whatsapp.net`;

      let options: any = {};
      if (replyToMessageId) {
        let rawMsg = this.rawMessages.get(replyToMessageId);
        
        // Fallback to database if not in memory cache
        if (!rawMsg) {
          const dbMsg = await store.getMessage(chatId, replyToMessageId);
          if (dbMsg) {
            rawMsg = {
              key: {
                id: dbMsg.id,
                remoteJid: dbMsg.chatId,
                participant: dbMsg.senderId !== "me" ? dbMsg.senderId : undefined,
                fromMe: dbMsg.fromMe,
              },
              message: {
                conversation: dbMsg.text || "",
              },
            } as any;
          }
        }
        
        if (rawMsg) {
          options.quoted = rawMsg;
        }
      }

      const sent = await this.socket.sendMessage(targetJid, { text }, options);
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
   * Sends a media message (image, video, audio, document) through the connected WhatsApp session.
   */
  async sendMediaMessage(
    chatId: string,
    buffer: Buffer,
    mimetype: string,
    fileName?: string,
    caption?: string,
    replyToMessageId?: string
  ): Promise<Message | null> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@")
        ? chatId
        : `${chatId}@s.whatsapp.net`;

      let messagePayload: any = {};
      if (mimetype.startsWith("image/")) {
        messagePayload = { image: buffer, mimetype, caption: caption || undefined };
      } else if (mimetype.startsWith("video/")) {
        messagePayload = { video: buffer, mimetype, caption: caption || undefined };
      } else if (mimetype.startsWith("audio/")) {
        messagePayload = { audio: buffer, mimetype, ptt: false };
      } else {
        messagePayload = { document: buffer, mimetype, caption: caption || undefined, fileName: fileName || "document" };
      }

      let options: any = {};
      if (replyToMessageId) {
        let rawMsg = this.rawMessages.get(replyToMessageId);
        
        // Fallback to database if not in memory cache
        if (!rawMsg) {
          const dbMsg = await store.getMessage(chatId, replyToMessageId);
          if (dbMsg) {
            rawMsg = {
              key: {
                id: dbMsg.id,
                remoteJid: dbMsg.chatId,
                participant: dbMsg.senderId !== "me" ? dbMsg.senderId : undefined,
                fromMe: dbMsg.fromMe,
              },
              message: {
                conversation: dbMsg.text || "",
              },
            } as any;
          }
        }
        
        if (rawMsg) {
          options.quoted = rawMsg;
        }
      }

      const sent = await this.socket.sendMessage(targetJid, messagePayload, options);

      if (sent) {
        if (sent.key?.id && sent.message) {
          this.rawMessages.set(sent.key.id, sent);
        }
        const transformed = transformMessage(sent);
        if (transformed) {
          store.addMessage(transformed);
          store.updateChatLastMessage(transformed.chatId, transformed);
          this.emit("message:sent", { message: transformed });

          // Cache the media buffer to database
          if (sent.key?.id) {
            store.saveMedia(sent.key.id, mimetype, buffer);
          }

          return transformed;
        }
      }
      return null;
    } catch (error) {
      logger.error(error, "Failed to send image message");
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

      // Extract mimetype from unwrapped message content
      const unwrapped = unwrapMessage(raw.message);
      const content =
        unwrapped?.imageMessage ||
        unwrapped?.ptvMessage ||
        unwrapped?.videoMessage ||
        unwrapped?.audioMessage ||
        unwrapped?.documentMessage ||
        unwrapped?.stickerMessage;

      const mimetype = content?.mimetype || "application/octet-stream";
      const mediaBuffer = buffer as Buffer;

      // 3. Cache to database so it survives server restarts
      await store.saveMedia(messageId, mimetype, mediaBuffer);

      return { buffer: mediaBuffer, mimetype };
    } catch (error) {
      logger.error({ error, messageId }, "Failed to download media via Baileys");
      return null;
    }
  }

  /**
   * Helper to retrieve the latest message in a chat formatted as MinimalMessage
   * for Baileys chatModify reconciliation.
   */
  private async getLastMessageForChat(jid: string): Promise<MinimalMessage | null> {
    const messages = await store.getMessages(jid, 1);
    if (!messages || messages.length === 0) return null;
    const last = messages[messages.length - 1];
    const raw = this.rawMessages.get(last.id);
    if (raw?.key && raw.messageTimestamp) {
      return {
        key: raw.key,
        messageTimestamp: raw.messageTimestamp,
      };
    }
    return {
      key: {
        remoteJid: jid,
        id: last.id,
        fromMe: last.fromMe,
        participant:
          jid.endsWith("@g.us") && !last.fromMe
            ? last.senderId.includes("@")
              ? last.senderId
              : `${last.senderId}@s.whatsapp.net`
            : undefined,
      },
      messageTimestamp: last.timestamp,
    };
  }

  /**
   * Marks a chat as read or unread via Baileys native readMessages and chatModify.
   */
  async markChatRead(chatId: string, markRead: boolean = true): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const lastMsg = await this.getLastMessageForChat(targetJid);

      if (markRead) {
        if (lastMsg?.key) {
          await this.socket.readMessages([lastMsg.key]);
        }
        await this.socket.chatModify(
          { markRead: true, lastMessages: lastMsg ? [lastMsg] : [] },
          targetJid
        );
        await store.markChatRead(chatId);
      } else {
        await this.socket.chatModify(
          { markRead: false, lastMessages: lastMsg ? [lastMsg] : [] },
          targetJid
        );
      }

      const chat = store.getChat(chatId);
      if (chat) {
        if (!markRead) {
          chat.unreadCount = Math.max(chat.unreadCount, 1);
          await store.upsertChat(chat);
        }
        this.emit("chat:updated", { chat });
      }
    } catch (error) {
      logger.error({ error, chatId, markRead }, "Failed to update chat read status");
    }
  }

  /**
   * Archives or unarchives a chat using Baileys chatModify.
   */
  async archiveChat(chatId: string, archive: boolean): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const lastMsg = await this.getLastMessageForChat(targetJid);

      await this.socket.chatModify(
        {
          archive,
          lastMessages: lastMsg ? [lastMsg] : [],
        },
        targetJid
      );

      await store.archiveChat(chatId, archive);
      const chat = store.getChat(chatId);
      if (chat) {
        this.emit("chat:updated", { chat });
      }
    } catch (error) {
      logger.error({ error, chatId, archive }, "Failed to archive chat via Baileys");
      throw error;
    }
  }

  /**
   * Mutes or unmutes a chat using Baileys chatModify.
   * Pass duration in milliseconds (e.g. 28800000 for 8 hours) or null to unmute.
   */
  async muteChat(chatId: string, durationMs: number | null): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      await this.socket.chatModify({ mute: durationMs }, targetJid);
      await store.muteChat(chatId, durationMs !== null);
      const chat = store.getChat(chatId);
      if (chat) {
        this.emit("chat:updated", { chat });
      }
    } catch (error) {
      logger.error({ error, chatId, durationMs }, "Failed to mute chat via Baileys");
      throw error;
    }
  }

  /**
   * Pins or unpins a chat using Baileys chatModify.
   */
  async pinChat(chatId: string, pin: boolean): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      await this.socket.chatModify({ pin }, targetJid);
      await store.pinChat(chatId, pin);
      const chat = store.getChat(chatId);
      if (chat) {
        this.emit("chat:updated", { chat });
      }
    } catch (error) {
      logger.error({ error, chatId, pin }, "Failed to pin chat via Baileys");
      throw error;
    }
  }

  /**
   * Deletes a chat using Baileys chatModify.
   */
  async deleteChat(chatId: string): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const lastMsg = await this.getLastMessageForChat(targetJid);
      if (lastMsg) {
        await this.socket.chatModify(
          {
            delete: true,
            lastMessages: [lastMsg],
          },
          targetJid
        );
      }

      await store.deleteChat(chatId);
      this.emit("chat:deleted", { chatId });
    } catch (error) {
      logger.error({ error, chatId }, "Failed to delete chat via Baileys");
      throw error;
    }
  }

  /**
   * Stars or unstars a message using Baileys chatModify.
   */
  async starMessage(
    chatId: string,
    messageId: string,
    star: boolean
  ): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const msg = await store.getMessage(chatId, messageId);
      const fromMe = msg ? msg.fromMe : false;

      await this.socket.chatModify(
        {
          star: {
            messages: [{ id: messageId, fromMe }],
            star,
          },
        },
        targetJid
      );

      await store.starMessage(chatId, messageId, star);
      this.emit("message:updated", {
        messageId,
        chatId,
        status: msg?.status || "sent",
        isStarred: star,
      });
    } catch (error) {
      logger.error({ error, chatId, messageId, star }, "Failed to star message via Baileys");
      throw error;
    }
  }

  /**
   * Deletes a message for me only using Baileys chatModify deleteForMe.
   */
  async deleteMessageForMe(chatId: string, messageId: string): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const msg = await store.getMessage(chatId, messageId);
      if (!msg) {
        throw new Error("Message not found");
      }

      const raw = this.rawMessages.get(messageId);
      const key = raw?.key || {
        id: messageId,
        remoteJid: targetJid,
        fromMe: msg.fromMe,
        participant:
          targetJid.endsWith("@g.us") && !msg.fromMe ? msg.senderId : undefined,
      };

      await this.socket.chatModify(
        {
          deleteForMe: {
            deleteMedia: true,
            key,
            timestamp: msg.timestamp,
          },
        },
        targetJid
      );

      await store.deleteMessage(chatId, messageId);
      this.emit("message:deleted", { messageId, chatId });
    } catch (error) {
      logger.error({ error, chatId, messageId }, "Failed to delete message for me via Baileys");
      throw error;
    }
  }

  /**
   * Fetches low-resolution profile picture URL for a user or group.
   * (Per requirement: low-res only, without 'image' argument)
   */
  async getProfilePictureUrl(jid: string): Promise<string | null> {
    if (!this.socket || !this.isConnected()) return null;

    try {
      const normalized = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      const targetJid = normalized.endsWith("@lid")
        ? (store.getPnForLid(normalized) || normalized)
        : normalized;

      // Calling sock.profilePictureUrl(targetJid) without 'image' retrieves the low-res preview
      const url = await this.socket.profilePictureUrl(targetJid);
      if (url) {
        await store.updateChatProfilePicUrl(jid, url);
        if (targetJid !== jid) {
          await store.updateChatProfilePicUrl(targetJid, url);
        }
      }
      return url || null;
    } catch {
      // 404 or 401 privacy restrictions are expected when no profile picture exists
      return null;
    }
  }

  /**
   * Fetches WhatsApp bio / status text for a user.
   */
  async fetchUserStatus(jid: string): Promise<string | null> {
    if (!this.socket || !this.isConnected()) return null;

    try {
      const normalized = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      const targetJid = normalized.endsWith("@lid")
        ? (store.getPnForLid(normalized) || normalized)
        : normalized;

      const result = await this.socket.fetchStatus(targetJid);
      if (Array.isArray(result) && result.length > 0) {
        const item = result[0] as any;
        if (typeof item === "string") return item;
        const statusField = item?.status;
        if (typeof statusField === "string") return statusField;
        if (typeof statusField?.status === "string") return statusField.status;
        return null;
      }
      if (typeof result === "string") return result;
      if (result && typeof (result as any).status === "string") {
        return (result as any).status;
      }
      if (result && typeof (result as any).status?.status === "string") {
        return (result as any).status.status;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches business profile details for a WhatsApp business account.
   */
  async getBusinessProfile(jid: string): Promise<any | null> {
    if (!this.socket || !this.isConnected()) return null;

    try {
      const targetJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
      return await this.socket.getBusinessProfile(targetJid);
    } catch {
      return null;
    }
  }

  /**
   * Verifies if a given phone number or JID exists on WhatsApp.
   */
  async checkOnWhatsApp(
    jidOrNumber: string
  ): Promise<{ exists: boolean; jid: string; lid?: string } | null> {
    if (!this.socket || !this.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }

    try {
      const sanitized = jidOrNumber.replace(/\D/g, "");
      const jid = sanitized.includes("@")
        ? sanitized
        : `${sanitized}@s.whatsapp.net`;
      const results = await this.socket.onWhatsApp(jid);
      const first = results?.[0];
      if (!first) return null;
      return { exists: Boolean(first.exists), jid: first.jid, lid: (first as any).lid || undefined };
    } catch (error) {
      logger.error({ error, jidOrNumber }, "Failed to check if JID exists on WhatsApp");
      return null;
    }
  }

  /**
   * Queries backwards chat history via Baileys fetchMessageHistory.
   * Messages will arrive asynchronously via the messaging-history.set event.
   */
  async fetchChatHistory(chatId: string, count: number = 50): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      const oldest = await store.getOldestMessage(targetJid);
      if (oldest) {
        const raw = this.rawMessages.get(oldest.id);
        const key = raw?.key || {
          id: oldest.id,
          remoteJid: targetJid,
          fromMe: oldest.fromMe,
          participant:
            targetJid.endsWith("@g.us") && !oldest.fromMe
              ? oldest.senderId
              : undefined,
        };
        await this.socket.fetchMessageHistory(count, key, oldest.timestamp);
      }
    } catch (error) {
      logger.error({ error, chatId }, "Failed to fetch chat history via Baileys");
    }
  }

  /**
   * Sends presence update for a specific chat (e.g. typing / composing).
   */
  async sendChatPresence(
    chatId: string,
    presence: "composing" | "paused" | "recording"
  ): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      await this.socket.sendPresenceUpdate(presence, targetJid);
    } catch (err) {
      logger.warn({ err, chatId, presence }, "Failed to send chat presence update");
    }
  }

  /**
   * Subscribes to presence updates for a given chat.
   */
  async subscribePresence(chatId: string): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      const targetJid = chatId.includes("@") ? chatId : `${chatId}@s.whatsapp.net`;
      await this.socket.presenceSubscribe(targetJid);
    } catch (err) {
      logger.warn({ err, chatId }, "Failed to subscribe to chat presence");
    }
  }

  /**
   * Sets the global connection presence (online/offline).
   */
  async setPresence(status: "available" | "unavailable"): Promise<void> {
    if (!this.socket || !this.isConnected()) {
      logger.warn("Cannot set presence: socket is not connected");
      return;
    }
    try {
      await this.socket.sendPresenceUpdate(status);
      logger.info({ status }, "Successfully set presence");
    } catch (error) {
      logger.error(error, "Failed to set presence");
      throw error;
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
      this.currentPairingCode = null;
      this.clearReconnectTimer();
      this.updateState("connected");

      if (this.socket?.user) {
        store.setUserJid(this.socket.user.id, this.socket.user.lid);
      }

      // Default presence to unavailable (offline)
      this.setPresence("unavailable").catch((err) => {
        logger.warn(err, "Failed to set default presence to unavailable");
      });

      // Sync chat names from stored contacts
      store.syncChatNamesFromContacts().catch((err) => {
        logger.error(err, "Failed to sync chat names from contacts");
      });

      // Automatically synchronize contact LIDs and resolve chat names in the background
      this.syncContactLids().catch((err) => {
        logger.error(err, "Failed to synchronize contact LIDs");
      });
      return;
    }

    if (connection === "close") {
      this.isConnecting = false;
      this.currentQrCode = null;
      this.currentPairingCode = null;
      this.clearReconnectTimer();

      // Clean up the closed socket to detach listeners and prevent zombie socket
      const oldSocket = this.socket;
      this.socket = null;
      if (oldSocket) {
        try {
          oldSocket.ev.removeAllListeners("connection.update");
          oldSocket.ev.removeAllListeners("creds.update");
          oldSocket.ev.removeAllListeners("messages.upsert");
          oldSocket.ev.removeAllListeners("messages.update");
          oldSocket.ev.removeAllListeners("chats.upsert");
          oldSocket.ev.removeAllListeners("chats.update");
          oldSocket.ev.removeAllListeners("chats.phoneNumberShare");
          oldSocket.ev.removeAllListeners("contacts.upsert");
          oldSocket.ev.removeAllListeners("contacts.update");
          oldSocket.ev.removeAllListeners("messaging-history.set");
          oldSocket.ev.removeAllListeners("presence.update");
          try {
            oldSocket.ws?.close();
          } catch {
            // ignore
          }
          oldSocket.end(undefined);
        } catch (err) {
          logger.error(err, "Error closing previous socket on close event");
        }
      }

      if (this.isExplicitDisconnect) {
        logger.info("WhatsApp socket closed intentionally, skipping reconnect");
        return;
      }

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.info({ statusCode, err: lastDisconnect?.error }, "WhatsApp connection closed");

      if (statusCode === DisconnectReason.loggedOut) {
        logger.info("Logged out from WhatsApp");
        this.clearAuthState();
        this.msgRetryCounterCache.flushAll?.();
        this.keyCache.flushAll?.();
        this.updateState("logged_out");
        // Chat history is kept persistent — only auth state is cleared
        return;
      }

      const isRestartRequired = statusCode === DisconnectReason.restartRequired;
      const isUnregistered = oldSocket?.authState?.creds?.registered === false;
      const maxRetries = isUnregistered ? 20 : MAX_RECONNECT_RETRIES;

      if (this.reconnectAttempts < maxRetries) {
        this.reconnectAttempts++;
        const delay = isRestartRequired || isUnregistered
          ? 1500
          : Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        logger.info(
          { attempt: this.reconnectAttempts, delay, statusCode, isUnregistered },
          "Reconnecting to WhatsApp"
        );
        this.updateState("reconnecting");

        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect(true).catch((err) => {
            logger.error(err, "Reconnect attempt failed");
          });
        }, delay);
      } else {
        logger.error("Max reconnect attempts reached");
        this.updateState("error", undefined, "Max reconnect attempts reached");
      }
    }
  }

  /**
   * Automatically resolves and synchronizes LIDs for all saved address book contacts
   * using Baileys onWhatsApp USync queries in small throttled batches.
   */
  async syncContactLids(): Promise<number> {
    if (!this.socket || !this.isConnected()) {
      logger.warn("Cannot sync contact LIDs: socket is not connected");
      return 0;
    }

    const contacts = store.getContacts();
    // Only resolve contacts that have a saved phone number (@s.whatsapp.net) and a name
    const pnContacts = contacts.filter(
      (c) => c.id.endsWith("@s.whatsapp.net") && c.name && c.name.trim().length > 0
    );

    // Filter to those that don't already have an LID mapping
    const toResolve = pnContacts.filter((c) => !store.getLidForPn(c.id));

    logger.info(
      { totalPnContacts: pnContacts.length, toResolveCount: toResolve.length },
      "Starting contact LID synchronization"
    );

    if (toResolve.length === 0) {
      const synced = await store.syncChatNamesFromContacts();
      return synced;
    }

    let newlyMapped = 0;
    const BATCH_SIZE = 25;

    for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
      if (!this.socket || !this.isConnected()) {
        logger.warn("Stopping contact LID sync: socket disconnected");
        break;
      }

      const batch = toResolve.slice(i, i + BATCH_SIZE);
      const jids = batch.map((c) => c.id);

      try {
        const results = await this.socket.onWhatsApp(...jids);
        if (results && results.length > 0) {
          for (const res of results) {
            if (res.exists && res.lid) {
              const lid = normalizeJid(String(res.lid));
              const pn = normalizeJid(res.jid);
              store.registerLidPn(lid, pn);
              newlyMapped++;
            }
          }
        }
      } catch (batchErr) {
        logger.warn({ batchErr, batchIndex: i }, "Error during onWhatsApp batch query");
      }

      // Small throttle between batches so we don't saturate WhatsApp rate limits
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    logger.info({ newlyMapped }, "Completed contact LID synchronization");
    const synced = await store.syncChatNamesFromContacts();
    return synced;
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

      // Extract sender PN / LID mappings if present on message key
      const rawKeyAny = raw.key as any;
      if (rawKeyAny?.senderLid && rawKeyAny?.senderPn) {
        store.registerLidPn(rawKeyAny.senderLid, rawKeyAny.senderPn);
      }
      // Upsert contact pushName for message sender (supports 1-on-1 chats and group participants)
      const isGroupChat = raw.key?.remoteJid?.endsWith("@g.us");
      const participantJid = extractParticipant(raw);
      const senderJid = isGroupChat ? participantJid : (raw.key?.participant || raw.key?.remoteJid);
      if (raw.pushName && senderJid && !senderJid.endsWith("@g.us") && senderJid !== "status@broadcast") {
        store.upsertContact({
          id: normalizeJid(senderJid),
          pushName: raw.pushName.trim(),
        });
      }

      // ─── Reactions: don't store as messages, don't update chat ───
      if (isReaction) {
        logger.info(
          { chatId: raw.key?.remoteJid, from: raw.pushName },
          "Reaction received (ignored from chat)"
        );
        continue;
      }

      // ─── Status revokes: statuses are permanent, ignore contact deletions ───
      if (isStatusBroadcast && this.isRevokeMessage(raw)) {
        logger.info(
          { from: raw.pushName },
          "Status revoke ignored (statuses are kept until manually deleted)"
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
        this.persistStatus(raw, message);
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
      store.updateChatLastMessage(message.chatId, message, type === "notify");

      // Preemptively cache sticker media so it survives restarts
      if (message.type === "sticker") {
        this.downloadMedia(message.id).catch((err) => {
          logger.warn({ err, messageId: message.id }, "Failed to pre-cache sticker media");
        });
      }

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

      // Handle re-decrypted or updated message payload
      if (update.update?.message) {
        let existingRaw = this.rawMessages.get(messageId);
        if (existingRaw) {
          existingRaw = {
            ...existingRaw,
            message: update.update.message,
          };
          this.rawMessages.set(messageId, existingRaw);
        } else {
          existingRaw = {
            key: update.key,
            message: update.update.message,
            messageTimestamp: Math.floor(Date.now() / 1000),
          } as WAMessage;
          this.rawMessages.set(messageId, existingRaw);
        }

        const transformed = transformMessage(existingRaw);
        if (transformed) {
          const existingDbMsg = store.getMessage(chatId, messageId);
          store.addMessage(transformed);
          store.updateChatLastMessage(chatId, transformed, false);

          if (!existingDbMsg) {
            this.emit("message:received", { message: transformed });
          } else {
            this.emit("message:updated", {
              messageId,
              chatId,
              status: transformed.status,
              text: transformed.text,
              media: transformed.media,
            });
          }
          const chat = store.getChat(chatId);
          if (chat) {
            this.emit("chat:updated", { chat });
          }
        }
      }
    }
  }

  private handleChatsUpsert(rawChats: BaileysEventMap["chats.upsert"]): void {
    for (const raw of rawChats) {
      const chatId = normalizeJid(raw.id);
      // Skip status broadcast — not a real chat
      if (chatId === "status@broadcast") continue;

      const rawAny = raw as any;
      if (rawAny.pnJid) {
        store.registerLidPn(chatId, rawAny.pnJid);
      }
      if (rawAny.lidJid) {
        store.registerLidPn(rawAny.lidJid, chatId);
      }

      const chatName = raw.name || rawAny.displayName || store.getContactName(chatId) || chatId.split("@")[0];

      const chat: Chat = {
        id: chatId,
        name: chatName,
        lastMessage: "",
        lastMessageTimestamp: Number(raw.conversationTimestamp) || 0,
        unreadCount: raw.unreadCount || 0,
        isGroup: chatId.endsWith("@g.us"),
        isArchived: Boolean(raw.archived),
        isPinned: Boolean(raw.pinned),
        isMuted: Boolean((raw as any).mute || (raw as any).muteEndTime),
      };
      store.upsertChat(chat);
      this.emit("chat:updated", { chat });

      // Opportunistically fetch low-res profile picture in background
      if (!chat.profilePicUrl) {
        this.getProfilePictureUrl(chatId).then((url) => {
          if (url) {
            chat.profilePicUrl = url;
            this.emit("chat:updated", { chat });
          }
        }).catch(() => {});
      }
    }
  }

  private handleChatsUpdate(updates: BaileysEventMap["chats.update"]): void {
    for (const update of updates) {
      if (!update.id) continue;
      const chatId = normalizeJid(update.id);
      // Skip status broadcast — not a real chat
      if (chatId === "status@broadcast") continue;

      const rawAny = update as any;
      if (rawAny.pnJid) {
        store.registerLidPn(chatId, rawAny.pnJid);
      }
      if (rawAny.lidJid) {
        store.registerLidPn(rawAny.lidJid, chatId);
      }

      const existing = store.getChat(chatId);
      if (existing) {
        if (update.name) existing.name = update.name;
        else if (rawAny.displayName) existing.name = rawAny.displayName;
        if (update.unreadCount !== undefined && update.unreadCount !== null) {
          existing.unreadCount = update.unreadCount;
        }
        if (update.conversationTimestamp) {
          existing.lastMessageTimestamp = Number(update.conversationTimestamp);
        }
        if (update.archived !== undefined) {
          existing.isArchived = Boolean(update.archived);
        }
        if (update.pinned !== undefined) {
          existing.isPinned = Boolean(update.pinned);
        }
        const muteVal = (update as any).mute ?? (update as any).muteEndTime;
        if (muteVal !== undefined) {
          existing.isMuted = Boolean(muteVal);
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
      const rawAny = raw as any;
      if (rawAny.lid && rawAny.jid) {
        store.registerLidPn(rawAny.lid, rawAny.jid);
      } else if (raw.id.endsWith("@lid") && rawAny.jid) {
        store.registerLidPn(raw.id, rawAny.jid);
      } else if (raw.id.endsWith("@s.whatsapp.net") && rawAny.lid) {
        store.registerLidPn(rawAny.lid, raw.id);
      }

      store.upsertContact({
        id: contactId,
        name: raw.name?.trim() || undefined,
        pushName: raw.notify?.trim() || undefined,
        verifiedName: raw.verifiedName?.trim() || undefined,
        lid: rawAny.lid ? normalizeJid(rawAny.lid) : undefined,
        phone: rawAny.jid ? normalizeJid(rawAny.jid) : undefined,
      });

      // Update chat name if we now know the contact name
      const chat = store.getChat(contactId);
      if (chat) {
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
      const rawAny = update as any;
      if (rawAny.lid && rawAny.jid) {
        store.registerLidPn(rawAny.lid, rawAny.jid);
      } else if (update.id.endsWith("@lid") && rawAny.jid) {
        store.registerLidPn(update.id, rawAny.jid);
      } else if (update.id.endsWith("@s.whatsapp.net") && rawAny.lid) {
        store.registerLidPn(rawAny.lid, update.id);
      }

      store.upsertContact({
        id: contactId,
        name: update.name?.trim() || undefined,
        pushName: update.notify?.trim() || undefined,
        verifiedName: update.verifiedName?.trim() || undefined,
        lid: rawAny.lid ? normalizeJid(rawAny.lid) : undefined,
        phone: rawAny.jid ? normalizeJid(rawAny.jid) : undefined,
      });

      const chat = store.getChat(contactId);
      if (chat) {
        this.emit("chat:updated", { chat });
      }
    }
  }

  private async handleHistorySync(
    data: BaileysEventMap["messaging-history.set"]
  ): Promise<void> {
    const { chats, contacts, messages: syncMessages, syncType, progress, isLatest } = data;

    logger.info(
      {
        syncType,
        progress,
        isLatest,
        chats: chats?.length || 0,
        contacts: contacts?.length || 0,
        messages: syncMessages?.length || 0,
      },
      "Processing history sync batch"
    );

    // 1. Process contacts
    if (contacts && contacts.length > 0) {
      for (const raw of contacts) {
        if (!raw.id) continue;
        const contactId = normalizeJid(raw.id);
        const rawAny = raw as any;
        if (rawAny.lid && rawAny.jid) {
          store.registerLidPn(rawAny.lid, rawAny.jid);
        } else if (raw.id.endsWith("@lid") && rawAny.jid) {
          store.registerLidPn(raw.id, rawAny.jid);
        } else if (raw.id.endsWith("@s.whatsapp.net") && rawAny.lid) {
          store.registerLidPn(rawAny.lid, raw.id);
        }

        await store.upsertContact({
          id: contactId,
          name: raw.name?.trim() || undefined,
          pushName: raw.notify?.trim() || undefined,
          verifiedName: raw.verifiedName?.trim() || undefined,
          lid: rawAny.lid ? normalizeJid(rawAny.lid) : undefined,
          phone: rawAny.jid ? normalizeJid(rawAny.jid) : undefined,
        });
      }
    }

    // 2. Process chats
    if (chats && chats.length > 0) {
      for (const raw of chats) {
        if (!raw.id) continue;
        const chatId = normalizeJid(raw.id);
        if (chatId === STATUS_BROADCAST_JID) continue;

        const rawAny = raw as any;
        if (rawAny.pnJid) {
          store.registerLidPn(chatId, rawAny.pnJid);
        }
        if (rawAny.lidJid) {
          store.registerLidPn(rawAny.lidJid, chatId);
        }

        const contactName = store.getContactName(chatId);
        const chatName = raw.name || rawAny.displayName || contactName || chatId.split("@")[0];

        await store.upsertChat({
          id: chatId,
          name: chatName,
          lastMessage: "",
          lastMessageTimestamp: Number(raw.conversationTimestamp) || 0,
          unreadCount: raw.unreadCount || 0,
          isGroup: chatId.endsWith("@g.us"),
          isArchived: Boolean(raw.archived),
          isPinned: Boolean(raw.pinned),
          isMuted: Boolean((raw as any).mute || (raw as any).muteEndTime),
        });
        // Opportunistically queue low-res avatar fetch in background
        this.getProfilePictureUrl(chatId).catch(() => {});
      }
    }

    // 3. Process messages
    let processedMessages = 0;
    if (syncMessages && syncMessages.length > 0) {
      for (const raw of syncMessages) {
        if (raw.key?.id && raw.message) {
          this.rawMessages.set(raw.key.id, raw);
        }
        const isStatusBroadcast = raw.key?.remoteJid === STATUS_BROADCAST_JID;
        if (isStatusBroadcast && this.isRevokeMessage(raw)) continue;

        const message = transformMessage(raw);
        if (!message) continue;

        if (isStatusBroadcast) {
          this.persistStatus(raw, message);
          continue;
        }

        await store.addMessage(message);
        // For history sync, isNewIncoming is false (does not increment unreadCount)
        await store.updateChatLastMessage(message.chatId, message, false);
        processedMessages++;
      }
    }

    // 4. Synchronize chat names from contacts
    await store.syncChatNamesFromContacts();

    logger.info(
      {
        chatsProcessed: chats?.length || 0,
        contactsProcessed: contacts?.length || 0,
        messagesProcessed: processedMessages,
        syncType,
      },
      "History sync batch persisted successfully"
    );

    // Emit history:synced event after successful database persistence
    this.emit("history:synced", {
      count: processedMessages,
      syncType: syncType ? String(syncType) : undefined,
    });
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

  /**
   * Detects "delete for everyone" revokes (protocol message or REVOKE stub).
   * Used to keep statuses permanent regardless of contact deletion.
   */
  private isRevokeMessage(raw: WAMessage): boolean {
    const REVOKE_PROTOCOL_TYPE = 0;
    const REVOKE_STUB_TYPE = 1;
    const content = unwrapMessage(raw.message);
    if (content?.protocolMessage?.type === REVOKE_PROTOCOL_TYPE) return true;
    return !raw.message && raw.messageStubType === REVOKE_STUB_TYPE;
  }

  /**
   * Persists a status permanently: saves the message and eagerly downloads
   * its media into the database, because WhatsApp media URLs expire after
   * ~24h and raw messages only live in memory.
   * Includes retry mechanism for media that may be pending decryption.
   */
  private persistStatus(raw: WAMessage, message: Message): void {
    store.addMessage(message).catch((err) => {
      logger.error({ err, messageId: message.id }, "Failed to persist status");
    });

    if (!message.media) return;

    // Retry downloading media up to 3 times (immediate, 3s, 10s)
    const tryDownload = async (attempt: number) => {
      try {
        const result = await this.downloadMedia(message.id);
        if (result) {
          logger.info({ messageId: message.id, attempt }, "Successfully persisted status media");
          return;
        }

        if (attempt < 3) {
          const delay = attempt === 1 ? 3000 : 10000;
          setTimeout(() => {
            tryDownload(attempt + 1);
          }, delay);
        } else {
          logger.warn(
            { messageId: message.id, hasRaw: !!raw.message },
            "Status media could not be persisted after multiple attempts"
          );
        }
      } catch (err) {
        logger.error({ err, messageId: message.id, attempt }, "Failed to persist status media");
      }
    };

    tryDownload(1);
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
    error?: string,
    pairingCode?: string
  ): void {
    this.connectionState = state;
    if (state !== "qr") {
      this.currentQrCode = null;
    }
    if (state !== "pairing") {
      this.currentPairingCode = null;
    }
    const update: ConnectionUpdate = { state, qrCode, error, pairingCode };
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
