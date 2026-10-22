import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/read
 * Marks a chat as read or unread via Baileys native readMessages and chatModify.
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
    const body = await request.json().catch(() => ({}));
    const markRead = body.markRead !== undefined ? Boolean(body.markRead) : true;

    if (whatsappService.isConnected()) {
      await whatsappService.markChatRead(chatId, markRead);
    } else if (markRead) {
      await store.markChatRead(chatId);
    }

    return NextResponse.json({
      success: true,
      data: { chatId, markRead },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
