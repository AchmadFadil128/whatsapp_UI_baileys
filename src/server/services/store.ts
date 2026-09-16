import fs from "fs";
import path from "path";
import type { Chat, Message, Contact } from "@/types";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("store");
const STORE_FILE = path.join(process.cwd(), "data", "whatsapp", "store.json");

/**
 * File-backed store for chats, messages, and contacts.
 * Preserves synced data across server restarts so the chat list
 * is immediately available without waiting for full WhatsApp resync.
 */
class Store {
  private chats: Map<string, Chat> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.chats)) {
          for (const c of data.chats) this.chats.set(c.id, c);
        }
        if (Array.isArray(data.contacts)) {
          for (const c of data.contacts) this.contacts.set(c.id, c);
        }
        if (data.messages && typeof data.messages === "object") {
          for (const [chatId, msgs] of Object.entries(data.messages)) {
            if (Array.isArray(msgs)) this.messages.set(chatId, msgs as Message[]);
          }
        }
        logger.info({ chats: this.chats.size }, "Loaded store from disk");
      }
    } catch (err) {
      logger.warn(err, "Failed to load store from disk, starting empty");
    }
  }

  private saveToDisk(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const dir = path.dirname(STORE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const messagesObj: Record<string, Message[]> = {};
        for (const [chatId, msgs] of this.messages.entries()) {
          messagesObj[chatId] = msgs.slice(-100);
        }
        const data = {
          chats: Array.from(this.chats.values()),
          contacts: Array.from(this.contacts.values()),
          messages: messagesObj,
        };
        fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
      } catch (err) {
        logger.error(err, "Failed to save store to disk");
      }
    }, 500);
  }

  // ─── Chats ────────────────────────────────────────────────

  upsertChat(chat: Chat): void {
    const existing = this.chats.get(chat.id);
    if (existing) {
      this.chats.set(chat.id, { ...existing, ...chat });
    } else {
      this.chats.set(chat.id, chat);
    }
    this.saveToDisk();
  }

  getChat(chatId: string): Chat | undefined {
    return this.chats.get(chatId);
  }

  getChats(): Chat[] {
    return Array.from(this.chats.values()).sort(
      (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp
    );
  }

  updateChatLastMessage(chatId: string, message: Message): void {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.lastMessage = message.text || `[${message.type}]`;
      chat.lastMessageTimestamp = message.timestamp;
      if (!message.fromMe) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
    } else {
      this.chats.set(chatId, {
        id: chatId,
        name: message.pushName || chatId.split("@")[0],
        lastMessage: message.text || `[${message.type}]`,
        lastMessageTimestamp: message.timestamp,
        unreadCount: message.fromMe ? 0 : 1,
        isGroup: chatId.endsWith("@g.us"),
      });
    }
    this.saveToDisk();
  }

  markChatRead(chatId: string): void {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.unreadCount = 0;
      this.saveToDisk();
    }
  }

  // ─── Messages ─────────────────────────────────────────────

  addMessage(message: Message): void {
    const chatMessages = this.messages.get(message.chatId) || [];
    const existingIndex = chatMessages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      chatMessages[existingIndex] = message;
    } else {
      chatMessages.push(message);
      chatMessages.sort((a, b) => a.timestamp - b.timestamp);
    }
    this.messages.set(message.chatId, chatMessages);
    this.saveToDisk();
  }

  addMessages(messages: Message[]): void {
    for (const msg of messages) {
      this.addMessage(msg);
    }
  }

  getMessages(chatId: string, limit = 50, before?: number): Message[] {
    const chatMessages = this.messages.get(chatId) || [];
    let filtered = chatMessages;
    if (before) {
      filtered = chatMessages.filter((m) => m.timestamp < before);
    }
    return filtered.slice(-limit);
  }

  getMessage(chatId: string, messageId: string): Message | undefined {
    const chatMessages = this.messages.get(chatId) || [];
    return chatMessages.find((m) => m.id === messageId);
  }

  updateMessageStatus(
    chatId: string,
    messageId: string,
    status: Message["status"]
  ): void {
    const chatMessages = this.messages.get(chatId) || [];
    const msg = chatMessages.find((m) => m.id === messageId);
    if (msg) {
      msg.status = status;
      this.saveToDisk();
    }
  }

  // ─── Contacts ─────────────────────────────────────────────

  upsertContact(contact: Contact): void {
    const existing = this.contacts.get(contact.id);
    if (existing) {
      this.contacts.set(contact.id, { ...existing, ...contact });
    } else {
      this.contacts.set(contact.id, contact);
    }
    this.saveToDisk();
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

  clear(): void {
    logger.info("Clearing store");
    this.chats.clear();
    this.messages.clear();
    this.contacts.clear();
    try {
      if (fs.existsSync(STORE_FILE)) {
        fs.unlinkSync(STORE_FILE);
      }
    } catch (err) {
      logger.error(err, "Failed to delete store file");
    }
  }
}

// Singleton instance
// Attach store to globalThis for Next.js bundler compatibility
const globalForStore = globalThis as unknown as {
  __whatsappStore?: Store;
};

export const store = globalForStore.__whatsappStore ?? new Store();

if (!globalForStore.__whatsappStore) {
  globalForStore.__whatsappStore = store;
}
