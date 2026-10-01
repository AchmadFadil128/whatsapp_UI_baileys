import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, SearchMessageResult } from "@/types";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("api:messages:search");

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SearchMessageResult[]>>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q");

    if (!q || !q.trim()) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const chatId = searchParams.get("chatId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const results = await store.searchMessages(q.trim(), {
      chatId,
      limit: isNaN(limit) ? 50 : limit,
    });

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error(error, "Failed to search messages");
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to search messages",
      },
      { status: 500 }
    );
  }
}
