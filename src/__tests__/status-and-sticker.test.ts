import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { transformMessage } from "../server/lib/message-transformer";
import type { WAMessage } from "@whiskeysockets/baileys";

describe("Sticker Message Handling", () => {
  test("transforms sticker message with correct type and text indicator", () => {
    const rawStickerMsg: WAMessage = {
      key: {
        remoteJid: "628123456789@s.whatsapp.net",
        id: "STICKER_MSG_1",
        fromMe: false,
      },
      message: {
        stickerMessage: {
          url: "https://mmg.whatsapp.net/...",
          mimetype: "image/webp",
          fileSha256: Buffer.from("mock-sha256"),
          fileLength: 24500,
          isAnimated: false,
        },
      },
      messageTimestamp: 1710000000,
      pushName: "Budi",
    };

    const transformed = transformMessage(rawStickerMsg);
    assert.ok(transformed, "Transformed message should exist");
    assert.strictEqual(transformed.id, "STICKER_MSG_1");
    assert.strictEqual(transformed.type, "sticker");
    assert.strictEqual(transformed.text, "🏷️ Sticker");
    assert.ok(transformed.media, "Media reference should exist");
    assert.strictEqual(transformed.media.mimetype, "image/webp");
  });
});
