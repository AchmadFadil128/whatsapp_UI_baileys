"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import type { Chat, ChatUpdateEvent } from "@/types";

/**
 * React hook for the chat list.
 * Fetches initial chats via REST and listens for realtime updates via Socket.IO.
 */
export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getChats();
      if (res.success && res.data) {
        setChats(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    function onChatUpdated(data: ChatUpdateEvent) {
      setChats((prev) => {
        const index = prev.findIndex((c) => c.id === data.chat.id);
        let updated: Chat[];
        if (index >= 0) {
          updated = [...prev];
          updated[index] = { ...updated[index], ...data.chat };
        } else {
          updated = [data.chat, ...prev];
        }
        // Re-sort by lastMessageTimestamp
        return updated.sort(
          (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp
        );
      });
    }

    // Refetch chats when connection updates (e.g., after history sync)
    function onConnectionUpdate() {
      fetchChats();
    }

    socket.on("chat:updated", onChatUpdated);
    socket.on("whatsapp:connection", onConnectionUpdate);

    fetchChats();

    return () => {
      socket.off("chat:updated", onChatUpdated);
      socket.off("whatsapp:connection", onConnectionUpdate);
    };
  }, [fetchChats]);

  const markRead = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  return { chats, isLoading, refetch: fetchChats, markRead };
}
