import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";

/**
 * GET /api/media/:messageId
 *
 * Downloads media from a WhatsApp message and returns it as a binary response.
 * The frontend uses this as the `src` of an <img> or similar element.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  if (!messageId) {
    return NextResponse.json(
      { success: false, error: "Missing messageId" },
      { status: 400 }
    );
  }

  const media = await whatsappService.downloadMedia(messageId);

  if (!media) {
    return NextResponse.json(
      { success: false, error: "Media not available" },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(media.buffer), {
    status: 200,
    headers: {
      "Content-Type": media.mimetype,
      "Content-Length": String(media.buffer.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
