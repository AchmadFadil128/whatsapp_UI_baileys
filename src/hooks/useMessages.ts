"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import type { Message, MessageEvent, MessageStatusEvent } from "@/types";

/**
 * React hook for messages in a specific chat.
 * Fetches paginated messages via REST and listens for realtime events.
 * Supports infinite scroll (load older messages via loadMore).
 */
export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const prevChatIdRef = useRef<string | null>(null);

  // Fetch initial messages when chatId changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setHasMore(true);
      return;
    }

    // Reset when switching chats
    if (prevChatIdRef.current !== chatId) {
      setMessages([]);
      setHasMore(true);
      prevChatIdRef.current = chatId;
    }

    async function fetchInitial() {
      setIsLoading(true);
      try {
        const res = await api.getMessages(chatId!, 50);
        if (res.success && res.data) {
          setMessages(res.data);
          setHasMore(res.data.length >= 50);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchInitial();
  }, [chatId]);

  // Realtime message events
  useEffect(() => {
    if (!chatId) return;

    const socket = getSocket();

    function onMessageReceived(data: MessageEvent) {
      if (data.message.chatId === chatId) {
        setMessages((prev) => {
          // Deduplicate
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    }

    function onMessageUpdated(data: MessageStatusEvent) {
      if (data.chatId === chatId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId ? { ...m, status: data.status } : m
          )
        );
      }
    }

    socket.on("message:received", onMessageReceived);
    socket.on("message:updated", onMessageUpdated);

    return () => {
      socket.off("message:received", onMessageReceived);
      socket.off("message:updated", onMessageUpdated);
    };
  }, [chatId]);

  // Load older messages for infinite scroll
  const loadMore = useCallback(async () => {
    if (!chatId || isLoading || !hasMore) return;

    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setIsLoading(true);
    try {
      const res = await api.getMessages(chatId, 50, oldestMessage.timestamp);
      if (res.success && res.data) {
        setMessages((prev) => {
          // Deduplicate and prepend
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = res.data!.filter((m) => !existingIds.has(m.id));
          return [...newMessages, ...prev];
        });
        setHasMore(res.data.length >= 50);
      }
    } finally {
      setIsLoading(false);
    }
  }, [chatId, isLoading, hasMore, messages]);

  return { messages, isLoading, hasMore, loadMore };
}
