"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message, MessageEvent } from "@/types";

/** Summary for a single status sender, used in the sidebar list. */
export interface StatusSenderSummary {
  senderId: string;
  senderName: string;
  statusCount: number;
  latestTimestamp: number;
}

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
 * 
 * Lazy loading approach:
 * - Initially fetches only a lightweight list of senders (for sidebar).
 * - Full statuses for a sender are loaded on-demand when selected.
 */
export function useStatuses() {
  const [senderList, setSenderList] = useState<StatusSenderSummary[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string | null>(null);
  const [senderStatuses, setSenderStatuses] = useState<Message[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingSender, setIsLoadingSender] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const senderStatusesRef = useRef<Message[]>([]);

  useEffect(() => {
    senderStatusesRef.current = senderStatuses;
  }, [senderStatuses]);

  /**
   * Fetches the lightweight sender summary list for the sidebar.
   * Uses a single API call to get the most recent statuses, then groups by sender.
   */
  const fetchSenderList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await api.getStatusSenderList();
      if (res.success && res.data) {
        setSenderList(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch status senders:", err);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  /**
   * Fetches all statuses for a specific sender (lazy load on click).
   */
  const fetchSenderStatuses = useCallback(async (senderId: string) => {
    setSelectedSenderId(senderId);
    setIsLoadingSender(true);
    setSenderStatuses([]);
    setHasMore(false);
    try {
      const res = await api.getStatusesBySender(senderId, PAGE_SIZE);
      if (res.success && res.data) {
        setSenderStatuses(res.data);
        setHasMore(res.data.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error("Failed to fetch sender statuses:", err);
    } finally {
      setIsLoadingSender(false);
    }
  }, []);

  /**
   * Loads more statuses for the currently selected sender (pagination).
   */
  const loadMore = useCallback(async () => {
    const current = senderStatusesRef.current;
    if (current.length === 0 || !selectedSenderId) return;

    const oldest = current.reduce(
      (min, s) => (s.timestamp < min ? s.timestamp : min),
      current[0].timestamp
    );

    setIsLoadingMore(true);
    try {
      const res = await api.getStatusesBySender(selectedSenderId, PAGE_SIZE, oldest);
      if (res.success && res.data) {
        setSenderStatuses((prev) => mergeStatuses(prev, res.data!));
        setHasMore(res.data.length >= PAGE_SIZE);
      }
    } catch (err) {
      console.error("Failed to load more sender statuses:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedSenderId]);

  /**
   * Clears selection and goes back to the sender list.
   */
  const clearSelection = useCallback(() => {
    setSelectedSenderId(null);
    setSenderStatuses([]);
    setHasMore(false);
  }, []);

  // Listen for new status broadcasts and update sender list
  useEffect(() => {
    const socket = getSocket();

    function onMessageReceived(data: MessageEvent) {
      if (data.message.chatId === "status@broadcast") {
        // Update the sender list with the new status
        setSenderList((prev) => {
          const existing = prev.find((s) => s.senderId === data.message.senderId);
          if (existing) {
            return prev.map((s) =>
              s.senderId === data.message.senderId
                ? {
                    ...s,
                    statusCount: s.statusCount + 1,
                    latestTimestamp: Math.max(s.latestTimestamp, data.message.timestamp),
                    senderName: data.message.pushName || s.senderName,
                  }
                : s
            ).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
          }
          return [
            {
              senderId: data.message.senderId,
              senderName: data.message.pushName || data.message.senderId.split("@")[0],
              statusCount: 1,
              latestTimestamp: data.message.timestamp,
            },
            ...prev,
          ];
        });

        // If this sender is currently selected, append the new status
        if (data.message.senderId === selectedSenderId) {
          setSenderStatuses((prev) => {
            if (prev.some((s) => s.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      }
    }

    socket.on("message:received", onMessageReceived);
    fetchSenderList();

    return () => {
      socket.off("message:received", onMessageReceived);
    };
  }, [fetchSenderList, selectedSenderId]);

  const deleteStatus = useCallback(async (id: string) => {
    setSenderStatuses((prev) => prev.filter((s) => s.id !== id));
    // Update sender list counts
    setSenderList((prev) =>
      prev
        .map((s) => {
          const match = senderStatusesRef.current.find((st) => st.id === id);
          if (match && match.senderId === s.senderId) {
            return { ...s, statusCount: Math.max(0, s.statusCount - 1) };
          }
          return s;
        })
        .filter((s) => s.statusCount > 0)
    );
    try {
      const res = await api.deleteStatus(id);
      if (!res.success) throw new Error(res.error || "Delete failed");
    } catch (err) {
      console.error("Failed to delete status:", err);
      fetchSenderList();
    }
  }, [fetchSenderList]);

  const deleteStatusesBySender = useCallback(async (senderId: string) => {
    setSenderStatuses([]);
    setSenderList((prev) => prev.filter((s) => s.senderId !== senderId));
    setSelectedSenderId(null);
    try {
      const res = await api.deleteStatusesBySender(senderId);
      if (!res.success) throw new Error(res.error || "Delete failed");
    } catch (err) {
      console.error("Failed to delete contact statuses:", err);
      fetchSenderList();
    }
  }, [fetchSenderList]);

  const clearAllStatuses = useCallback(async () => {
    setSenderList([]);
    setSenderStatuses([]);
    setSelectedSenderId(null);
    setHasMore(false);
    try {
      const res = await api.clearAllStatuses();
      if (!res.success) throw new Error(res.error || "Clear failed");
    } catch (err) {
      console.error("Failed to clear statuses:", err);
      fetchSenderList();
    }
  }, [fetchSenderList]);

  return {
    senderList,
    selectedSenderId,
    senderStatuses,
    isLoadingList,
    isLoadingSender,
    isLoadingMore,
    hasMore,
    fetchSenderStatuses,
    loadMore,
    clearSelection,
    refetchSenderList: fetchSenderList,
    deleteStatus,
    deleteStatusesBySender,
    clearAllStatuses,
  };
}
