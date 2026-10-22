import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import type { ApiResponse } from "@/types";

/**
 * GET /api/contacts/:jid/avatar
 * Returns low-resolution profile picture for a contact via Baileys profilePictureUrl.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
): Promise<NextResponse<ApiResponse<{ url: string | null }>>> {
  const { jid } = await params;
  const decodedJid = decodeURIComponent(jid);

  if (!decodedJid) {
    return NextResponse.json(
      { success: false, error: "Missing jid" },
      { status: 400 }
    );
  }

  try {
    const contact = store.getContact(decodedJid);
    if (contact?.profilePicUrl) {
      return NextResponse.json({
        success: true,
        data: { url: contact.profilePicUrl },
      });
    }

    const url = await whatsappService.getProfilePictureUrl(decodedJid);
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
