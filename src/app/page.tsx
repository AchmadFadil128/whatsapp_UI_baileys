"use client";

import { useState, useCallback, useMemo } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatAliases } from "@/hooks/useChatAliases";
import { useStatuses } from "@/hooks/useStatuses";
import { useChannels } from "@/hooks/useChannels";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import QRScreen from "@/components/QRScreen";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import StatusView from "@/components/StatusView";
import NotificationToastContainer from "@/components/NotificationToast";

/**
 * Main page — orchestrates the entire WhatsApp client UI.
 * Shows QR/connection screen when disconnected, and the
 * full chat interface when connected with notifications.
 */
export default function Home() {
  useSocket();

  const {
    connectionState,
    qrCode,
    error,
    isLoading: isConnecting,
    connect,
    disconnect,
    logout,
  } = useWhatsApp();

  const { chats, markRead } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "status" | "channels">("chats");
  const { messages, isLoading: isLoadingMessages, hasMore, loadMore, appendMessage } =
    useMessages(activeChatId);

  const { aliases, setAlias } = useChatAliases();
  const { statuses, isLoading: isLoadingStatuses } = useStatuses();
  const { channels } = useChannels();

  const aliasedChats = useMemo(() => {
    return chats.map(c => ({
      ...c,
      name: aliases[c.id] || c.name,
    }));
  }, [chats, aliases]);

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setActiveChatId(chatId);
      setActiveTab((prev) => (prev === "status" ? "chats" : prev));
      // Optimistically clear badge and tell backend to mark read on WhatsApp
      markRead(chatId);
      getSocket().emit("message:read", chatId);
    },
    [markRead]
  );

  const {
    soundEnabled,
    setSoundEnabled,
    permission: desktopPermission,
    requestDesktopPermission,
    toasts,
    dismissToast,
    playNotificationSound,
  } = useNotifications({
    activeChatId,
    chats: aliasedChats,
    onSelectChat: handleSelectChat,
  });

  // Find the active chat object (or fallback if newly initiated)
  const activeChat = useMemo(
    () =>
      aliasedChats.find((c) => c.id === activeChatId) ||
      channels.find((c) => c.id === activeChatId) ||
      (activeChatId
        ? {
            id: activeChatId,
            name: aliases[activeChatId] || activeChatId.replace("@s.whatsapp.net", "").replace("@g.us", ""),
            lastMessage: "",
            lastMessageTimestamp: Math.floor(Date.now() / 1000),
            unreadCount: 0,
            isGroup: activeChatId.endsWith("@g.us"),
          }
        : null),
    [aliasedChats, channels, activeChatId, aliases]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeChatId) return;
      try {
        const res = await api.sendMessage(activeChatId, text);
        if (res.success && res.data) {
          appendMessage(res.data);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [activeChatId, appendMessage]
  );

  const handleBack = useCallback(() => {
    setActiveChatId(null);
  }, []);

  // Show QR/connection screen when not connected
  const showQRScreen =
    connectionState !== "connected" && connectionState !== "reconnecting";

  if (showQRScreen) {
    return (
      <QRScreen
        connectionState={connectionState}
        qrCode={qrCode}
        error={error}
        isLoading={isConnecting}
        onConnect={connect}
        onRetry={connect}
      />
    );
  }

  return (
    <div className="app-container">
      {/* In-app Toast Notifications */}
      <NotificationToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onSelectChat={handleSelectChat}
      />

      {/* Connection status bar */}
      {connectionState === "reconnecting" && (
        <div
          className="connection-bar connecting"
          style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        >
          <div className="spinner spinner-sm" />
          Reconnecting to WhatsApp...
        </div>
      )}

      {/* Chat Sidebar */}
      <ChatSidebar
        chats={activeTab === "channels" ? channels : aliasedChats}
        activeChatId={activeChatId}
        connectionState={connectionState}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSelectChat={handleSelectChat}
        onDisconnect={disconnect}
        onLogout={logout}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        desktopPermission={desktopPermission}
        onRequestDesktopPermission={requestDesktopPermission}
        onTestNotification={playNotificationSound}
      />

      {/* Main Content Area */}
      {activeTab === "status" ? (
        <StatusView
          statuses={statuses}
          isLoading={isLoadingStatuses}
        />
      ) : (
        <ChatWindow
          chat={activeChat}
          messages={messages}
          isLoading={isLoadingMessages}
          hasMore={hasMore}
          onSendMessage={handleSendMessage}
          onLoadMore={loadMore}
          onBack={activeChatId ? handleBack : undefined}
          onRename={(newName) => activeChatId && setAlias(activeChatId, newName)}
        />
      )}
    </div>
  );
}
