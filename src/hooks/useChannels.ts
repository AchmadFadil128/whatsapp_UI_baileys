"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import type { Chat } from "@/types";

export function useChannels() {
  const [channels, setChannels] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const json = await res.json();
      if (json.success) {
        setChannels(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    const socket = getSocket();

    const handleChatUpdated = (data: { chat: Chat }) => {
      if (data.chat.id.endsWith("@newsletter")) {
        setChannels((prev) => {
          const index = prev.findIndex((c) => c.id === data.chat.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = data.chat;
            return next.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
          }
          return [...prev, data.chat].sort(
            (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp
          );
        });
      }
    };

    socket.on("chat:updated", handleChatUpdated);
    return () => {
      socket.off("chat:updated", handleChatUpdated);
    };
  }, [fetchChannels]);

  return { channels, isLoading, refetch: fetchChannels };
}
