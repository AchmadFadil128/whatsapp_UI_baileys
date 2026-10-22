"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import type { Chat, ChatUpdateEvent } from "@/types";

/**
 * React hook for the chat list.
 * Fetches initial chats via REST and listens for realtime updates via Socket.IO.
 * Supports archive and mute operations with optimistic updates.
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
        // Re-sort: pinned chats first, then by lastMessageTimestamp
        return updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.lastMessageTimestamp - a.lastMessageTimestamp;
        });
      });
    }

    function onChatDeleted(data: { chatId: string }) {
      setChats((prev) => prev.filter((c) => c.id !== data.chatId));
    }

    // Refetch chats when connection updates (e.g., after history sync)
    function onConnectionUpdate() {
      fetchChats();
    }

    socket.on("chat:updated", onChatUpdated);
    socket.on("chat:deleted", onChatDeleted);
    socket.on("whatsapp:connection", onConnectionUpdate);

    fetchChats();

    return () => {
      socket.off("chat:updated", onChatUpdated);
      socket.off("chat:deleted", onChatDeleted);
      socket.off("whatsapp:connection", onConnectionUpdate);
    };
  }, [fetchChats]);

  const markRead = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const toggleRead = useCallback(
    async (chatId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      const isCurrentlyUnread = (chat?.unreadCount ?? 0) > 0;
      const markAsRead = isCurrentlyUnread;
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, unreadCount: markAsRead ? 0 : 1 } : c
        )
      );
      try {
        await api.markChatRead(chatId, markAsRead);
      } catch (err) {
        console.error("Failed to toggle read state:", err);
        fetchChats();
      }
    },
    [chats, fetchChats]
  );

  const togglePin = useCallback(
    async (chatId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      const newPinned = !chat?.isPinned;
      setChats((prev) => {
        const updated = prev.map((c) =>
          c.id === chatId ? { ...c, isPinned: newPinned } : c
        );
        return updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return b.lastMessageTimestamp - a.lastMessageTimestamp;
        });
      });
      try {
        await api.pinChat(chatId, newPinned);
      } catch (err) {
        console.error("Failed to pin chat:", err);
        fetchChats();
      }
    },
    [chats, fetchChats]
  );

  const toggleArchive = useCallback(async (chatId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, isArchived: !c.isArchived } : c
      )
    );
    try {
      const chat = chats.find((c) => c.id === chatId);
      await api.archiveChat(chatId, !chat?.isArchived);
    } catch (err) {
      console.error("Failed to archive chat:", err);
      fetchChats();
    }
  }, [chats, fetchChats]);

  const toggleMute = useCallback(async (chatId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, isMuted: !c.isMuted } : c
      )
    );
    try {
      const chat = chats.find((c) => c.id === chatId);
      await api.muteChat(chatId, !chat?.isMuted);
    } catch (err) {
      console.error("Failed to mute chat:", err);
      fetchChats();
    }
  }, [chats, fetchChats]);

  const deleteChat = useCallback(
    async (chatId: string) => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      try {
        await api.deleteChat(chatId);
      } catch (err) {
        console.error("Failed to delete chat:", err);
        fetchChats();
      }
    },
    [fetchChats]
  );

  return {
    chats,
    isLoading,
    refetch: fetchChats,
    markRead,
    toggleRead,
    togglePin,
    toggleArchive,
    toggleMute,
    deleteChat,
  };
}
