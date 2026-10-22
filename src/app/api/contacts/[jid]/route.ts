import { NextRequest, NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Contact } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
): Promise<NextResponse<ApiResponse<Contact | null>>> {
  const { jid } = await params;
  const decodedJid = decodeURIComponent(jid);
  const contact = store.getContact(decodedJid);
  const currentStore = (globalThis as any).__whatsappStore || store;
  const resolvedName = typeof currentStore.resolveChatName === "function"
    ? currentStore.resolveChatName(decodedJid, contact?.name)
    : contact?.name;

  if (!contact && !resolvedName) {
    return NextResponse.json({ success: true, data: null });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: decodedJid,
      name: resolvedName || contact?.name || decodedJid.split("@")[0],
      pushName: contact?.pushName,
      verifiedName: contact?.verifiedName,
      profilePicUrl: contact?.profilePicUrl,
      lid: contact?.lid,
      phone: contact?.phone,
    },
  });
}
