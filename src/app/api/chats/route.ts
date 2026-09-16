import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Chat } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<Chat[]>>> {
  const chats = await store.getChatsFromDb();
  return NextResponse.json({
    success: true,
    data: chats,
  });
}
