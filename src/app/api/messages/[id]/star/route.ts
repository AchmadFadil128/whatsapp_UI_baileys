import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/messages/:id/star
 * Stars or unstars a message via native Baileys chatModify.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  try {
    const body = await request.json();
    let chatId = body.chatId;
    const isStarred = Boolean(body.isStarred);

    if (!chatId) {
      const msg = await store.getMessage("", decodedId);
      if (msg) chatId = msg.chatId;
    }

    if (!chatId) {
      return NextResponse.json(
        { success: false, error: "Missing chatId for message starring" },
        { status: 400 }
      );
    }

    if (whatsappService.isConnected()) {
      await whatsappService.starMessage(chatId, decodedId, isStarred);
    } else {
      await store.starMessage(chatId, decodedId, isStarred);
    }

    return NextResponse.json({
      success: true,
      data: { messageId: decodedId, chatId, isStarred },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
