"use client";

import { useState, useMemo, useEffect } from "react";
import type { Chat, WhatsAppConnectionState, SearchMessageResult } from "@/types";
import * as api from "@/lib/api";

interface ChatSidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  connectionState: WhatsAppConnectionState;
  activeTab: "chats" | "status" | "channels";
  onTabChange: (tab: "chats" | "status" | "channels") => void;
  onSelectChat: (chatId: string, messageId?: string, timestamp?: number) => void;
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
  onToggleArchive?: (chatId: string) => void;
  onToggleMute?: (chatId: string) => void;
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
  onToggleArchive,
  onToggleMute,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);

  // Message search state (triggered by % prefix)
  const isMessageSearch = search.startsWith("%");
  const messageSearchQuery = isMessageSearch ? search.slice(1).trim() : "";
  const [messageResults, setMessageResults] = useState<SearchMessageResult[]>([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [searchScope, setSearchScope] = useState<"all" | "current">("all");

  useEffect(() => {
    if (!search.startsWith("%")) {
      setMessageResults([]);
      setIsSearchingMessages(false);
      return;
    }

    const query = search.slice(1).trim();
    if (!query) {
      setMessageResults([]);
      setIsSearchingMessages(false);
      return;
    }

    setIsSearchingMessages(true);
    const timer = setTimeout(async () => {
      try {
        const targetChatId =
          searchScope === "current" && activeChatId ? activeChatId : undefined;
        const res = await api.searchMessages(query, targetChatId);
        if (res.success && res.data) {
          setMessageResults(res.data);
        } else {
          setMessageResults([]);
        }
      } catch (err) {
        console.error("Failed to search messages:", err);
        setMessageResults([]);
      } finally {
        setIsSearchingMessages(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, searchScope, activeChatId]);

  function renderHighlightedSnippet(text: string, query: string) {
    if (!query || !text) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="search-match">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  const activeChats = useMemo(() => {
    return chats.filter(c => !c.isArchived);
  }, [chats]);

  const archivedChats = useMemo(() => {
    return chats.filter(c => c.isArchived);
  }, [chats]);

  const filteredChats = useMemo(() => {
    const listToFilter = showArchived ? archivedChats : activeChats;
    if (!search.trim() || isMessageSearch) return listToFilter;
    const q = search.toLowerCase();
    return listToFilter.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
    );
  }, [activeChats, archivedChats, search, showArchived, isMessageSearch]);

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

  function formatLastMessage(lastMessage?: string): string {
    if (!lastMessage) return "\u00A0";
    if (
      lastMessage.startsWith("[Event:") ||
      lastMessage === "[unknown]" ||
      lastMessage === "Unsupported message"
    ) {
      return "\u00A0";
    }
    return lastMessage;
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
        <div className="sidebar-search-inner">
          <span className="sidebar-search-icon">
            {isMessageSearch ? "💬" : "🔍"}
          </span>
          <input
            type="text"
            placeholder={
              showArchived
                ? "Search archived chats"
                : "Search chats (or % for messages)..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => setSearch("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Message search mode banner & scope toggle */}
        {isMessageSearch && (
          <div className="search-mode-banner">
            <div className="search-mode-indicator">
              <span className="search-mode-badge">💬 Pesan</span>
              {messageSearchQuery && (
                <span className="search-mode-query">&quot;{messageSearchQuery}&quot;</span>
              )}
            </div>
            {activeChatId && (
              <div className="search-scope-toggle">
                <button
                  type="button"
                  className={`scope-pill ${searchScope === "all" ? "active" : ""}`}
                  onClick={() => setSearchScope("all")}
                >
                  Semua
                </button>
                <button
                  type="button"
                  className={`scope-pill ${searchScope === "current" ? "active" : ""}`}
                  onClick={() => setSearchScope("current")}
                >
                  Chat Ini
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggestion prompt to search message content when doing normal search */}
      {!isMessageSearch && search.trim() && (
        <div
          className="search-switch-prompt"
          onClick={() => setSearch("%" + search.trim())}
          role="button"
          tabIndex={0}
        >
          <span style={{ fontSize: "1rem" }}>💬</span>
          <div className="search-switch-prompt-text">
            <span>Cari di dalam pesan: <strong>&quot;{search.trim()}&quot;</strong></span>
            <span className="search-switch-prompt-sub">Ketik <code>%{search.trim()}</code></span>
          </div>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>→</span>
        </div>
      )}

      {/* Archive Toggle */}
      {activeTab === "chats" && archivedChats.length > 0 && !search.trim() && (
        <div 
          className="archive-toggle" 
          onClick={() => setShowArchived(!showArchived)}
          style={{
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            borderBottom: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
            fontSize: "0.95rem"
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>📥</span>
          <span style={{ flex: 1, fontWeight: 500 }}>Archived</span>
          <span style={{ color: "var(--accent-teal)", fontWeight: 500 }}>
            {archivedChats.filter(c => c.unreadCount > 0).length > 0 ? (
              archivedChats.filter(c => c.unreadCount > 0).length
            ) : ""}
          </span>
        </div>
      )}

      {/* Chat List */}
      <div className="chat-list" style={{ position: "relative" }}>
        {isMessageSearch ? (
          /* ─── Message Search Mode Rendering ─── */
          !messageSearchQuery ? (
            <div className="search-guide-box">
              <div className="search-guide-icon">💬</div>
              <h4>Cari di Dalam Pesan Percakapan</h4>
              <p>
                Ketik kata kunci setelah tanda <strong>%</strong> untuk mencari isi pesan di riwayat obrolan.
              </p>
              <div className="search-chips">
                <span className="search-chips-label">Contoh:</span>
                {["%halo", "%rekening", "%link", "%urgent", "%meeting"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="search-chip"
                    onClick={() => setSearch(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : isSearchingMessages ? (
            <div className="search-loading-box">
              <div className="spinner spinner-sm" />
              <span>Mencari di dalam percakapan...</span>
            </div>
          ) : messageResults.length === 0 ? (
            <div className="search-empty-box">
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔎</div>
              <p style={{ fontWeight: 500 }}>Tidak ada pesan ditemukan</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                Tidak ada percakapan yang cocok dengan &quot;%{messageSearchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="message-search-results">
              <div className="search-results-header">
                <span>Ditemukan {messageResults.length} pesan:</span>
              </div>
              {messageResults.map((msg) => {
                const chatObj = chats.find((c) => c.id === msg.chatId);
                const chatDisplayName = chatObj?.name || msg.chatName || msg.chatId;

                return (
                  <div
                    key={msg.id}
                    className={`chat-item message-search-item ${
                      activeChatId === msg.chatId ? "active" : ""
                    }`}
                    onClick={() => onSelectChat(msg.chatId, msg.id, msg.timestamp)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSelectChat(msg.chatId, msg.id, msg.timestamp);
                    }}
                  >
                    <div className="chat-avatar">
                      {chatObj?.profilePicUrl ? (
                        <img src={chatObj.profilePicUrl} alt={chatDisplayName} />
                      ) : (
                        getInitials(chatDisplayName)
                      )}
                    </div>
                    <div className="chat-info">
                      <div className="chat-info-top">
                        <span className="chat-name">{chatDisplayName}</span>
                        <span className="chat-timestamp">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <div className="chat-info-bottom">
                        <span className="chat-last-message message-search-snippet">
                          {msg.fromMe ? (
                            <span className="sender-tag from-me">Anda: </span>
                          ) : msg.pushName ? (
                            <span className="sender-tag other">{msg.pushName}: </span>
                          ) : null}
                          {renderHighlightedSnippet(msg.text || "", messageSearchQuery)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredChats.length === 0 ? (
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
                    style={{ fontSize: "0.85rem", width: "100%", marginBottom: "8px" }}
                  >
                    💬 Chat with +{search.trim().replace(/\D/g, "")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSearch("%" + search.trim())}
                  style={{ fontSize: "0.85rem", width: "100%" }}
                >
                  💬 Cari &quot;{search.trim()}&quot; di dalam pesan (%{search.trim()})
                </button>
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
                  <span className="chat-last-message" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {chat.isMuted && <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>🔇</span>}
                    {formatLastMessage(chat.lastMessage)}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="chat-unread-badge" style={{ background: chat.isMuted ? "var(--text-tertiary)" : "var(--accent-teal)" }}>
                      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Individual Chat Context Menu Trigger (Right Click) */}
              <div 
                style={{ position: "absolute", right: "20px", top: "50%", transform: "translateY(-50%)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setContextMenuChatId(contextMenuChatId === chat.id ? null : chat.id);
                }}
              >
                <button className="btn btn-ghost chat-item-menu-btn" style={{ padding: "4px", display: "none" }}>
                  ⋮
                </button>
              </div>

              {/* Context Menu Dropdown */}
              {contextMenuChatId === chat.id && (
                <div
                  style={{
                    position: "absolute",
                    right: "40px",
                    top: "40px",
                    background: "var(--bg-header)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    padding: "4px 0",
                    minWidth: "150px",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: 50,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onToggleArchive && (
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchive(chat.id);
                        setContextMenuChatId(null);
                        // If we unarchived it, maybe we want to keep them in view or not. It'll just disappear.
                        if (chat.isArchived && filteredChats.length === 1) {
                           setShowArchived(false); // return to main if it was the last archived chat
                        }
                      }}
                      style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "8px 16px", fontSize: "0.875rem" }}
                    >
                      {chat.isArchived ? "📤 Unarchive" : "📥 Archive"}
                    </button>
                  )}
                  {onToggleMute && (
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMute(chat.id);
                        setContextMenuChatId(null);
                      }}
                      style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, padding: "8px 16px", fontSize: "0.875rem" }}
                    >
                      {chat.isMuted ? "🔊 Unmute" : "🔇 Mute"}
                    </button>
                  )}
                </div>
              )}

            </div>
          ))
        )}
      </div>
    </div>
  );
}
