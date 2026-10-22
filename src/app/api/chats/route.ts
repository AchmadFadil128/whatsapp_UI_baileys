import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Chat } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<Chat[]>>> {
  const currentStore = (globalThis as any).__whatsappStore || store;
  const allChats = await currentStore.getChatsFromDb();

  // Filter out status broadcasts and newsletters — they are not regular chats
  const chats = allChats
    .filter((c: Chat) => c.id !== "status@broadcast" && !c.id.endsWith("@newsletter"))
    .map((c: Chat) => {
      const resolved = typeof currentStore.resolveChatName === "function"
        ? currentStore.resolveChatName(c.id, c.name)
        : c.name;

      // Prefer non-digit resolved name, otherwise saved DB name, otherwise identifier
      const finalName =
        resolved && resolved !== c.id.split("@")[0] && resolved !== c.id
          ? resolved
          : c.name && c.name !== c.id.split("@")[0] && c.name !== c.id
          ? c.name
          : resolved || c.name || c.id.split("@")[0];

      return {
        ...c,
        name: finalName,
      };
    });

  return NextResponse.json({
    success: true,
    data: chats,
  });
}
