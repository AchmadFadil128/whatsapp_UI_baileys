import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

/**
 * GET or POST /api/whatsapp/check-number
 * Verifies if a given phone number or JID is registered on WhatsApp using Baileys onWhatsApp.
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  const phone = request.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json(
      { success: false, error: "Missing phone parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await whatsappService.checkOnWhatsApp(phone);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const body = await request.json();
    const phone = body.phone;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Missing phone parameter in body" },
        { status: 400 }
      );
    }

    const result = await whatsappService.checkOnWhatsApp(phone);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
