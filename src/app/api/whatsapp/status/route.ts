import { NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp.service";
import type { ApiResponse, WhatsAppConnectionState } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<{ state: WhatsAppConnectionState; qrCode?: string }>>> {
  return NextResponse.json({
    success: true,
    data: {
      state: whatsappService.getConnectionState(),
      qrCode: whatsappService.getCurrentQrCode() || undefined,
    },
  });
}
