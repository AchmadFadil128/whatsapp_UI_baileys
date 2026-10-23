import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import { prisma } from "@/server/db/client";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("api:statuses:senders");

/**
 * GET /api/statuses/senders
 * Returns a lightweight grouped list of status senders.
 * Each entry includes: senderId, senderName, statusCount, latestTimestamp.
 * Sorted by latestTimestamp descending (newest sender first).
 */
export async function GET() {
  try {
    // Query grouped status sender data directly from the database
    const rawGroups = await prisma.message.groupBy({
      by: ["senderId"],
      where: {
        chatId: "status@broadcast",
        type: { notIn: ["unknown", "reaction"] },
      },
      _count: { id: true },
      _max: { timestamp: true },
      orderBy: { _max: { timestamp: "desc" } },
    });

    // Resolve sender names using the store
    const senders = rawGroups
      .filter((g) => Boolean(g.senderId))
      .map((g) => {
        const senderId = g.senderId;
        const isMe = store.isSelf(senderId);
        const resolvedName = isMe ? "Status Saya" : store.resolveMessageSenderName(senderId);

        return {
          senderId,
          senderName: resolvedName || senderId.split("@")[0],
          statusCount: g._count.id,
          latestTimestamp: Number(g._max.timestamp ?? 0),
        };
      });

    return NextResponse.json({ success: true, data: senders });
  } catch (err) {
    logger.error({ err }, "Failed to fetch status sender list");
    return NextResponse.json(
      { success: false, error: "Failed to fetch status senders" },
      { status: 500 }
    );
  }
}
