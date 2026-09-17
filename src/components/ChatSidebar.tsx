"use client";

import { useState, useMemo } from "react";
import type { Chat, WhatsAppConnectionState } from "@/types";

interface ChatSidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  connectionState: WhatsAppConnectionState;
  activeTab: "chats" | "status" | "channels";
  onTabChange: (tab: "chats" | "status" | "channels") => void;
  onSelectChat: (chatId: string) => void;
  onDisconnect: () => void;
  onLogout: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  desktopPermission?: NotificationPermission;
  onRequestDesktopPermission?: () => void;
  onTestNotification?: () => void;
  presence?: "available" | "unavailable";
  onTogglePresence?: () => void;
  autoReadReceipts?: boolean;
  onToggleAutoRead?: () => void;
}

/**
 * Left panel chat list with search, avatars, last message preview,
 * timestamps, unread count badges, and notification controls.
 */
export default function ChatSidebar({
  chats,
  activeChatId,
  connectionState,
  activeTab,
  onTabChange,
  onSelectChat,
  onDisconnect,
  onLogout,
  soundEnabled = true,
  onToggleSound,
  desktopPermission = "default",
  onRequestDesktopPermission,
  onTestNotification,
  presence,
  onTogglePresence,
  autoReadReceipts = true,
  onToggleAutoRead,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chats;
    const q = search.toLowerCase();
    return chats.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
    );
  }, [chats, search]);

  function formatTimestamp(ts: number): string {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    const diffDays = Math.floor(
      (today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            className={`status-dot ${
              connectionState === "connected"
                ? "connected"
                : connectionState === "connecting" ||
                  connectionState === "reconnecting"
                ? "connecting"
                : connectionState === "error"
                ? "error"
                : "disconnected"
            }`}
          />
          <h2>Chats</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {/* Sound Toggle Button */}
          {onToggleSound && (
            <button
              className="btn btn-ghost"
              onClick={onToggleSound}
              aria-label={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
              title={soundEnabled ? "Notification sound: On" : "Notification sound: Off"}
              style={{ padding: "6px 8px", fontSize: "1.05rem" }}
            >
              {soundEnabled ? "🔔" : "🔕"}
            </button>
          )}

          <div style={{ position: "relative" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="Menu"
              style={{ padding: "6px 8px", fontSize: "1.1rem" }}
            >
              ⋮
            </button>
            {showMenu && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  background: "var(--bg-header)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px 0",
                  minWidth: "190px",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 50,
                }}
              >
                {onToggleSound && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowMenu(false);
                      onToggleSound();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {soundEnabled ? "🔕 Mute Sound" : "🔔 Unmute Sound"}
                  </button>
                )}
                {onTogglePresence && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowMenu(false);
                      onTogglePresence();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {presence === "available" ? "🟢 Go Offline" : "⚪ Go Online"}
                  </button>
                )}
                {onToggleAutoRead && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowMenu(false);
                      onToggleAutoRead();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {autoReadReceipts ? "👁️ Disable Blue Ticks" : "👁️ Enable Blue Ticks"}
                  </button>
                )}
                {onTestNotification && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowMenu(false);
                      onTestNotification();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                    }}
                  >
                    🔊 Test Sound
                  </button>
                )}
                {desktopPermission !== "granted" && onRequestDesktopPermission && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setShowMenu(false);
                      onRequestDesktopPermission();
                    }}
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "8px 16px",
                      fontSize: "0.875rem",
                      color: "var(--accent-blue)",
                    }}
                  >
                    💬 Enable Alerts
                  </button>
                )}
                <div style={{ height: "1px", background: "var(--border-default)", margin: "4px 0" }} />
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowMenu(false);
                    onDisconnect();
                  }}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    borderRadius: 0,
                    padding: "8px 16px",
                    fontSize: "0.875rem",
                  }}
                >
                  Disconnect
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowMenu(false);
                    onLogout();
                  }}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    borderRadius: 0,
                    padding: "8px 16px",
                    fontSize: "0.875rem",
                    color: "var(--accent-danger)",
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Notification Banner */}
      {!dismissedBanner && desktopPermission === "default" && onRequestDesktopPermission && (
        <div
          className="notification-banner"
          onClick={onRequestDesktopPermission}
          role="button"
          tabIndex={0}
        >
          <div className="notification-banner-icon">🔔</div>
          <div className="notification-banner-text">
            <div className="notification-banner-title">Get notified of new messages</div>
            <div className="notification-banner-sub">Turn on desktop notifications &gt;</div>
          </div>
          <button
            className="notification-banner-close"
            onClick={(e) => {
              e.stopPropagation();
              setDismissedBanner(true);
            }}
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === "chats" ? "active" : ""}`}
          onClick={() => onTabChange("chats")}
        >
          💬 Chats
        </button>
        <button
          className={`sidebar-tab ${activeTab === "status" ? "active" : ""}`}
          onClick={() => onTabChange("status")}
        >
          📡 Status
        </button>
        <button
          className={`sidebar-tab ${activeTab === "channels" ? "active" : ""}`}
          onClick={() => onTabChange("channels")}
        >
          📢 Channels
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search or start new chat"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Chat List */}
      <div className="chat-list">
        {filteredChats.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: "0.875rem",
            }}
          >
            {search.trim() ? (
              <div>
                <p style={{ marginBottom: "12px" }}>No chats found</p>
                {/^[0-9+]+$/.test(search.trim()) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      let cleaned = search.trim().replace(/\D/g, "");
                      if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
                      const jid = cleaned + "@s.whatsapp.net";
                      onSelectChat(jid);
                      setSearch("");
                    }}
                    style={{ fontSize: "0.85rem", width: "100%" }}
                  >
                    💬 Chat with +{search.trim().replace(/\D/g, "")}
                  </button>
                )}
              </div>
            ) : connectionState === "connected" ? (
              "No chats yet — waiting for sync..."
            ) : (
              "Connect to see your chats"
            )}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                activeChatId === chat.id ? "active" : ""
              }`}
              onClick={() => onSelectChat(chat.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectChat(chat.id);
              }}
            >
              <div className="chat-avatar">
                {chat.profilePicUrl ? (
                  <img src={chat.profilePicUrl} alt={chat.name} />
                ) : (
                  getInitials(chat.name || "?")
                )}
              </div>
              <div className="chat-info">
                <div className="chat-info-top">
                  <span className="chat-name">{chat.name}</span>
                  <span
                    className={`chat-timestamp ${
                      chat.unreadCount > 0 ? "unread" : ""
                    }`}
                  >
                    {formatTimestamp(chat.lastMessageTimestamp)}
                  </span>
                </div>
                <div className="chat-info-bottom">
                  <span className="chat-last-message">
                    {chat.lastMessage || "\u00A0"}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="chat-unread-badge">
                      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
