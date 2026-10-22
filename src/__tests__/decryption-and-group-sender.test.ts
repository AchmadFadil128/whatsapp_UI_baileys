import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { transformMessage } from "../server/lib/message-transformer";
import { store } from "../server/services/store";
import { WAMessageStubType, type WAMessage } from "@whiskeysockets/baileys";

describe("Decryption & Ciphertext Handling (transformMessage)", () => {
  test("transforms CIPHERTEXT stub (messageStubType = 2) into waiting state message", () => {
    const rawCiphertextMsg: WAMessage = {
      key: {
        remoteJid: "1234567890@g.us",
        id: "CIPHERTEXT_MSG_1",
        fromMe: false,
        participant: "628111111111@s.whatsapp.net",
      },
      messageTimestamp: 1700000000,
      messageStubType: WAMessageStubType.CIPHERTEXT,
      pushName: "Alice",
    };

    const transformed = transformMessage(rawCiphertextMsg);
    assert.ok(transformed, "Transformed message should not be null");
    assert.strictEqual(transformed.id, "CIPHERTEXT_MSG_1");
    assert.strictEqual(transformed.chatId, "1234567890@g.us");
    assert.strictEqual(transformed.senderId, "628111111111@s.whatsapp.net");
    assert.strictEqual(transformed.status, "pending");
    assert.strictEqual(transformed.text, "Waiting for this message. This may take a while.");
    assert.strictEqual(transformed.pushName, "Alice");
  });

  test("ignores non-ciphertext unsupported system stubs", () => {
    const rawGroupStubMsg: WAMessage = {
      key: {
        remoteJid: "1234567890@g.us",
        id: "GROUP_STUB_1",
        fromMe: false,
      },
      messageTimestamp: 1700000000,
      messageStubType: WAMessageStubType.GROUP_PARTICIPANT_ADD,
    };

    const transformed = transformMessage(rawGroupStubMsg);
    assert.strictEqual(transformed, null, "Group participant add stub should be filtered out");
  });

  test("transforms regular text message normally", () => {
    const rawTextMsg: WAMessage = {
      key: {
        remoteJid: "1234567890@g.us",
        id: "REGULAR_MSG_1",
        fromMe: false,
        participant: "628111111111@s.whatsapp.net",
      },
      message: {
        conversation: "Hello from group!",
      },
      messageTimestamp: 1700000000,
      pushName: "Alice",
    };

    const transformed = transformMessage(rawTextMsg);
    assert.ok(transformed);
    assert.strictEqual(transformed.id, "REGULAR_MSG_1");
    assert.strictEqual(transformed.text, "Hello from group!");
  });
});

describe("Group Message Sender Name Resolution", () => {
  test("resolves senderName using address-book contact name in group chat", () => {
    store.upsertContact({
      id: "628222222222@s.whatsapp.net",
      name: "Budi Santoso",
      pushName: "Budi",
    });

    const resolved = store.resolveMessageSenderName(
      "628222222222@s.whatsapp.net",
      "Budi Push"
    );
    assert.strictEqual(resolved, "Budi Santoso");
  });

  test("resolves senderName using mapped LID contact name", () => {
    store.upsertContact({
      id: "628333333333@s.whatsapp.net",
      name: "Citra Dewi",
    });
    store.registerLidPn("777777777777@lid", "628333333333@s.whatsapp.net");

    const resolved = store.resolveMessageSenderName(
      "777777777777@lid",
      "Citra Push"
    );
    assert.strictEqual(resolved, "Citra Dewi");
  });

  test("falls back to pushName when contact has no address book name", () => {
    const resolved = store.resolveMessageSenderName(
      "628444444444@s.whatsapp.net",
      "Dedi Cool"
    );
    assert.strictEqual(resolved, "Dedi Cool");
  });

  test("falls back to formatted phone number when neither name nor pushName exist", () => {
    const resolved = store.resolveMessageSenderName(
      "628555555555@s.whatsapp.net"
    );
    assert.ok(resolved.includes("+62 855-5555-555"));
  });

  test("resolves self senderId to 'You'", () => {
    store.setUserJid("628999999999@s.whatsapp.net", "999999999999@lid");
    assert.strictEqual(store.resolveMessageSenderName("me"), "You");
    assert.strictEqual(
      store.resolveMessageSenderName("628999999999@s.whatsapp.net"),
      "You"
    );
    assert.strictEqual(
      store.resolveMessageSenderName("999999999999@lid"),
      "You"
    );
  });

  test("never returns group JID as senderName even if passed a group JID", () => {
    const resolved = store.resolveMessageSenderName("120363427936921320@g.us");
    assert.strictEqual(resolved, "Member");
    const withPush = store.resolveMessageSenderName("120363427936921320@g.us", "Alice");
    assert.strictEqual(withPush, "Alice");
  });

  test("extracts top-level raw.participant when key.participant is absent (HistorySync format)", () => {
    const rawHistoryMsg: WAMessage = {
      key: {
        remoteJid: "120363427936921320@g.us",
        id: "HISTORY_SYNC_MSG_1",
        fromMe: false,
      },
      participant: "628123456789@s.whatsapp.net",
      message: {
        conversation: "Message from history sync",
      },
      messageTimestamp: 1700000000,
    };

    const transformed = transformMessage(rawHistoryMsg);
    assert.ok(transformed);
    assert.strictEqual(transformed.senderId, "628123456789@s.whatsapp.net");
    assert.notStrictEqual(transformed.senderId, "120363427936921320@g.us");
  });

  test("falls back to 'unknown' in group chat when participant is missing (never group JID)", () => {
    const rawNoParticipantMsg: WAMessage = {
      key: {
        remoteJid: "120363427936921320@g.us",
        id: "MSG_NO_PARTICIPANT_1",
        fromMe: false,
      },
      message: {
        conversation: "Message without participant",
      },
      messageTimestamp: 1700000000,
    };

    const transformed = transformMessage(rawNoParticipantMsg);
    assert.ok(transformed);
    assert.strictEqual(transformed.senderId, "unknown");
    assert.notStrictEqual(transformed.senderId, "120363427936921320@g.us");
  });
});

