import type { Chat, Message, Contact } from "@/types";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("store");

/**
 * In-memory store for chats, messages, and contacts.
 * Serves as the data layer for the MVP — no database required.
 * Data is lost on server restart (except auth state which is persisted to disk).
 */
class Store {
  private chats: Map<string, Chat> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private contacts: Map<string, Contact> = new Map();

  // ─── Chats ────────────────────────────────────────────────

  upsertChat(chat: Chat): void {
    const existing = this.chats.get(chat.id);
    if (existing) {
      this.chats.set(chat.id, { ...existing, ...chat });
    } else {
      this.chats.set(chat.id, chat);
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

  updateChatLastMessage(chatId: string, message: Message): void {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.lastMessage = message.text || `[${message.type}]`;
      chat.lastMessageTimestamp = message.timestamp;
      if (!message.fromMe) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
    } else {
      // Create a new chat entry from the message
      this.chats.set(chatId, {
        id: chatId,
        name: message.pushName || chatId.split("@")[0],
        lastMessage: message.text || `[${message.type}]`,
        lastMessageTimestamp: message.timestamp,
        unreadCount: message.fromMe ? 0 : 1,
        isGroup: chatId.endsWith("@g.us"),
      });
    }
  }

  markChatRead(chatId: string): void {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.unreadCount = 0;
    }
  }

  // ─── Messages ─────────────────────────────────────────────

  addMessage(message: Message): void {
    const chatMessages = this.messages.get(message.chatId) || [];
    // Avoid duplicates
    const existingIndex = chatMessages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      chatMessages[existingIndex] = message;
    } else {
      chatMessages.push(message);
      // Keep sorted by timestamp
      chatMessages.sort((a, b) => a.timestamp - b.timestamp);
    }
    this.messages.set(message.chatId, chatMessages);
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
    // Return the last N messages
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
  }

  getContact(contactId: string): Contact | undefined {
    return this.contacts.get(contactId);
  }

  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  // ─── Utility ──────────────────────────────────────────────

  getContactName(jid: string): string | undefined {
    const contact = this.contacts.get(jid);
    return contact?.name || contact?.pushName;
  }

  clear(): void {
    logger.info("Clearing in-memory store");
    this.chats.clear();
    this.messages.clear();
    this.contacts.clear();
  }
}

// Singleton instance
export const store = new Store();
