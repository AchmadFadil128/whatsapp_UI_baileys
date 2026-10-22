import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * DELETE /api/chats/:chatId
 * Deletes a chat via native Baileys chatModify and removes local records.
 */
export async function DELETE(
  _request: NextRequest,
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
    if (whatsappService.isConnected()) {
      await whatsappService.deleteChat(chatId);
    } else {
      await store.deleteChat(chatId);
    }

    return NextResponse.json({
      success: true,
      data: { chatId },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
