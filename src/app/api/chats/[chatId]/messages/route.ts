import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Message } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse<ApiResponse<Message[]>>> {
  const { chatId } = await params;
  const searchParams = request.nextUrl.searchParams;

  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const beforeParam = searchParams.get("before");
  const before = beforeParam ? parseInt(beforeParam, 10) : undefined;

  const decodedChatId = decodeURIComponent(chatId);
  const messages = store.getMessages(decodedChatId, limit, before);

  return NextResponse.json({
    success: true,
    data: messages,
  });
}
