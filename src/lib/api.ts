import type { ApiResponse, Chat, Message, SendMessageRequest } from "@/types";

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
  return request<{ state: string; qrCode?: string }>("/api/whatsapp/status");
}

export async function connectWhatsApp() {
  return request("/api/whatsapp/connect", { method: "POST" });
}

export async function disconnectWhatsApp() {
  return request("/api/whatsapp/disconnect", { method: "POST" });
}

export async function logoutWhatsApp() {
  return request("/api/whatsapp/logout", { method: "POST" });
}

// ─── Chats ────────────────────────────────────────────────────

export async function getChats() {
  return request<Chat[]>("/api/chats");
}

// ─── Messages ─────────────────────────────────────────────────

export async function getMessages(
  chatId: string,
  limit = 50,
  before?: number
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", String(before));
  return request<Message[]>(
    `/api/chats/${encodeURIComponent(chatId)}/messages?${params}`
  );
}

export async function sendMessage(chatId: string, text: string) {
  const body: SendMessageRequest = { chatId, text };
  return request<Message>("/api/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
