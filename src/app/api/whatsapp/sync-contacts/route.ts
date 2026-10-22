import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { whatsappService } from "@/server/services/whatsapp.service";
import { store } from "@/server/services/store";
import { formatPhoneNumber, resolveContactDisplayName } from "@/server/lib/contact-resolver";
import { normalizeJid } from "@/server/lib/message-transformer";
import type { ApiResponse } from "@/types";

export async function POST(): Promise<
  NextResponse<ApiResponse<{ syncedChats: number; totalLidMappings: number; newlyMapped: number }>>
> {
  try {
    const ws = (globalThis as any).__whatsappService || whatsappService;
    const currentStore = (globalThis as any).__whatsappStore || store;

    // Ensure LID/PN maps exist on currentStore
    if (!currentStore.lidToPn) {
      currentStore.lidToPn = new Map<string, string>();
    }
    if (!currentStore.pnToLid) {
      currentStore.pnToLid = new Map<string, string>();
    }

    // Load any existing mappings from database
    try {
      const savedSetting = await prisma.setting.findUnique({
        where: { key: "lid_pn_mappings" },
      });
      if (savedSetting?.value && typeof savedSetting.value === "object") {
        for (const [l, p] of Object.entries(savedSetting.value as Record<string, string>)) {
          if (typeof l === "string" && typeof p === "string") {
            currentStore.lidToPn.set(l, p);
            currentStore.pnToLid.set(p, l);
          }
        }
      }
    } catch {
      // ignore
    }

    // Define registerLidPn helper
    const registerLidPn = (rawLid: string, rawPn: string) => {
      let lid = rawLid.trim();
      let pn = rawPn.trim();
      if (lid.endsWith("@s.whatsapp.net") && pn.endsWith("@lid")) {
        const tmp = lid;
        lid = pn;
        pn = tmp;
      }
      if (!lid.endsWith("@lid") || !pn.endsWith("@s.whatsapp.net")) return;
      currentStore.lidToPn.set(lid, pn);
      currentStore.pnToLid.set(pn, lid);
    };

    if (!currentStore.registerLidPn) {
      currentStore.registerLidPn = registerLidPn;
    }
    if (!currentStore.getLidForPn) {
      currentStore.getLidForPn = (pn: string) => currentStore.pnToLid?.get(pn);
    }
    if (!currentStore.getPnForLid) {
      currentStore.getPnForLid = (lid: string) => currentStore.lidToPn?.get(lid);
    }
    if (!currentStore.getAllLidMappings) {
      currentStore.getAllLidMappings = () => Object.fromEntries(currentStore.lidToPn?.entries() || []);
    }

    // Define resolveChatName on store if missing or old
    currentStore.resolveChatName = function (chatId: string, currentChatName?: string): string {
      if (chatId.endsWith("@g.us")) {
        return currentChatName || chatId.split("@")[0];
      }
      const direct = this.contacts?.get(chatId);
      if (direct?.name && direct.name.trim().length > 0) {
        return direct.name.trim();
      }
      const mappedPn = this.lidToPn?.get(chatId);
      if (mappedPn) {
        const pnContact = this.contacts?.get(mappedPn);
        if (pnContact?.name && pnContact.name.trim().length > 0) {
          return pnContact.name.trim();
        }
        if (pnContact?.pushName && pnContact.pushName.trim().length > 0) {
          return pnContact.pushName.trim();
        }
        if (pnContact?.verifiedName && pnContact.verifiedName.trim().length > 0) {
          return pnContact.verifiedName.trim();
        }
      }
      if (direct?.pushName && direct.pushName.trim().length > 0) {
        return direct.pushName.trim();
      }
      if (direct?.verifiedName && direct.verifiedName.trim().length > 0) {
        return direct.verifiedName.trim();
      }
      if (
        currentChatName &&
        currentChatName.trim().length > 0 &&
        currentChatName !== chatId &&
        currentChatName !== chatId.split("@")[0]
      ) {
        return currentChatName.trim();
      }
      if (mappedPn) {
        return formatPhoneNumber(mappedPn);
      }
      if (chatId.endsWith("@s.whatsapp.net")) {
        return formatPhoneNumber(chatId);
      }
      return chatId.split("@")[0];
    };

    if (!currentStore.resolveQuotedSenderName) {
      currentStore.resolveQuotedSenderName = function (
        sender: string,
        chatId?: string,
        explicitSenderName?: string
      ): string {
        if (!sender) return "Unknown";
        if (this.isSelf && this.isSelf(sender)) return "You";
        if (sender === "me") return "You";
        if (
          explicitSenderName &&
          explicitSenderName.trim().length > 0 &&
          explicitSenderName !== sender &&
          explicitSenderName !== sender.split("@")[0]
        ) {
          return explicitSenderName.trim();
        }
        if (chatId && !chatId.endsWith("@g.us")) {
          const resolved = this.resolveChatName(chatId);
          if (resolved && resolved !== chatId && resolved !== chatId.split("@")[0]) {
            return resolved;
          }
        }
        const directResolved = this.resolveChatName(sender);
        if (directResolved) return directResolved;
        return sender.split("@")[0];
      };
    }

    // 1. Resolve LIDs via Baileys socket for all address-book contacts
    let newlyMapped = 0;
    const sock = ws?.socket;
    if (sock && typeof sock.onWhatsApp === "function") {
      const contacts = currentStore.getContacts();
      const pnContacts = contacts.filter(
        (c: any) => c.id.endsWith("@s.whatsapp.net") && c.name && c.name.trim().length > 0
      );

      const toResolve = pnContacts.filter((c: any) => !currentStore.pnToLid.get(c.id));

      const BATCH_SIZE = 25;
      for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
        const batch = toResolve.slice(i, i + BATCH_SIZE);
        const jids = batch.map((c: any) => c.id);
        try {
          const results = await sock.onWhatsApp(...jids);
          if (results && results.length > 0) {
            for (const r of results) {
              if (r.exists && r.lid) {
                const lid = normalizeJid(String(r.lid));
                const pn = normalizeJid(r.jid);
                registerLidPn(lid, pn);
                newlyMapped++;
              }
            }
          }
        } catch {
          // ignore batch errors
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // Persist newly discovered mappings to DB settings
      try {
        const mappingObj = Object.fromEntries(currentStore.lidToPn.entries());
        await prisma.setting.upsert({
          where: { key: "lid_pn_mappings" },
          create: { key: "lid_pn_mappings", value: mappingObj },
          update: { value: mappingObj },
        });
      } catch {
        // ignore
      }
    }

    // 2. Synchronize chat names
    let syncedChats = 0;
    if (currentStore.chats) {
      for (const [chatId, chat] of currentStore.chats.entries()) {
        if (chat.isGroup) continue;
        const resolved = currentStore.resolveChatName(chatId, chat.name);
        if (resolved && resolved !== chat.name && resolved !== chatId.split("@")[0]) {
          chat.name = resolved;
          currentStore.chats.set(chatId, chat);
          try {
            await prisma.chat.updateMany({
              where: { id: chatId },
              data: { name: resolved },
            });
            syncedChats++;
          } catch {
            // ignore
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        syncedChats,
        totalLidMappings: currentStore.lidToPn.size,
        newlyMapped,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<
  NextResponse<ApiResponse<{ totalLidMappings: number; mappings: Record<string, string> }>>
> {
  const currentStore = (globalThis as any).__whatsappStore || store;
  const mappings = currentStore.getAllLidMappings
    ? currentStore.getAllLidMappings()
    : Object.fromEntries(currentStore.lidToPn?.entries() || []);
  return NextResponse.json({
    success: true,
    data: {
      totalLidMappings: Object.keys(mappings).length,
      mappings,
    },
  });
}
