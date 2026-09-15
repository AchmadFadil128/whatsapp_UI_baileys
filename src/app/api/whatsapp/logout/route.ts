import { NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse } from "@/types";

export async function POST(): Promise<NextResponse<ApiResponse>> {
  try {
    await whatsappService.logout();
    return NextResponse.json({
      success: true,
      data: { state: whatsappService.getConnectionState() },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || "Failed to logout",
      },
      { status: 500 }
    );
  }
}
