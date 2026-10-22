import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/mute
 * Toggles the mute state of a chat via native Baileys chatModify.
 * Accepts optional durationMs (e.g. 28800000 for 8 hours) or isMuted boolean.
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
    const isMuted = Boolean(body.isMuted);
    const durationMs =
      body.durationMs !== undefined
        ? body.durationMs
        : isMuted
        ? 8 * 60 * 60 * 1000 // default 8 hours
        : null;

    if (whatsappService.isConnected()) {
      await whatsappService.muteChat(chatId, durationMs);
    } else {
      await store.muteChat(chatId, isMuted);
    }

    return NextResponse.json({
      success: true,
      data: { chatId, isMuted: durationMs !== null, durationMs },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
