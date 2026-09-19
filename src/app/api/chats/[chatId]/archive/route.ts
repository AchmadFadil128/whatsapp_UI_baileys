import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/archive
 * Toggles the archive state of a chat.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse<ApiResponse>> {
  const { chatId } = await params;

  if (!chatId) {
    return NextResponse.json(
      { success: false, error: "Missing chatId" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const isArchived = Boolean(body.isArchived);

    await store.archiveChat(chatId, isArchived);

    return NextResponse.json({
      success: true,
      data: { chatId, isArchived },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
