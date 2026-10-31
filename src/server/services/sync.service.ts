import type { PrismaClient } from "@prisma/client";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("sync-service");

/**
 * Reconciles and synchronizes accumulated data from Temporary DB (VM 1)
 * to Primary DB (VM 2) once connection is restored.
 *
 * After successful synchronization, the temporary database WhatsApp tables
 * are wiped clean to conserve disk space on VM 1 (10 GB disk).
 */
export async function syncTempToPrimary(
  tempDb: PrismaClient,
  primaryDb: PrismaClient
): Promise<boolean> {
  logger.info("Beginning data reconciliation from Temporary DB to Primary DB...");

  try {
    // 1. Sync Contacts
    const contacts = await tempDb.contact.findMany();
    logger.info({ count: contacts.length }, "Syncing contacts to Primary DB");
    for (const c of contacts) {
      await primaryDb.contact.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          name: c.name,
          pushName: c.pushName,
          verifiedName: c.verifiedName,
          profilePicUrl: c.profilePicUrl,
        },
        update: {
          name: c.name || undefined,
          pushName: c.pushName || undefined,
          verifiedName: c.verifiedName || undefined,
          profilePicUrl: c.profilePicUrl || undefined,
        },
      });
    }

    // 2. Sync Chats
    const chats = await tempDb.chat.findMany();
    logger.info({ count: chats.length }, "Syncing chats to Primary DB");
    for (const chat of chats) {
      const existing = await primaryDb.chat.findUnique({
        where: { id: chat.id },
      });

      if (!existing) {
        await primaryDb.chat.create({
          data: {
            id: chat.id,
            name: chat.name,
            lastMessage: chat.lastMessage,
            lastMessageTimestamp: chat.lastMessageTimestamp,
            unreadCount: chat.unreadCount,
            isGroup: chat.isGroup,
            isArchived: chat.isArchived,
            isMuted: chat.isMuted,
            isPinned: chat.isPinned,
            profilePicUrl: chat.profilePicUrl,
          },
        });
      } else {
        const isNewer = chat.lastMessageTimestamp >= existing.lastMessageTimestamp;
        await primaryDb.chat.update({
          where: { id: chat.id },
          data: {
            ...(isNewer && {
              lastMessage: chat.lastMessage,
              lastMessageTimestamp: chat.lastMessageTimestamp,
            }),
            name: chat.name && chat.name !== chat.id.split("@")[0] ? chat.name : existing.name,
            unreadCount: isNewer ? chat.unreadCount : existing.unreadCount,
          },
        });
      }
    }

    // 3. Sync Messages in batches of 50
    const messages = await tempDb.message.findMany({
      orderBy: { timestamp: "asc" },
    });
    logger.info({ count: messages.length }, "Syncing messages to Primary DB");

    const BATCH_SIZE = 50;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      for (const m of batch) {
        // Ensure parent chat exists in primary DB before inserting foreign-key message
        const parentChatExists = await primaryDb.chat.findUnique({
          where: { id: m.chatId },
          select: { id: true },
        });

        if (!parentChatExists) {
          await primaryDb.chat.create({
            data: {
              id: m.chatId,
              name: m.pushName || m.chatId.split("@")[0],
              isGroup: m.chatId.endsWith("@g.us"),
              lastMessage: m.text || `[${m.type}]`,
              lastMessageTimestamp: m.timestamp,
            },
          });
        }

        await primaryDb.message.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            chatId: m.chatId,
            senderId: m.senderId,
            timestamp: m.timestamp,
            type: m.type,
            text: m.text,
            media: m.media ? (m.media as object) : undefined,
            quotedMessageId: m.quotedMessageId,
            quotedMessage: m.quotedMessage ? (m.quotedMessage as object) : undefined,
            fromMe: m.fromMe,
            pushName: m.pushName,
            status: m.status,
            isStarred: m.isStarred,
          },
          update: {
            status: m.status,
            text: m.text,
            isStarred: m.isStarred,
          },
        });
      }
    }

    // 4. Merge Settings (e.g. LID-PN mappings)
    const tempLidSetting = await tempDb.setting.findUnique({
      where: { key: "lid_pn_mappings" },
    });
    if (tempLidSetting?.value && typeof tempLidSetting.value === "object") {
      const primaryLidSetting = await primaryDb.setting.findUnique({
        where: { key: "lid_pn_mappings" },
      });
      const mergedMappings = {
        ...((primaryLidSetting?.value as Record<string, string>) || {}),
        ...(tempLidSetting.value as Record<string, string>),
      };
      await primaryDb.setting.upsert({
        where: { key: "lid_pn_mappings" },
        create: { key: "lid_pn_mappings", value: mergedMappings },
        update: { value: mergedMappings },
      });
    }

    // 5. Sync active user sessions created during failover so user remains authenticated
    const sessions = await tempDb.session.findMany({
      where: { expiresAt: { gt: new Date() } },
    });
    for (const s of sessions) {
      await primaryDb.session.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          token: s.token,
          userId: s.userId,
          expiresAt: s.expiresAt,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
        },
        update: {
          expiresAt: s.expiresAt,
        },
      });
    }

    // 6. Wipe Temporary DB WhatsApp tables to keep VM 1 disk clean
    logger.info("Purging temporary DB WhatsApp tables...");
    await tempDb.message.deleteMany();
    await tempDb.chat.deleteMany();
    await tempDb.contact.deleteMany();
    await tempDb.media.deleteMany();
    await tempDb.setting.deleteMany();

    logger.info(
      {
        syncedMessages: messages.length,
        syncedChats: chats.length,
        syncedContacts: contacts.length,
      },
      "Reconciliation completed successfully and Temporary DB pruned"
    );

    return true;
  } catch (err) {
    logger.error({ err }, "Reconciliation from Temporary DB to Primary DB failed");
    return false;
  }
}

