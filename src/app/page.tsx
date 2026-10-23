"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useChats } from "@/hooks/useChats";
import { useMessages } from "@/hooks/useMessages";
import { useNotifications } from "@/hooks/useNotifications";
import { useChatAliases } from "@/hooks/useChatAliases";
import { useContacts } from "@/hooks/useContacts";
import { useStatuses } from "@/hooks/useStatuses";
import { useChannels } from "@/hooks/useChannels";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import QRScreen from "@/components/QRScreen";
import ChatSidebar from "@/components/ChatSidebar";
import ChatWindow from "@/components/ChatWindow";
import StatusView from "@/components/StatusView";
import NotificationToastContainer from "@/components/NotificationToast";
import SecuritySettingsModal from "@/components/SecuritySettingsModal";
import { EyeIcon, EyeOffIcon, SyncIcon } from "@/components/Icons";

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
    pairingCode,
    error,
    isLoading: isConnecting,
    isPairingLoading,
    connect,
    requestPairingCode,
    disconnect,
    logout,
  } = useWhatsApp();

  const {
    chats,
    refetch: refetchChats,
    markRead,
    toggleArchive,
    toggleMute,
    togglePin,
    toggleRead,
    deleteChat,
  } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "status" | "channels">("chats");
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [targetMessage, setTargetMessage] = useState<{ id: string; timestamp?: number } | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const {
    messages,
    isLoading: isLoadingMessages,
    hasMore,
    loadMore,
    appendMessage,
    toggleStar,
    deleteMessage,
  } = useMessages(activeChatId, targetMessage?.timestamp);

  const { aliases, setAlias } = useChatAliases();
  const { contactsMap, fetchContacts } = useContacts();
  const {
    senderList: statusSenders,
    selectedSenderId: selectedStatusSenderId,
    senderStatuses,
    isLoadingList: isLoadingStatusList,
    isLoadingSender: isLoadingStatusSender,
    isLoadingMore: isLoadingMoreStatuses,
    hasMore: hasMoreStatuses,
    fetchSenderStatuses,
    loadMore: loadMoreStatuses,
    clearSelection: clearStatusSelection,
    deleteStatus,
    deleteStatusesBySender,
  } = useStatuses();

  const selectedStatusSender = statusSenders.find(
    (s) => s.senderId === selectedStatusSenderId
  );
  const { channels } = useChannels();

  // Default state: "unavailable" (offline) and false (disabled blue ticks)
  const [presence, setPresence] = useState<"available" | "unavailable">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("whatsapp_presence");
      if (saved === "available" || saved === "unavailable") return saved;
    }
    return "unavailable";
  });

  const [autoReadReceipts, setAutoReadReceipts] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("whatsapp_auto_read");
      if (saved !== null) return saved === "true";
    }
    return false;
  });

  const [privacyBlur, setPrivacyBlur] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("whatsapp_privacy_blur");
      if (saved !== null) return saved === "true";
    }
    return false;
  });

  const [privacyBlurToast, setPrivacyBlurToast] = useState<string | null>(null);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleSyncContacts = useCallback(async () => {
    if (isSyncingContacts) return;
    setIsSyncingContacts(true);
    setSyncToast("Sedang menyinkronkan nama kontak...");
    try {
      const res = await api.syncContacts();
      if (res.success && res.data) {
        const { syncedChats, newlyMapped } = res.data;
        await Promise.all([refetchChats(), fetchContacts()]);
        setSyncToast(
          `Sinkronisasi selesai: ${syncedChats} nama chat & ${newlyMapped} pemetaan diperbarui`
        );
      } else {
        await Promise.all([refetchChats(), fetchContacts()]);
        setSyncToast("Nama kontak dan chat berhasil diperbarui");
      }
    } catch (err: any) {
      console.error("Gagal menyinkronkan kontak:", err);
      setSyncToast("Gagal menyinkronkan kontak");
    } finally {
      setIsSyncingContacts(false);
      setTimeout(() => setSyncToast(null), 3000);
    }
  }, [isSyncingContacts, refetchChats, fetchContacts]);

  const handleTogglePrivacyBlur = useCallback(() => {
    setPrivacyBlur((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("whatsapp_privacy_blur", String(next));
      }
      setPrivacyBlurToast(next ? "Blur Privasi Aktif (Alt + /)" : "Blur Privasi Nonaktif (Alt + /)");
      setTimeout(() => setPrivacyBlurToast(null), 2000);
      return next;
    });
  }, []);

  // Shortcut Alt + / for toggling privacy blur
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "/" || e.key === "?" || e.code === "Slash")) {
        e.preventDefault();
        handleTogglePrivacyBlur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTogglePrivacyBlur]);

  const handleTogglePresence = useCallback(async () => {
    const nextPresence = presence === "available" ? "unavailable" : "available";
    try {
      await api.setPresence(nextPresence);
      setPresence(nextPresence);
      if (typeof window !== "undefined") {
        localStorage.setItem("whatsapp_presence", nextPresence);
      }
    } catch (err) {
      console.error("Failed to set presence", err);
    }
  }, [presence]);

  const handleToggleAutoRead = useCallback(() => {
    setAutoReadReceipts((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("whatsapp_auto_read", String(next));
      }
      return next;
    });
  }, []);

  // Sync presence to backend whenever connected or presence changes
  useEffect(() => {
    if (connectionState === "connected") {
      api.setPresence(presence).catch((err) => {
        console.error("Failed to sync presence with backend", err);
      });
    }
  }, [connectionState, presence]);

  const aliasedChats = useMemo(() => {
    return chats.map(c => ({
      ...c,
      name: aliases[c.id] || c.name,
    }));
  }, [chats, aliases]);

  const aliasedChannels = useMemo(() => {
    return channels.map(c => ({
      ...c,
      name: aliases[c.id] || c.name,
    }));
  }, [channels, aliases]);

  const handleSelectChat = useCallback(
    (chatId: string, messageId?: string, timestamp?: number) => {
      setActiveChatId(chatId);
      setActiveTab((prev) => (prev === "status" ? "chats" : prev));
      setFocusTrigger((prev) => prev + 1);
      if (messageId) {
        setTargetMessage({ id: messageId, timestamp });
      } else {
        setTargetMessage(null);
      }
      // Optimistically clear badge and conditionally tell backend to mark read on WhatsApp
      markRead(chatId);
      if (autoReadReceipts) {
        getSocket().emit("message:read", chatId);
      }
    },
    [markRead, autoReadReceipts]
  );

  const handleJumpToMessage = useCallback(async (messageId: string) => {
    try {
      const res = await api.getMessageById(messageId);
      if (res.success && res.data) {
        setTargetMessage({ id: res.data.id, timestamp: res.data.timestamp });
      }
    } catch (err) {
      console.error("Failed to jump to message:", err);
    }
  }, []);

  // Auto-read incoming messages for the active chat
  useEffect(() => {
    if (activeChatId) {
      const activeChatData =
        aliasedChats.find((c) => c.id === activeChatId) ||
        aliasedChannels.find((c) => c.id === activeChatId);
      
      if (activeChatData && activeChatData.unreadCount > 0) {
        markRead(activeChatId);
        if (autoReadReceipts) {
          getSocket().emit("message:read", activeChatId);
        }
      }
    }
  }, [activeChatId, autoReadReceipts, aliasedChats, aliasedChannels, markRead]);

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
      aliasedChannels.find((c) => c.id === activeChatId) ||
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
    [aliasedChats, aliasedChannels, activeChatId, aliases]
  );

  const handleSendMessage = useCallback(
    async (text: string, file?: File, replyToMessageId?: string) => {
      if (!activeChatId) return;
      try {
        let res;
        if (file) {
          res = await api.sendMediaMessage(activeChatId, file, text, replyToMessageId);
        } else {
          res = await api.sendMessage(activeChatId, text, replyToMessageId);
        }
        
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
    setTargetMessage(null);
  }, []);

  // Show QR/connection screen when not connected
  const showQRScreen =
    connectionState !== "connected" && connectionState !== "reconnecting";

  if (showQRScreen) {
    return (
      <>
        <QRScreen
          connectionState={connectionState}
          qrCode={qrCode}
          pairingCode={pairingCode}
          error={error}
          isLoading={isConnecting}
          isPairingLoading={isPairingLoading}
          onConnect={connect}
          onRetry={connect}
          onRequestPairingCode={requestPairingCode}
          onOpenSecuritySettings={() => setIsSecurityModalOpen(true)}
        />
        <SecuritySettingsModal
          isOpen={isSecurityModalOpen}
          onClose={() => setIsSecurityModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className={`app-container ${privacyBlur ? "privacy-blur-active" : ""}`}>
      {/* Privacy Blur Toast Notification */}
      {privacyBlurToast && (
        <div className="privacy-blur-toast" role="status">
          {privacyBlur ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          <span>{privacyBlurToast}</span>
        </div>
      )}

      {/* Sync Feedback Toast */}
      {syncToast && (
        <div className="sync-feedback-toast" role="status">
          <SyncIcon size={18} className={isSyncingContacts ? "sync-spinning" : ""} />
          <span>{syncToast}</span>
        </div>
      )}

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
        chats={activeTab === "channels" ? aliasedChannels : aliasedChats}
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
        presence={presence}
        onTogglePresence={handleTogglePresence}
        autoReadReceipts={autoReadReceipts}
        onToggleAutoRead={handleToggleAutoRead}
        privacyBlur={privacyBlur}
        onTogglePrivacyBlur={handleTogglePrivacyBlur}
        onSyncContacts={handleSyncContacts}
        isSyncingContacts={isSyncingContacts}
        onToggleArchive={toggleArchive}
        onToggleMute={toggleMute}
        onTogglePin={togglePin}
        onToggleRead={toggleRead}
        onDeleteChat={(id) => {
          deleteChat(id);
          if (activeChatId === id) setActiveChatId(null);
        }}
        onOpenSecuritySettings={() => setIsSecurityModalOpen(true)}
        statusSenders={statusSenders}
        selectedStatusSenderId={selectedStatusSenderId}
        onSelectStatusSender={fetchSenderStatuses}
        isLoadingStatusList={isLoadingStatusList}
      />

      {/* Main Content Area */}
      {activeTab === "status" ? (
        <StatusView
          selectedSenderId={selectedStatusSenderId}
          selectedSenderName={selectedStatusSender?.senderName}
          statuses={senderStatuses}
          isLoading={isLoadingStatusSender}
          isLoadingMore={isLoadingMoreStatuses}
          hasMore={hasMoreStatuses}
          onLoadMore={loadMoreStatuses}
          onDeleteStatus={deleteStatus}
          onDeleteSenderStatuses={deleteStatusesBySender}
          onClearSelection={clearStatusSelection}
        />
      ) : (
        <ChatWindow
          chat={activeChat}
          messages={messages}
          aliases={aliases}
          contactsMap={contactsMap}
          isLoading={isLoadingMessages}
          hasMore={hasMore}
          highlightedMessageId={targetMessage?.id}
          focusTrigger={focusTrigger}
          onSendMessage={handleSendMessage}
          onLoadMore={loadMore}
          onJumpToMessage={handleJumpToMessage}
          onBack={activeChatId ? handleBack : undefined}
          onRename={(newName) => activeChatId && setAlias(activeChatId, newName)}
          onToggleStar={toggleStar}
          onDeleteMessage={deleteMessage}
        />
      )}

      {/* Security & 2FA Modal */}
      <SecuritySettingsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />
    </div>
  );
}
