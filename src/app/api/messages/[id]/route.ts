import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Message } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Message>>> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const message = await store.getMessage("", decodedId);

  if (!message) {
    return NextResponse.json(
      {
        success: false,
        error: "Message not found",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: message,
  });
}

/**
 * DELETE /api/messages/:id
 * Deletes a message for me via Baileys native chatModify deleteForMe.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const searchParams = request.nextUrl.searchParams;
  let chatId = searchParams.get("chatId");

  if (!chatId) {
    try {
      const body = await request.json().catch(() => ({}));
      chatId = body.chatId;
    } catch {}
  }

  if (!chatId) {
    // If chatId not provided in query or body, find from database message record
    const msg = await store.getMessage("", decodedId);
    if (msg) chatId = msg.chatId;
  }

  if (!chatId) {
    return NextResponse.json(
      { success: false, error: "Missing chatId for message deletion" },
      { status: 400 }
    );
  }

  try {
    const { whatsappService } = await import("@/server/services/whatsapp.service");
    if (whatsappService.isConnected()) {
      await whatsappService.deleteMessageForMe(chatId, decodedId);
    } else {
      await store.deleteMessage(chatId, decodedId);
    }

    return NextResponse.json({
      success: true,
      data: { messageId: decodedId, chatId },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

