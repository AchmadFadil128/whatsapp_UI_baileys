import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/pin
 * Pins or unpins a chat via native Baileys chatModify.
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
    const isPinned = Boolean(body.isPinned);

    if (whatsappService.isConnected()) {
      await whatsappService.pinChat(chatId, isPinned);
    } else {
      await store.pinChat(chatId, isPinned);
    }

    return NextResponse.json({
      success: true,
      data: { chatId, isPinned },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
