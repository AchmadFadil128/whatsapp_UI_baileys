import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/history
 * Requests backwards chat history pagination via native Baileys fetchMessageHistory.
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
    const count = Number(body.count) || 50;

    await whatsappService.fetchChatHistory(chatId, count);

    return NextResponse.json({
      success: true,
      data: { chatId, requested: count },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
