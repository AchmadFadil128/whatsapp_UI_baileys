import {
  type WAMessage,
  type WAMessageKey,
  type proto,
  jidNormalizedUser,
  normalizeMessageContent,
  extractMessageContent,
} from "@whiskeysockets/baileys";
import type { Message, MessageType, MessageStatus, MediaReference, QuotedMessage } from "@/types";

/**
 * Extracts a clean JID (without device suffix) for use as chat/contact ID.
 */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return "";
  try {
    return jidNormalizedUser(jid);
  } catch {
    return jid.replace(/:(\d+)/, "").replace("@s.whatsapp.net", "@s.whatsapp.net");
  }
}

/**
 * Recursively unwraps modern WhatsApp wrappers like ephemeralMessage,
 * viewOnceMessage, viewOnceMessageV2, documentWithCaptionMessage, editedMessage,
 * and deviceSentMessage.
 */
export function unwrapMessage(
  rawMessage: proto.IMessage | null | undefined
): proto.IMessage | undefined {
  if (!rawMessage) return undefined;
  let content: proto.IMessage | undefined = rawMessage;

  for (let i = 0; i < 5; i++) {
    if (!content) break;

    const normalized = normalizeMessageContent(content);
    if (normalized) content = normalized;

    const extracted = extractMessageContent(content);
    if (extracted) content = extracted;

    if (content?.deviceSentMessage?.message) {
      content = content.deviceSentMessage.message;
      continue;
    }
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
      continue;
    }
    if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
      continue;
    }
    if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
      continue;
    }
    if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
      continue;
    }
    if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
      continue;
    }
    if (content?.editedMessage?.message?.protocolMessage?.editedMessage) {
      content = content.editedMessage.message.protocolMessage.editedMessage;
      continue;
    }
    break;
  }

  return content;
}

/**
 * Determines the message type from unwrapped message content.
 */
function getMessageType(content: proto.IMessage | undefined): MessageType {
  if (!content) return "unknown";

  if (content.conversation || content.extendedTextMessage) return "text";
  if (content.imageMessage) return "image";
  if (content.ptvMessage) return "ptv";
  if (content.videoMessage) return "video";
  if (content.audioMessage) return "audio";
  if (content.documentMessage) return "document";
  if (content.stickerMessage) return "sticker";
  if (content.locationMessage || content.liveLocationMessage) return "location";
  if (content.contactMessage || content.contactsArrayMessage) return "contact";
  if (content.reactionMessage) return "reaction";
  if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) {
    return "poll";
  }

  return "unknown";
}

/**
 * Extracts the human-readable text content from unwrapped message content.
 */
function extractText(content: proto.IMessage | undefined): string | undefined {
  if (!content) return undefined;

  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  if (content.imageMessage?.caption) return content.imageMessage.caption;
  if (content.videoMessage?.caption) return content.videoMessage.caption;
  if (content.documentMessage?.caption) return content.documentMessage.caption;
  if (content.reactionMessage?.text) return content.reactionMessage.text;
  if (content.locationMessage?.name || content.locationMessage?.address) {
    return content.locationMessage.name || content.locationMessage.address || "Location";
  }
  if (content.contactMessage?.displayName) return content.contactMessage.displayName;
  if (content.buttonsResponseMessage?.selectedDisplayText) {
    return content.buttonsResponseMessage.selectedDisplayText;
  }
  if (content.templateButtonReplyMessage?.selectedDisplayText) {
    return content.templateButtonReplyMessage.selectedDisplayText;
  }
  if (content.listResponseMessage?.title) {
    return content.listResponseMessage.title;
  }
  if (
    content.pollCreationMessage?.name ||
    content.pollCreationMessageV2?.name ||
    content.pollCreationMessageV3?.name
  ) {
    return `📊 ${
      content.pollCreationMessage?.name ||
      content.pollCreationMessageV2?.name ||
      content.pollCreationMessageV3?.name
    }`;
  }
  if (content.protocolMessage) {
    if (content.protocolMessage.type === 0 || content.protocolMessage.type === 14) {
      return "🚫 This message was deleted";
    }
  }

  return undefined;
}

/**
 * Extracts media reference from unwrapped message content.
 */
function extractMedia(content: proto.IMessage | undefined): MediaReference | undefined {
  if (!content) return undefined;

  const mediaMsg =
    content.imageMessage ||
    content.ptvMessage ||
    content.videoMessage ||
    content.audioMessage ||
    content.documentMessage ||
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
function extractQuotedMessageId(content: proto.IMessage | undefined): string | undefined {
  const contextInfo =
    content?.extendedTextMessage?.contextInfo ||
    content?.imageMessage?.contextInfo ||
    content?.videoMessage?.contextInfo ||
    content?.documentMessage?.contextInfo;

  if (!contextInfo?.stanzaId) return undefined;
  return contextInfo.stanzaId;
}

/**
 * Extracts full quoted message data if available.
 */
function extractQuotedMessage(content: proto.IMessage | undefined): QuotedMessage | undefined {
  const contextInfo =
    content?.extendedTextMessage?.contextInfo ||
    content?.imageMessage?.contextInfo ||
    content?.videoMessage?.contextInfo ||
    content?.documentMessage?.contextInfo;

  if (!contextInfo?.stanzaId || !contextInfo?.participant) return undefined;

  let text: string | undefined;
  if (contextInfo.quotedMessage) {
    text = extractText(unwrapMessage(contextInfo.quotedMessage));
    if (!text) {
      // Fallback: get type if no text available
      const type = getMessageType(unwrapMessage(contextInfo.quotedMessage));
      if (type !== "unknown" && type !== "text") {
        text = `[${type}]`;
      }
    }
  }

  return {
    id: contextInfo.stanzaId,
    sender: normalizeJid(contextInfo.participant),
    text,
  };
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

  const unwrapped = unwrapMessage(raw.message);
  const type = getMessageType(unwrapped);
  const text = extractText(unwrapped);

  // If no text was extracted and type is still unknown, check messageStubType
  let fallbackText = text;
  if (!fallbackText && type === "unknown") {
    if (raw.messageStubType) {
      fallbackText = `[Event: ${raw.messageStubType}]`;
    }
  }

  return {
    id: key.id,
    chatId,
    senderId,
    timestamp: Number(raw.messageTimestamp) || Math.floor(Date.now() / 1000),
    type,
    text: fallbackText,
    media: extractMedia(unwrapped),
    quotedMessageId: extractQuotedMessageId(unwrapped),
    quotedMessage: extractQuotedMessage(unwrapped),
    fromMe,
    status: mapMessageStatus(raw.status),
    pushName: raw.pushName || undefined,
  };
}
