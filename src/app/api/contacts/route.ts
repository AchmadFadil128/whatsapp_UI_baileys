import { NextResponse } from "next/server";
import { store } from "@/server/services/store";
import type { ApiResponse, Contact } from "@/types";

export async function GET(): Promise<NextResponse<ApiResponse<Contact[]>>> {
  const currentStore = (globalThis as any).__whatsappStore || store;
  const rawContacts = currentStore.getContacts ? currentStore.getContacts() : [];

  const contacts: Contact[] = rawContacts.map((c: Contact) => {
    const resolvedName = typeof currentStore.resolveChatName === "function"
      ? currentStore.resolveChatName(c.id, c.name)
      : c.name;
    return {
      ...c,
      name: resolvedName || c.name,
    };
  });

  return NextResponse.json({
    success: true,
    data: contacts,
  });
}
