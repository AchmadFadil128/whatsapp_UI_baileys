import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Chat } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<Chat[]>>> {
  const allChats = await store.getChatsFromDb();
  // Filter out ONLY newsletters
  const channels = allChats.filter((c) => c.id.endsWith("@newsletter"));
  
  return NextResponse.json({
    success: true,
    data: channels,
  });
}
