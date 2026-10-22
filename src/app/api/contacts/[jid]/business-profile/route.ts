import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

/**
 * GET /api/contacts/:jid/business-profile
 * Fetches WhatsApp business profile details via Baileys getBusinessProfile.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
): Promise<NextResponse<ApiResponse>> {
  const { jid } = await params;
  const decodedJid = decodeURIComponent(jid);

  if (!decodedJid) {
    return NextResponse.json(
      { success: false, error: "Missing jid" },
      { status: 400 }
    );
  }

  try {
    const profile = await whatsappService.getBusinessProfile(decodedJid);
    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
