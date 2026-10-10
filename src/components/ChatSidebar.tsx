"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Chat, WhatsAppConnectionState, SearchMessageResult } from "@/types";
import * as api from "@/lib/api";
import {
  ChatsIcon,
  StatusIcon,
  ChannelsIcon,
  SettingsIcon,
  SearchIcon,
  MenuIcon,
  NewChatIcon,
  BackIcon,
  CloseIcon,
  BellIcon,
  BellOffIcon,
  ArchiveIcon,
  MutedIcon,
  UserIcon,
  GroupIcon,
} from "@/components/Icons";

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

type ChatFilter = "all" | "unread" | "groups";

const TAB_TITLES: Record<ChatSidebarProps["activeTab"], string> = {
  chats: "Chats",
  status: "Status",
  channels: "Channels",
};

/**
 * Left side of the app, modelled after WhatsApp Desktop:
 * a narrow navigation rail (Chats / Status / Channels / Settings)
 * plus the chat list panel with search, filter chips, avatars,
 * last message preview, timestamps and unread badges.
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
  presence = "unavailable",
  onTogglePresence,
  autoReadReceipts = false,
  onToggleAutoRead,
  onToggleArchive,
  onToggleMute,
}: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<"header" | "rail" | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Close popup menus on outside click / Escape
  useEffect(() => {
    if (!menuAnchor && !contextMenuChatId) return;
    function close() {
      setMenuAnchor(null);
      setContextMenuChatId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuAnchor, contextMenuChatId]);

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

  const totalUnreadChats = useMemo(
    () => activeChats.filter((c) => c.unreadCount > 0 && !c.isMuted).length,
    [activeChats]
  );

  const filteredChats = useMemo(() => {
    let listToFilter = showArchived ? archivedChats : activeChats;
    if (chatFilter === "unread") listToFilter = listToFilter.filter((c) => c.unreadCount > 0);
    if (chatFilter === "groups") listToFilter = listToFilter.filter((c) => c.isGroup);
    if (!search.trim() || isMessageSearch) return listToFilter;
    const q = search.toLowerCase();
    return listToFilter.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
    );
  }, [activeChats, archivedChats, search, showArchived, isMessageSearch, chatFilter]);

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
      return date.toLocaleDateString([], { weekday: "long" });
    }
    return date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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

  function renderAvatar(name: string, isGroup: boolean, picUrl?: string) {
    return (
      <div className="chat-avatar">
        {picUrl ? (
          <img src={picUrl} alt={name} />
        ) : isGroup ? (
          <GroupIcon size={28} />
        ) : (
          <UserIcon size={30} />
        )}
      </div>
    );
  }

  const connectionClass =
    connectionState === "connected"
      ? presence === "unavailable"
        ? "disconnected"
        : "connected"
      : connectionState === "connecting" || connectionState === "reconnecting"
      ? "connecting"
      : connectionState === "error"
      ? "error"
      : "disconnected";

  function renderMainMenu() {
    return (
      <div
        className={`dropdown-menu ${menuAnchor === "rail" ? "dropdown-menu-rail" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        {onToggleSound && (
          <button
            className="dropdown-item"
            onClick={() => {
              setMenuAnchor(null);
              onToggleSound();
            }}
          >
            {soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
          </button>
        )}
        {onTogglePresence && (
          <button
            className="dropdown-item"
            onClick={() => {
              setMenuAnchor(null);
              onTogglePresence();
            }}
          >
            {presence === "available" ? "Appear offline" : "Appear online (Offline)"}
          </button>
        )}
        {onToggleAutoRead && (
          <button
            className="dropdown-item"
            onClick={() => {
              setMenuAnchor(null);
              onToggleAutoRead();
            }}
          >
            {autoReadReceipts ? "Turn off read receipts" : "Turn on read receipts (Off)"}
          </button>
        )}
        {onTestNotification && (
          <button
            className="dropdown-item"
            onClick={() => {
              setMenuAnchor(null);
              onTestNotification();
            }}
          >
            Test notification sound
          </button>
        )}
        {desktopPermission !== "granted" && onRequestDesktopPermission && (
          <button
            className="dropdown-item accent"
            onClick={() => {
              setMenuAnchor(null);
              onRequestDesktopPermission();
            }}
          >
            Enable desktop alerts
          </button>
        )}
        <div className="dropdown-divider" />
        <button
          className="dropdown-item"
          onClick={() => {
            setMenuAnchor(null);
            onDisconnect();
          }}
        >
          Disconnect
        </button>
        <button
          className="dropdown-item danger"
          onClick={() => {
            setMenuAnchor(null);
            onLogout();
          }}
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-shell">
      {/* ─── Navigation Rail ─── */}
      <nav className="nav-rail" aria-label="Main navigation">
        <div className="nav-rail-group">
          <button
            id="nav-chats"
            className={`nav-rail-btn ${activeTab === "chats" ? "active" : ""}`}
            onClick={() => onTabChange("chats")}
            title="Chats"
            aria-label="Chats"
          >
            <ChatsIcon />
            {totalUnreadChats > 0 && (
              <span className="nav-rail-badge">
                {totalUnreadChats > 99 ? "99+" : totalUnreadChats}
              </span>
            )}
          </button>
          <button
            id="nav-status"
            className={`nav-rail-btn ${activeTab === "status" ? "active" : ""}`}
            onClick={() => onTabChange("status")}
            title="Status"
            aria-label="Status"
          >
            <StatusIcon />
          </button>
          <button
            id="nav-channels"
            className={`nav-rail-btn ${activeTab === "channels" ? "active" : ""}`}
            onClick={() => onTabChange("channels")}
            title="Channels"
            aria-label="Channels"
          >
            <ChannelsIcon />
          </button>
        </div>

        <div className="nav-rail-group">
          {onToggleSound && (
            <button
              id="nav-sound"
              className="nav-rail-btn"
              onClick={onToggleSound}
              title={soundEnabled ? "Notification sound: On" : "Notification sound: Off"}
              aria-label={soundEnabled ? "Mute notification sound" : "Unmute notification sound"}
            >
              {soundEnabled ? <BellIcon /> : <BellOffIcon />}
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button
              id="nav-settings"
              className={`nav-rail-btn ${menuAnchor === "rail" ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setContextMenuChatId(null);
                setMenuAnchor(menuAnchor === "rail" ? null : "rail");
              }}
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon />
            </button>
            {menuAnchor === "rail" && renderMainMenu()}
          </div>
          <div
            className="nav-rail-profile"
            title={`WhatsApp: ${connectionState}${presence ? ` · ${presence === "available" ? "online" : "offline"}` : ""}`}
          >
            <UserIcon size={22} />
            <span className={`status-dot ${connectionClass}`} />
          </div>
        </div>
      </nav>

      {/* ─── Chat List Panel ─── */}
      <div className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          {showArchived ? (
            <div className="sidebar-header-title">
              <button
                className="icon-btn"
                onClick={() => setShowArchived(false)}
                aria-label="Back to chats"
              >
                <BackIcon size={22} />
              </button>
              <h2>Archived</h2>
            </div>
          ) : (
            <h2>{TAB_TITLES[activeTab]}</h2>
          )}
          <div className="sidebar-header-actions">
            <button
              id="new-chat-btn"
              className="icon-btn"
              title="New chat"
              aria-label="New chat"
              onClick={() => searchInputRef.current?.focus()}
            >
              <NewChatIcon size={22} />
            </button>
            <div style={{ position: "relative" }}>
              <button
                id="sidebar-menu-btn"
                className={`icon-btn ${menuAnchor === "header" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setContextMenuChatId(null);
                  setMenuAnchor(menuAnchor === "header" ? null : "header");
                }}
                aria-label="Menu"
                title="Menu"
              >
                <MenuIcon size={22} />
              </button>
              {menuAnchor === "header" && renderMainMenu()}
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
            <div className="notification-banner-icon">
              <BellOffIcon size={22} />
            </div>
            <div className="notification-banner-text">
              <div className="notification-banner-title">Get notified of new messages</div>
              <div className="notification-banner-sub">Turn on desktop notifications ›</div>
            </div>
            <button
              className="notification-banner-close"
              onClick={(e) => {
                e.stopPropagation();
                setDismissedBanner(true);
              }}
              aria-label="Dismiss banner"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="sidebar-search">
          <div className="sidebar-search-inner">
            <span className="sidebar-search-icon">
              {search ? (
                <BackIcon size={18} />
              ) : (
                <SearchIcon size={20} />
              )}
            </span>
            <input
              id="sidebar-search-input"
              ref={searchInputRef}
              type="text"
              placeholder={
                showArchived
                  ? "Search archived chats"
                  : "Search or start a new chat (% for messages)"
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
                <CloseIcon size={16} />
              </button>
            )}
          </div>

          {/* Filter chips (WhatsApp Desktop style) */}
          {!isMessageSearch && !showArchived && activeTab !== "status" && (
            <div className="filter-chips">
              {(["all", "unread", "groups"] as ChatFilter[]).map((f) => (
                <button
                  key={f}
                  id={`filter-${f}`}
                  type="button"
                  className={`filter-chip ${chatFilter === f ? "active" : ""}`}
                  onClick={() => setChatFilter(f)}
                >
                  {f === "all" ? "All" : f === "unread" ? "Unread" : "Groups"}
                </button>
              ))}
            </div>
          )}

          {/* Message search mode banner & scope toggle */}
          {isMessageSearch && (
            <div className="search-mode-banner">
              <div className="search-mode-indicator">
                <span className="search-mode-badge">Pesan</span>
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
            <SearchIcon size={20} />
            <div className="search-switch-prompt-text">
              <span>Cari di dalam pesan: <strong>&quot;{search.trim()}&quot;</strong></span>
              <span className="search-switch-prompt-sub">Ketik <code>%{search.trim()}</code></span>
            </div>
            <span style={{ marginLeft: "auto", opacity: 0.7 }}>›</span>
          </div>
        )}

        {/* Chat List */}
        <div className="chat-list" style={{ position: "relative" }}>
          {/* Archive Toggle */}
          {activeTab === "chats" && !showArchived && archivedChats.length > 0 && !search.trim() && (
            <div
              className="archive-toggle"
              onClick={() => setShowArchived(true)}
              role="button"
              tabIndex={0}
            >
              <span className="archive-toggle-icon"><ArchiveIcon size={20} /></span>
              <span className="archive-toggle-label">Archived</span>
              {archivedChats.filter(c => c.unreadCount > 0).length > 0 && (
                <span className="archive-toggle-count">
                  {archivedChats.filter(c => c.unreadCount > 0).length}
                </span>
              )}
            </div>
          )}

          {isMessageSearch ? (
            /* ─── Message Search Mode Rendering ─── */
            !messageSearchQuery ? (
              <div className="search-guide-box">
                <div className="search-guide-icon"><SearchIcon size={40} /></div>
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
                <p style={{ fontWeight: 500 }}>Tidak ada pesan ditemukan</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                  Tidak ada percakapan yang cocok dengan &quot;%{messageSearchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="message-search-results">
                <div className="search-results-header">
                  <span>Messages · {messageResults.length}</span>
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
                      {renderAvatar(chatDisplayName, chatObj?.isGroup ?? false, chatObj?.profilePicUrl)}
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
            <div className="chat-list-empty">
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
                      Chat with +{search.trim().replace(/\D/g, "")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSearch("%" + search.trim())}
                    style={{ fontSize: "0.85rem", width: "100%" }}
                  >
                    Cari &quot;{search.trim()}&quot; di dalam pesan (%{search.trim()})
                  </button>
                </div>
              ) : chatFilter !== "all" ? (
                chatFilter === "unread" ? "No unread chats" : "No group chats"
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
                } ${contextMenuChatId === chat.id ? "menu-open" : ""}`}
                onClick={() => onSelectChat(chat.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuAnchor(null);
                  setContextMenuChatId(chat.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectChat(chat.id);
                }}
              >
                {renderAvatar(chat.name, chat.isGroup, chat.profilePicUrl)}
                <div className="chat-info">
                  <div className="chat-info-top">
                    <span className="chat-name">{chat.name}</span>
                    <span
                      className={`chat-timestamp ${
                        chat.unreadCount > 0 && !chat.isMuted ? "unread" : ""
                      }`}
                    >
                      {formatTimestamp(chat.lastMessageTimestamp)}
                    </span>
                  </div>
                  <div className="chat-info-bottom">
                    <span className="chat-last-message">
                      {formatLastMessage(chat.lastMessage)}
                    </span>
                    <span className="chat-meta-icons">
                      {chat.isMuted && (
                        <span className="chat-muted-icon" title="Muted">
                          <MutedIcon size={18} />
                        </span>
                      )}
                      {chat.unreadCount > 0 && (
                        <span className={`chat-unread-badge ${chat.isMuted ? "muted" : ""}`}>
                          {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                        </span>
                      )}
                      {(onToggleArchive || onToggleMute) && (
                        <button
                          className="chat-item-menu-btn"
                          aria-label="Chat options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuAnchor(null);
                            setContextMenuChatId(contextMenuChatId === chat.id ? null : chat.id);
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                {/* Context Menu Dropdown */}
                {contextMenuChatId === chat.id && (
                  <div
                    className="dropdown-menu dropdown-menu-chat"
                    onClick={(e) => e.stopPropagation()}
                    role="menu"
                  >
                    {onToggleArchive && (
                      <button
                        className="dropdown-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleArchive(chat.id);
                          setContextMenuChatId(null);
                          // If we unarchived it, maybe we want to keep them in view or not. It'll just disappear.
                          if (chat.isArchived && filteredChats.length === 1) {
                             setShowArchived(false); // return to main if it was the last archived chat
                          }
                        }}
                      >
                        {chat.isArchived ? "Unarchive chat" : "Archive chat"}
                      </button>
                    )}
                    {onToggleMute && (
                      <button
                        className="dropdown-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMute(chat.id);
                          setContextMenuChatId(null);
                        }}
                      >
                        {chat.isMuted ? "Unmute notifications" : "Mute notifications"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
