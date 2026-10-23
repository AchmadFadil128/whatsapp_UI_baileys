import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("api:statuses:by-sender");

/**
 * GET /api/statuses/by-sender?senderId=...&limit=50&before=...
 * Retrieves status messages for a specific sender across all time (lazy-loaded).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const senderId = searchParams.get("senderId");
  const limitParam = searchParams.get("limit");
  const beforeParam = searchParams.get("before");

  if (!senderId || !senderId.trim()) {
    return NextResponse.json(
      { success: false, error: "senderId parameter is required" },
      { status: 400 }
    );
  }

  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;
  const before = beforeParam ? parseInt(beforeParam, 10) : undefined;

  try {
    const statuses = await store.getStatusesBySender(senderId.trim(), limit, before);
    return NextResponse.json({ success: true, data: statuses });
  } catch (err) {
    logger.error({ err, senderId }, "Failed to fetch statuses for sender");
    return NextResponse.json(
      { success: false, error: "Failed to fetch statuses for sender" },
      { status: 500 }
    );
  }
}
