"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message, MessageEvent } from "@/types";

const PAGE_SIZE = 50;

/** Merges messages by id and keeps them sorted ascending by timestamp. */
function mergeStatuses(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const s of current) byId.set(s.id, s);
  for (const s of incoming) byId.set(s.id, s);
  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Hook to fetch and listen for status broadcast messages.
 * Supports pagination ("load more"), deleting individual statuses,
 * deleting all statuses of one contact, and clearing all.
 */
export function useStatuses() {
  const [statuses, setStatuses] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const statusesRef = useRef<Message[]>([]);

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  const fetchStatuses = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getStatuses(PAGE_SIZE);
      if (res.success && res.data) {
        setStatuses(res.data);
        setHasMore(res.data.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error("Failed to fetch statuses:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const current = statusesRef.current;
    if (current.length === 0) return;

    const oldest = current.reduce((min, s) => (s.timestamp < min ? s.timestamp : min), current[0].timestamp);

    setIsLoadingMore(true);
    try {
      const res = await api.getStatuses(PAGE_SIZE, oldest);
      if (res.success && res.data) {
        const page = res.data;
        setStatuses((prev) => mergeStatuses(prev, page));
        setHasMore(page.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error("Failed to load more statuses:", err);
    } finally {
      setIsLoadingMore(false);
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

  const deleteStatus = useCallback(async (id: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await api.deleteStatus(id);
      if (!res.success) throw new Error(res.error || "Delete failed");
    } catch (err) {
      console.error("Failed to delete status:", err);
      // Refetch to restore consistency
      fetchStatuses();
    }
  }, [fetchStatuses]);

  const deleteStatusesBySender = useCallback(async (senderId: string) => {
    setStatuses((prev) => prev.filter((s) => s.senderId !== senderId));
    try {
      const res = await api.deleteStatusesBySender(senderId);
      if (!res.success) throw new Error(res.error || "Delete failed");
    } catch (err) {
      console.error("Failed to delete contact statuses:", err);
      fetchStatuses();
    }
  }, [fetchStatuses]);

  const clearAllStatuses = useCallback(async () => {
    setStatuses([]);
    setHasMore(false);
    try {
      const res = await api.clearAllStatuses();
      if (!res.success) throw new Error(res.error || "Clear failed");
    } catch (err) {
      console.error("Failed to clear statuses:", err);
      fetchStatuses();
    }
  }, [fetchStatuses]);

  return {
    statuses,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refetch: fetchStatuses,
    deleteStatus,
    deleteStatusesBySender,
    clearAllStatuses,
  };
}
