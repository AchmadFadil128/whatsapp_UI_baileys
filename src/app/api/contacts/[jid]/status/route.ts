import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

/**
 * GET /api/contacts/:jid/status
 * Fetches user status/bio text via Baileys native fetchStatus.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
): Promise<NextResponse<ApiResponse<{ status: string | null }>>> {
  const { jid } = await params;
  const decodedJid = decodeURIComponent(jid);

  if (!decodedJid) {
    return NextResponse.json(
      { success: false, error: "Missing jid" },
      { status: 400 }
    );
  }

  try {
    const status = await whatsappService.fetchUserStatus(decodedJid);
    return NextResponse.json({
      success: true,
      data: { status },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
