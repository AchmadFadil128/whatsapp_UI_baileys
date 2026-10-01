import { NextResponse, type NextRequest } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ code: string }>>> {
  try {
    const body = await request.json();
    const phoneNumber = body.phoneNumber || body.phone;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Phone number is required",
        },
        { status: 400 }
      );
    }

    const code = await whatsappService.requestPairingCode(phoneNumber);

    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to request pairing code",
      },
      { status: 500 }
    );
  }
}
