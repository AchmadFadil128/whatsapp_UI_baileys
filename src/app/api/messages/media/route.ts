import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse, Message } from "@/types";

/**
 * POST /api/messages/media
 * Sends a media message (image, video, audio, document) via FormData upload.
 * Fields: chatId (string), file (File), caption? (string), replyToMessageId? (string)
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<Message>>> {
  try {
    const formData = await request.formData();
    const chatId = formData.get("chatId") as string;
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string) || undefined;
    const replyToMessageId = (formData.get("replyToMessageId") as string) || undefined;

    if (!chatId || !file) {
      return NextResponse.json(
        { success: false, error: "chatId and file are required" },
        { status: 400 }
      );
    }

    if (!whatsappService.isConnected()) {
      return NextResponse.json(
        { success: false, error: "WhatsApp is not connected" },
        { status: 503 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimetype = file.type || "application/octet-stream";
    const fileName = file.name || undefined;

    const message = await whatsappService.sendMediaMessage(
      chatId,
      buffer,
      mimetype,
      fileName,
      caption,
      replyToMessageId
    );

    return NextResponse.json({
      success: true,
      data: message || undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to send image",
      },
      { status: 500 }
    );
  }
}
