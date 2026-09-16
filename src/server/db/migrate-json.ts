import fs from "fs";
import path from "path";
import { prisma } from "./client";
import { createLogger } from "@/server/lib/logger";
import type { Chat, Message, Contact } from "@/types";

const logger = createLogger("migrate-json");
const STORE_FILE = path.join(process.cwd(), "data", "whatsapp", "store.json");

/**
 * Automatically migrates existing store.json data to PostgreSQL
 * on initial startup if the database is currently empty.
 */
export async function migrateJsonStoreIfNeeded(): Promise<void> {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return;
    }

    // Check if database already has chats
    const chatCount = await prisma.chat.count();
    if (chatCount > 0) {
      logger.info({ chatCount }, "Database already populated, skipping JSON migration");
      return;
    }

    logger.info("Empty database detected. Migrating data from store.json...");

    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data = JSON.parse(raw) as {
      chats?: Chat[];
      contacts?: Contact[];
      messages?: Record<string, Message[]>;
    };

    let importedContacts = 0;
    let importedChats = 0;
    let importedMessages = 0;

    // 1. Migrate Contacts
    if (Array.isArray(data.contacts)) {
      for (const contact of data.contacts) {
        if (!contact.id) continue;
        await prisma.contact.upsert({
          where: { id: contact.id },
          create: {
            id: contact.id,
            name: contact.name || null,
            pushName: contact.pushName || null,
            verifiedName: (contact as unknown as { verifiedName?: string }).verifiedName || null,
          },
          update: {
            name: contact.name || null,
            pushName: contact.pushName || null,
            verifiedName: (contact as unknown as { verifiedName?: string }).verifiedName || null,
          },
        });
        importedContacts++;
      }
    }

    // 2. Migrate Chats
    if (Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        if (!chat.id) continue;
        await prisma.chat.upsert({
          where: { id: chat.id },
          create: {
            id: chat.id,
            name: chat.name || chat.id.split("@")[0],
            lastMessage: chat.lastMessage || null,
            lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
            unreadCount: chat.unreadCount || 0,
            isGroup: Boolean(chat.isGroup),
          },
          update: {
            name: chat.name || chat.id.split("@")[0],
            lastMessage: chat.lastMessage || null,
            lastMessageTimestamp: BigInt(chat.lastMessageTimestamp || 0),
            unreadCount: chat.unreadCount || 0,
            isGroup: Boolean(chat.isGroup),
          },
        });
        importedChats++;
      }
    }

    // 3. Migrate Messages
    if (data.messages && typeof data.messages === "object") {
      for (const [chatId, messages] of Object.entries(data.messages)) {
        if (!Array.isArray(messages)) continue;

        // Ensure chat exists before inserting foreign-key messages
        const chatExists = await prisma.chat.findUnique({ where: { id: chatId } });
        if (!chatExists) {
          await prisma.chat.create({
            data: {
              id: chatId,
              name: chatId.split("@")[0],
              isGroup: chatId.endsWith("@g.us"),
            },
          });
          importedChats++;
        }

        for (const msg of messages) {
          if (!msg.id) continue;
          await prisma.message.upsert({
            where: { id: msg.id },
            create: {
              id: msg.id,
              chatId: msg.chatId || chatId,
              senderId: msg.senderId || "",
              timestamp: BigInt(msg.timestamp || 0),
              type: msg.type || "text",
              text: msg.text || null,
              media: msg.media ? (msg.media as object) : undefined,
              quotedMessageId: msg.quotedMessageId || null,
              fromMe: Boolean(msg.fromMe),
              pushName: msg.pushName || null,
              status: msg.status || "PENDING",
            },
            update: {
              text: msg.text || null,
              status: msg.status || "PENDING",
            },
          });
          importedMessages++;
        }
      }
    }

    logger.info(
      { importedChats, importedMessages, importedContacts },
      "Successfully migrated store.json to PostgreSQL database"
    );
  } catch (error) {
    logger.error(error, "Failed to migrate store.json to PostgreSQL");
  }
}
