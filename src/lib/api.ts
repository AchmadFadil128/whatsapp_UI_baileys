import type { ApiResponse, Chat, Message, SendMessageRequest, SearchMessageResult } from "@/types";

const BASE_URL = "";

/**
 * Typed API client wrapping fetch.
 * All WhatsApp operations go through the backend REST API — frontend never touches Baileys.
 */

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok && !data.error) {
    data.error = `HTTP ${response.status}`;
    data.success = false;
  }

  return data;
}

// ─── WhatsApp Connection ──────────────────────────────────────

export async function getStatus() {
  return request<{ state: string; qrCode?: string; pairingCode?: string }>(
    "/api/whatsapp/status"
  );
}

export async function connectWhatsApp() {
  return request("/api/whatsapp/connect", { method: "POST" });
}

export async function requestPairingCode(phoneNumber: string) {
  return request<{ code: string }>("/api/whatsapp/pair", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function disconnectWhatsApp() {
  return request("/api/whatsapp/disconnect", { method: "POST" });
}

export async function logoutWhatsApp() {
  return request("/api/whatsapp/logout", { method: "POST" });
}

export async function setPresence(status: "available" | "unavailable") {
  return request("/api/whatsapp/presence", {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// ─── Chats ────────────────────────────────────────────────────

export async function getChats() {
  return request<Chat[]>("/api/chats");
}

export async function archiveChat(chatId: string, isArchived: boolean) {
  return request(`/api/chats/${encodeURIComponent(chatId)}/archive`, {
    method: "POST",
    body: JSON.stringify({ isArchived }),
  });
}

export async function muteChat(chatId: string, isMuted: boolean) {
  return request(`/api/chats/${encodeURIComponent(chatId)}/mute`, {
    method: "POST",
    body: JSON.stringify({ isMuted }),
  });
}

// ─── Messages ─────────────────────────────────────────────────

export async function getMessages(
  chatId: string,
  limit = 50,
  before?: number,
  around?: number
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", String(before));
  if (around) params.set("around", String(around));
  return request<Message[]>(
    `/api/chats/${encodeURIComponent(chatId)}/messages?${params}`
  );
}

export async function searchMessages(
  query: string,
  chatId?: string,
  limit = 50
) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (chatId) params.set("chatId", chatId);
  return request<SearchMessageResult[]>(`/api/messages/search?${params}`);
}

export async function sendMessage(chatId: string, text: string, replyToMessageId?: string) {
  const body: SendMessageRequest = { chatId, text, replyToMessageId };
  return request<Message>("/api/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function sendMediaMessage(
  chatId: string,
  file: File,
  caption?: string,
  replyToMessageId?: string
) {
  const formData = new FormData();
  formData.append("chatId", chatId);
  formData.append("file", file);
  if (caption) formData.append("caption", caption);
  if (replyToMessageId) formData.append("replyToMessageId", replyToMessageId);

  const response = await fetch("/api/messages/media", {
    method: "POST",
    body: formData,
  });

  return (await response.json()) as ApiResponse<Message>;
}

// ─── Statuses ─────────────────────────────────────────────────

export async function deleteStatus(id: string) {
  return request(`/api/statuses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function clearAllStatuses() {
  return request("/api/statuses", { method: "DELETE" });
}
