import type { WAMessage, WAMessageKey } from "@whiskeysockets/baileys";
import type { Message, MessageType, MessageStatus, MediaReference } from "@/types";

/**
 * Extracts a clean JID (without device suffix) for use as chat/contact ID.
 */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return "";
  // Remove device suffix (e.g., :0, :1) from JID
  return jid.replace(/:(\d+)/, "").replace("@s.whatsapp.net", "@s.whatsapp.net");
}

/**
 * Determines the message type from a raw Baileys WAMessage.
 */
function getMessageType(msg: WAMessage): MessageType {
  const content = msg.message;
  if (!content) return "unknown";

  if (content.conversation || content.extendedTextMessage) return "text";
  if (content.imageMessage) return "image";
  if (content.videoMessage) return "video";
  if (content.audioMessage) return "audio";
  if (content.documentMessage || content.documentWithCaptionMessage) return "document";
  if (content.stickerMessage) return "sticker";
  if (content.locationMessage || content.liveLocationMessage) return "location";
  if (content.contactMessage || content.contactsArrayMessage) return "contact";

  return "unknown";
}

/**
 * Extracts the text content from a Baileys message.
 */
function extractText(msg: WAMessage): string | undefined {
  const content = msg.message;
  if (!content) return undefined;

  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.videoMessage?.caption) return content.videoMessage.caption;
  if (content.documentWithCaptionMessage?.message?.documentMessage?.caption) {
    return content.documentWithCaptionMessage.message.documentMessage.caption;
  }

  return undefined;
}

/**
 * Extracts media reference from a Baileys message.
 */
function extractMedia(msg: WAMessage): MediaReference | undefined {
  const content = msg.message;
  if (!content) return undefined;

  const mediaMsg =
    content.imageMessage ||
    content.videoMessage ||
    content.audioMessage ||
    content.documentMessage ||
    content.documentWithCaptionMessage?.message?.documentMessage ||
    content.stickerMessage;

  if (!mediaMsg) return undefined;

  return {
    mimetype: mediaMsg.mimetype || undefined,
    fileName: "fileName" in mediaMsg ? (mediaMsg.fileName as string) || undefined : undefined,
    fileSize: "fileLength" in mediaMsg
      ? Number(mediaMsg.fileLength) || undefined
      : undefined,
    caption:
      "caption" in mediaMsg ? (mediaMsg.caption as string) || undefined : undefined,
  };
}

/**
 * Extracts the quoted message ID if this message is a reply.
 */
function extractQuotedMessageId(msg: WAMessage): string | undefined {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo?.stanzaId) return undefined;
  return contextInfo.stanzaId;
}

/**
 * Maps Baileys message status codes to internal MessageStatus.
 */
export function mapMessageStatus(status: number | null | undefined): MessageStatus {
  switch (status) {
    case 0:
      return "pending";
    case 1:
      return "sent";
    case 2:
      return "delivered";
    case 3:
    case 4:
      return "read";
    default:
      return "pending";
  }
}

/**
 * Transforms a raw Baileys WAMessage into the internal Message model.
 * Keeps all JID/format logic server-side per AGENTS.md §10.
 */
export function transformMessage(raw: WAMessage): Message | null {
  const key: WAMessageKey | undefined | null = raw.key;
  if (!key?.id || !key.remoteJid) return null;

  const chatId = normalizeJid(key.remoteJid);
  const fromMe = key.fromMe ?? false;
  const senderId = fromMe
    ? "me"
    : normalizeJid(key.participant || key.remoteJid);

  return {
    id: key.id,
    chatId,
    senderId,
    timestamp: Number(raw.messageTimestamp) || Math.floor(Date.now() / 1000),
    type: getMessageType(raw),
    text: extractText(raw),
    media: extractMedia(raw),
    quotedMessageId: extractQuotedMessageId(raw),
    fromMe,
    status: mapMessageStatus(raw.status),
    pushName: raw.pushName || undefined,
  };
}
