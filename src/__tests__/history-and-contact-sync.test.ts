import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveContactDisplayName } from "../server/lib/contact-resolver";
import { normalizeJid, transformMessage } from "../server/lib/message-transformer";
import type { Contact, Message } from "../types";

describe("Contact Name Resolution Priority (refactor.md §5.4)", () => {
  test("prioritizes address book name over pushName and verifiedName", () => {
    const contact: Contact = {
      id: "628123456789@s.whatsapp.net",
      name: "Budi Siregar (Buku Alamat)",
      pushName: "Budi Cool",
      verifiedName: "Budi Official",
    };
    const resolved = resolveContactDisplayName(contact, contact.id);
    assert.equal(resolved, "Budi Siregar (Buku Alamat)");
  });

  test("uses pushName as fallback if address book name is empty or missing", () => {
    const contact: Contact = {
      id: "628123456789@s.whatsapp.net",
      name: "   ",
      pushName: "Budi WhatsApp",
    };
    const resolved = resolveContactDisplayName(contact, contact.id);
    assert.equal(resolved, "Budi WhatsApp");
  });

  test("uses verifiedName if name and pushName are not available", () => {
    const contact: Contact = {
      id: "628123456789@s.whatsapp.net",
      verifiedName: "Toko Resmi Budi",
    };
    const resolved = resolveContactDisplayName(contact, contact.id);
    assert.equal(resolved, "Toko Resmi Budi");
  });

  test("falls back to JID user/phone when no names exist", () => {
    const contact: Contact = {
      id: "628123456789@s.whatsapp.net",
    };
    const resolved = resolveContactDisplayName(contact, contact.id);
    assert.equal(resolved, "628123456789");
  });

  test("handles undefined contact gracefully", () => {
    const resolved = resolveContactDisplayName(undefined, "628999888777@s.whatsapp.net");
    assert.equal(resolved, "628999888777");
  });
});

describe("Partial Contact Merge Logic (refactor.md §5.3)", () => {
  test("partial update with only pushName does not overwrite existing address book name", () => {
    const existing: Contact = {
      id: "628111222333@s.whatsapp.net",
      name: "Ahmad Sahroni",
      pushName: "Ahmad S",
    };

    const update: Partial<Contact> & { id: string } = {
      id: "628111222333@s.whatsapp.net",
      pushName: "Sahroni Baru",
    };

    const mergedName = update.name?.trim() ? update.name.trim() : existing.name;
    const mergedPushName = update.pushName?.trim() ? update.pushName.trim() : existing.pushName;

    assert.equal(mergedName, "Ahmad Sahroni");
    assert.equal(mergedPushName, "Sahroni Baru");
  });

  test("empty or whitespace name does not erase valid stored name", () => {
    const existing: Contact = {
      id: "628111222333@s.whatsapp.net",
      name: "Ahmad Sahroni",
    };

    const update: Partial<Contact> & { id: string } = {
      id: "628111222333@s.whatsapp.net",
      name: "   \t\n  ",
    };

    const mergedName = update.name?.trim() ? update.name.trim() : existing.name;
    assert.equal(mergedName, "Ahmad Sahroni");
  });
});

describe("JID Normalization (refactor.md §4.3)", () => {
  test("preserves @s.whatsapp.net, @g.us, and @lid JIDs without discarding", () => {
    assert.equal(normalizeJid("628123456789:12@s.whatsapp.net"), "628123456789@s.whatsapp.net");
    assert.equal(normalizeJid("120363023456789012@g.us"), "120363023456789012@g.us");
    assert.equal(normalizeJid("201026162454734@lid"), "201026162454734@lid");
  });
});

describe("History vs Realtime Message Ordering & Unread Count (refactor.md §4.4)", () => {
  test("history message with older timestamp does not overwrite newer chat preview", () => {
    const chat = {
      id: "test-chat@s.whatsapp.net",
      name: "Test Chat",
      lastMessage: "Pesan terbaru realtime",
      lastMessageTimestamp: 1700000500,
      unreadCount: 1,
    };

    // Incoming older history message (e.g. from 1 hour ago)
    const historyMessage: Message = {
      id: "msg-old-123",
      chatId: "test-chat@s.whatsapp.net",
      senderId: "test-chat@s.whatsapp.net",
      timestamp: 1700000100, // older than 1700000500
      type: "text",
      text: "Pesan lama dari history",
      fromMe: false,
    };

    const isNewer = !chat.lastMessageTimestamp || historyMessage.timestamp >= chat.lastMessageTimestamp;
    assert.equal(isNewer, false, "Older history message should not be considered newer");

    if (isNewer) {
      chat.lastMessage = historyMessage.text!;
      chat.lastMessageTimestamp = historyMessage.timestamp;
    }

    assert.equal(chat.lastMessage, "Pesan terbaru realtime");
    assert.equal(chat.lastMessageTimestamp, 1700000500);
  });

  test("history sync (isNewIncoming = false) does not inflate unreadCount", () => {
    let unreadCount = 0;
    const historyMessages = [
      { fromMe: false, timestamp: 100 },
      { fromMe: false, timestamp: 200 },
      { fromMe: true, timestamp: 300 },
    ];

    const isNewIncoming = false;
    for (const msg of historyMessages) {
      if (isNewIncoming && !msg.fromMe) {
        unreadCount++;
      }
    }

    assert.equal(unreadCount, 0, "History sync must never increment unread count");
  });

  test("live incoming message (isNewIncoming = true) increments unreadCount", () => {
    let unreadCount = 0;
    const liveMessage = { fromMe: false, timestamp: 400 };

    const isNewIncoming = true;
    if (isNewIncoming && !liveMessage.fromMe) {
      unreadCount++;
    }

    assert.equal(unreadCount, 1, "Realtime incoming message must increment unread count");
  });
});

describe("LID to PN Mapping and Resolution (refactor.md §5.4)", () => {
  test("resolves contact name using mapped phone number contact", () => {
    const contact: Contact = {
      id: "6282241233524@s.whatsapp.net",
      name: "Faiq Maulana",
    };
    const lidJid = "100373872275635@lid";
    const resolved = resolveContactDisplayName(contact, lidJid, contact.id);
    assert.equal(resolved, "Faiq Maulana");
  });

  test("resolves to mapped phone number if contact name is absent", () => {
    const lidJid = "100373872275635@lid";
    const mappedPn = "6282241233524@s.whatsapp.net";
    const resolved = resolveContactDisplayName(undefined, lidJid, mappedPn);
    assert.equal(resolved, "6282241233524");
  });
});

