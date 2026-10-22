import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { store } from "../server/services/store";

describe("Quoted Sender Name Resolution", () => {
  test("resolves sender 'me' to 'You'", () => {
    const resolved = store.resolveQuotedSenderName("me", "628123456789@s.whatsapp.net");
    assert.equal(resolved, "You");
  });

  test("resolves user self JID and LID to 'You'", () => {
    store.setUserJid("628555123456@s.whatsapp.net", "1122334455@lid");
    assert.equal(store.resolveQuotedSenderName("628555123456@s.whatsapp.net"), "You");
    assert.equal(store.resolveQuotedSenderName("1122334455@lid"), "You");
  });

  test("in 1-on-1 chat, resolves quoted sender to the contact name of the chat", () => {
    const contactJid = "628999111222@s.whatsapp.net";
    store.upsertContact({
      id: contactJid,
      name: "Budi Santoso",
    });

    const resolved = store.resolveQuotedSenderName(contactJid, contactJid);
    assert.equal(resolved, "Budi Santoso");
  });

  test("in group chat, resolves quoted sender to saved address-book contact name", () => {
    const participantJid = "628777888999@s.whatsapp.net";
    const groupJid = "120363023456789@g.us";

    store.upsertContact({
      id: participantJid,
      name: "Siti Rahma",
      pushName: "Siti R",
    });

    const resolved = store.resolveQuotedSenderName(participantJid, groupJid);
    assert.equal(resolved, "Siti Rahma");
  });

  test("in group chat, resolves quoted LID sender to mapped phone contact name", () => {
    const lidJid = "9876543210123@lid";
    const pnJid = "628123456000@s.whatsapp.net";
    const groupJid = "120363023456789@g.us";

    store.registerLidPn(lidJid, pnJid);
    store.upsertContact({
      id: pnJid,
      name: "Pak RT",
    });

    const resolved = store.resolveQuotedSenderName(lidJid, groupJid);
    assert.equal(resolved, "Pak RT");
  });

  test("in group chat, resolves quoted sender to pushName if contact name is absent", () => {
    const participantJid = "628333444555@s.whatsapp.net";
    const groupJid = "120363023456789@g.us";

    store.upsertContact({
      id: participantJid,
      pushName: "Kipli Gamer",
    });

    const resolved = store.resolveQuotedSenderName(participantJid, groupJid);
    assert.equal(resolved, "Kipli Gamer");
  });

  test("preserves valid explicit senderName if already provided", () => {
    const participantJid = "628111222333@s.whatsapp.net";
    const resolved = store.resolveQuotedSenderName(
      participantJid,
      "120363023456789@g.us",
      "Kak Rose"
    );
    assert.equal(resolved, "Kak Rose");
  });

  test("formats phone number if no name or pushName is available", () => {
    const unknownJid = "6289876543210@s.whatsapp.net";
    const resolved = store.resolveQuotedSenderName(unknownJid, "120363023456789@g.us");
    assert.match(resolved, /\+62/);
  });
});
