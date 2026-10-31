// ─── Connection States ────────────────────────────────────────────
export type WhatsAppConnectionState =
  | "disconnected"
  | "connecting"
  | "qr"
  | "pairing"
  | "connected"
  | "reconnecting"
  | "logged_out"
  | "error";

// ─── Internal Models ──────────────────────────────────────────────
export interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  isGroup: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  profilePicUrl?: string;
}

export interface QuotedMessage {
  id: string;
  sender: string;
  senderName?: string;
  text?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  timestamp: number;
  type: MessageType;
  text?: string;
  media?: MediaReference;
  quotedMessageId?: string;
  quotedMessage?: QuotedMessage;
  fromMe: boolean;
  status?: MessageStatus;
  pushName?: string;
  senderName?: string;
  chatName?: string;
  isStarred?: boolean;
}

export interface SearchMessageResult extends Message {
  chatName?: string;
}

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "ptv"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "reaction"
  | "poll"
  | "unknown";

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "error";

export interface MediaReference {
  url?: string;
  mimetype?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
}

export interface Contact {
  id: string;
  name?: string;
  pushName?: string;
  verifiedName?: string;
  phone?: string;
  lid?: string;
  profilePicUrl?: string;
}

// ─── Realtime Event Payloads ──────────────────────────────────────
export interface ConnectionUpdate {
  state: WhatsAppConnectionState;
  qrCode?: string;
  pairingCode?: string;
  error?: string;
}

export interface MessageEvent {
  message: Message;
}

export interface MessageStatusEvent {
  messageId: string;
  chatId: string;
  status: MessageStatus;
  isStarred?: boolean;
}

export interface ChatUpdateEvent {
  chat: Chat;
}

export interface TypingEvent {
  chatId: string;
  senderId: string;
  isTyping: boolean;
}

// ─── Database Failover ──────────────────────────────────────────
export type DatabaseFailoverState = "PRIMARY" | "FAILOVER" | "SYNCING";

export interface DatabaseFailoverEvent {
  state: DatabaseFailoverState;
}

// ─── Socket.IO Event Maps ─────────────────────────────────────────
export interface ServerToClientEvents {
  "whatsapp:connection": (data: ConnectionUpdate) => void;
  "message:received": (data: MessageEvent) => void;
  "message:updated": (data: MessageStatusEvent) => void;
  "message:deleted": (data: { messageId: string; chatId: string }) => void;
  "chat:updated": (data: ChatUpdateEvent) => void;
  "chat:deleted": (data: { chatId: string }) => void;
  "typing:updated": (data: TypingEvent) => void;
  "history:synced": (data: { count: number; syncType?: string }) => void;
  "db:failover": (data: DatabaseFailoverEvent) => void;
}

export interface ClientToServerEvents {
  "typing:start": (chatId: string) => void;
  "typing:stop": (chatId: string) => void;
  "message:read": (chatId: string) => void;
}

// ─── API Response Types ───────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SendMessageRequest {
  chatId: string;
  text: string;
  replyToMessageId?: string;
}

export interface GetMessagesQuery {
  limit?: number;
  before?: number;
}
