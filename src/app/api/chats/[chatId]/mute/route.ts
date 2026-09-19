import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * POST /api/chats/:chatId/mute
 * Toggles the mute state of a chat.
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

    await store.muteChat(chatId, isMuted);

    return NextResponse.json({
      success: true,
      data: { chatId, isMuted },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
