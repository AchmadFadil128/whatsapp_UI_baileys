"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { playNotificationSound } from "@/lib/notificationSound";
import type { Chat, MessageEvent } from "@/types";

export interface ToastNotification {
  id: string;
  chatId: string;
  title: string;
  body: string;
  timestamp: number;
}

interface UseNotificationsOptions {
  activeChatId: string | null;
  chats: Chat[];
  onSelectChat: (chatId: string) => void;
}

export function useNotifications({
  activeChatId,
  chats,
  onSelectChat,
}: UseNotificationsOptions) {
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [desktopEnabled, setDesktopEnabledState] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const activeChatIdRef = useRef(activeChatId);
  const chatsRef = useRef(chats);
  const onSelectChatRef = useRef(onSelectChat);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    onSelectChatRef.current = onSelectChat;
  }, [onSelectChat]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedSound = localStorage.getItem("whatsapp_sound_enabled");
      if (savedSound !== null) {
        setSoundEnabledState(savedSound === "true");
      }

      const savedDesktop = localStorage.getItem("whatsapp_desktop_enabled");
      if (savedDesktop !== null) {
        setDesktopEnabledState(savedDesktop === "true");
      }

      if ("Notification" in window) {
        setPermission(Notification.permission);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setSoundEnabledState(enabled);
    try {
      localStorage.setItem("whatsapp_sound_enabled", String(enabled));
    } catch {}
  }, []);

  const setDesktopEnabled = useCallback((enabled: boolean) => {
    setDesktopEnabledState(enabled);
    try {
      localStorage.setItem("whatsapp_desktop_enabled", String(enabled));
    } catch {}
  }, []);

  const requestDesktopPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        setDesktopEnabled(true);
      }
      return perm;
    } catch {
      return "denied";
    }
  }, [setDesktopEnabled]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Document Title Badge ─────────────────────────────────────
  useEffect(() => {
    if (typeof document === "undefined") return;

    const totalUnread = chats.reduce(
      (sum, c) => sum + (c.unreadCount || 0),
      0
    );

    if (totalUnread > 0) {
      document.title = `(${totalUnread}) WhatsApp`;
    } else {
      document.title = "WhatsApp";
    }
  }, [chats]);

  // ─── Incoming Message Notification Handler ────────────────────
  useEffect(() => {
    const socket = getSocket();

    function handleMessageReceived(data: MessageEvent) {
      const message = data.message;
      // Do not notify for user's own sent messages
      if (message.fromMe) return;

      const currentActiveId = activeChatIdRef.current;
      const isCurrentChat = currentActiveId === message.chatId;
      const isWindowFocused =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();

      // Find sender / chat title
      const chat = chatsRef.current.find((c) => c.id === message.chatId);
      const title =
        chat?.name ||
        message.pushName ||
        message.chatId.replace("@s.whatsapp.net", "").replace("@g.us", "");

      // Format preview snippet
      let preview = message.text || "";
      if (!preview) {
        switch (message.type) {
          case "image":
            preview = "📷 Photo";
            break;
          case "video":
            preview = "🎥 Video";
            break;
          case "audio":
            preview = "🎵 Voice message";
            break;
          case "document":
            preview = "📄 Document";
            break;
          case "sticker":
            preview = "💟 Sticker";
            break;
          default:
            preview = `[${message.type}]`;
        }
      }

      // 1. Play audio chime
      if (soundEnabled) {
        playNotificationSound();
      }

      // 2. Trigger native desktop notification if window not focused or in another chat
      if (!isWindowFocused || !isCurrentChat) {
        if (
          desktopEnabled &&
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            const notification = new Notification(title, {
              body: preview,
              icon: "/favicon.ico",
              tag: `wa-chat-${message.chatId}`,
            });

            notification.onclick = () => {
              window.focus();
              onSelectChatRef.current(message.chatId);
              notification.close();
            };
          } catch (err) {
            console.debug("Failed to spawn native notification:", err);
          }
        }

        // 3. Show in-app toast banner
        const newToast: ToastNotification = {
          id: message.id || String(Date.now()),
          chatId: message.chatId,
          title,
          body: preview,
          timestamp: message.timestamp || Math.floor(Date.now() / 1000),
        };

        setToasts((prev) => [newToast, ...prev.slice(0, 3)]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, 5000);
      }
    }

    socket.on("message:received", handleMessageReceived);

    return () => {
      socket.off("message:received", handleMessageReceived);
    };
  }, [soundEnabled, desktopEnabled]);

  return {
    soundEnabled,
    setSoundEnabled,
    desktopEnabled,
    setDesktopEnabled,
    permission,
    requestDesktopPermission,
    toasts,
    dismissToast,
    playNotificationSound,
  };
}
