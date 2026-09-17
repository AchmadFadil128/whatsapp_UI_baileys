import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const body = await req.json();
    const { status } = body;

    if (status !== "available" && status !== "unavailable") {
      return NextResponse.json(
        { success: false, error: "Invalid status, must be 'available' or 'unavailable'" },
        { status: 400 }
      );
    }

    if (!whatsappService.isConnected()) {
      return NextResponse.json(
        { success: false, error: "WhatsApp is not connected" },
        { status: 400 }
      );
    }

    await whatsappService.setPresence(status);

    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
