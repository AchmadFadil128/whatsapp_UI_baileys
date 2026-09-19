import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse, Message, SendMessageRequest } from "@/types";

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<Message>>> {
  try {
    const body = (await request.json()) as SendMessageRequest;

    if (!body.chatId || !body.text) {
      return NextResponse.json(
        {
          success: false,
          error: "chatId and text are required",
        },
        { status: 400 }
      );
    }

    if (!whatsappService.isConnected()) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp is not connected",
        },
        { status: 503 }
      );
    }

    const message = await whatsappService.sendMessage(body.chatId, body.text, body.replyToMessageId);

    return NextResponse.json({
      success: true,
      data: message || undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to send message",
      },
      { status: 500 }
    );
  }
}
