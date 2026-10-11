import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Message } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Message>>> {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const message = await store.getMessage("", decodedId);

  if (!message) {
    return NextResponse.json(
      {
        success: false,
        error: "Message not found",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: message,
  });
}
