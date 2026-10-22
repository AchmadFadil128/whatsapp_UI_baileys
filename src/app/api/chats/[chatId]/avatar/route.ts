import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * GET /api/chats/:chatId/avatar
 * Returns or redirects to the low-resolution profile picture URL via Baileys profilePictureUrl.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse<ApiResponse<{ url: string | null }>> | Response> {
  const { chatId } = await params;

  if (!chatId) {
    return NextResponse.json(
      { success: false, error: "Missing chatId" },
      { status: 400 }
    );
  }

  try {
    // Check local store first
    let url = store.getChat(chatId)?.profilePicUrl || null;

    if (!url && whatsappService.isConnected()) {
      url = await whatsappService.getProfilePictureUrl(chatId);
    }

    const wantsRedirect =
      request.nextUrl.searchParams.get("redirect") === "true" ||
      Boolean(request.headers.get("accept")?.includes("image/"));

    if (wantsRedirect) {
      if (url) {
        return NextResponse.redirect(url);
      }
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
