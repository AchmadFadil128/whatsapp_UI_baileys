"use client";

import { useEffect, useState, useCallback } from "react";
import * as api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message, MessageEvent } from "@/types";

/**
 * Hook to fetch and listen for status broadcast messages.
 */
export function useStatuses() {
  const [statuses, setStatuses] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/chats/status%40broadcast/messages?limit=50");
      const data = await res.json();
      if (data.success && data.data) {
        setStatuses(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch statuses:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    function onMessageReceived(data: MessageEvent) {
      if (data.message.chatId === "status@broadcast") {
        setStatuses((prev) => {
          // Avoid duplicates
          if (prev.some((s) => s.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    }

    socket.on("message:received", onMessageReceived);
    fetchStatuses();

    return () => {
      socket.off("message:received", onMessageReceived);
    };
  }, [fetchStatuses]);

  return { statuses, isLoading, refetch: fetchStatuses };
}
