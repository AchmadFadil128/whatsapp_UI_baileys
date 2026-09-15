"use client";

import { useState, useCallback, useMemo } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import * as api from "@/lib/api";
import QRScreen from "@/components/QRScreen";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";

/**
 * Main page — orchestrates the entire WhatsApp client UI.
 * Shows QR/connection screen when disconnected, and the
 * full chat interface when connected.
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

  const { chats } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const { messages, isLoading: isLoadingMessages, hasMore, loadMore } =
    useMessages(activeChatId);

  // Find the active chat object
  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeChatId) return;
      try {
        await api.sendMessage(activeChatId, text);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [activeChatId]
  );

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

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
        chats={chats}
        activeChatId={activeChatId}
        connectionState={connectionState}
        onSelectChat={handleSelectChat}
        onDisconnect={disconnect}
        onLogout={logout}
      />

      {/* Chat Window */}
      <ChatWindow
        chat={activeChat}
        messages={messages}
        isLoading={isLoadingMessages}
        hasMore={hasMore}
        onSendMessage={handleSendMessage}
        onLoadMore={loadMore}
        onBack={activeChatId ? handleBack : undefined}
      />
    </div>
  );
}
