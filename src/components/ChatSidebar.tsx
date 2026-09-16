"use client";

import { useState, useMemo } from "react";
import type { Chat, WhatsAppConnectionState } from "@/types";

interface ChatSidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  connectionState: WhatsAppConnectionState;
  onSelectChat: (chatId: string) => void;
  onDisconnect: () => void;
  onLogout: () => void;
}

/**
 * Left panel chat list with search, avatars, last message preview,
 * timestamps, and unread count badges.
 */
export default function ChatSidebar({
  chats,
  activeChatId,
  connectionState,
  onSelectChat,
  onDisconnect,
  onLogout,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);

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
                minWidth: "160px",
                boxShadow: "var(--shadow-lg)",
                zIndex: 50,
              }}
            >
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
