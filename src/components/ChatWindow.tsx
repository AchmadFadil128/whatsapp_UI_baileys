"use client";

import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from "react";
import type { Message, Chat } from "@/types";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";
import {
  BackIcon,
  PencilIcon,
  LockIcon,
  UserIcon,
  GroupIcon,
  ChatsIcon,
  ChevronDownIcon,
} from "@/components/Icons";
import { getContactStatus } from "@/lib/api";

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  aliases?: Record<string, string>;
  contactsMap?: Record<string, string>;
  isLoading: boolean;
  hasMore: boolean;
  highlightedMessageId?: string | null;
  focusTrigger?: number;
  onSendMessage: (text: string, file?: File, replyToMessageId?: string) => void;
  onLoadMore: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onBack?: () => void;
  onRename?: (newName: string) => void;
  onToggleStar?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

/**
 * Right panel: message area with header, scrollable message list,
 * date separators, and message input bar.
 */
export default function ChatWindow({
  chat,
  messages,
  aliases,
  contactsMap,
  isLoading,
  hasMore,
  highlightedMessageId,
  focusTrigger,
  onSendMessage,
  onLoadMore,
  onJumpToMessage,
  onBack,
  onRename,
  onToggleStar,
  onDeleteMessage,
}: ChatWindowProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [localHighlightedId, setLocalHighlightedId] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [contactStatus, setContactStatus] = useState<string | null>(null);

  // Resolve human-readable participant/contact name
  const resolveSenderName = useCallback(
    (senderJid: string): string | undefined => {
      if (!senderJid) return undefined;
      if (senderJid === "me") return "You";

      // 1. In a 1-on-1 chat, the other participant is the chat contact
      if (!chat?.isGroup && chat?.name) {
        return chat.name;
      }

      const cleanJid = senderJid.replace(/:(\d+)/, "");
      const phoneDigits = senderJid.split("@")[0].split(":")[0];

      // 2. Custom alias if set
      if (aliases) {
        if (aliases[senderJid]) return aliases[senderJid];
        if (aliases[cleanJid]) return aliases[cleanJid];
        if (aliases[phoneDigits]) return aliases[phoneDigits];
      }

      // 3. Saved contact name from contacts map (address book)
      if (contactsMap) {
        if (contactsMap[senderJid]) return contactsMap[senderJid];
        if (contactsMap[cleanJid]) return contactsMap[cleanJid];
        if (contactsMap[phoneDigits]) return contactsMap[phoneDigits];
        if (contactsMap[`${phoneDigits}@s.whatsapp.net`]) return contactsMap[`${phoneDigits}@s.whatsapp.net`];
      }

      // 4. Search loaded messages for a resolved senderName from this participant
      const found = messages.find(
        (m) =>
          (m.senderId === senderJid || m.senderId === cleanJid) &&
          m.senderName &&
          m.senderName !== senderJid &&
          m.senderName !== cleanJid &&
          m.senderName !== phoneDigits
      );
      if (found?.senderName) {
        return found.senderName.trim();
      }

      // 5. Search loaded messages for a pushName
      const pushFound = messages.find(
        (m) =>
          (m.senderId === senderJid || m.senderId === cleanJid) &&
          m.pushName &&
          m.pushName.trim().length > 0
      );
      if (pushFound?.pushName) {
        return pushFound.pushName.trim();
      }

      return undefined;
    },
    [chat?.isGroup, chat?.name, aliases, contactsMap, messages]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoadRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const prevMessagesRef = useRef<Message[]>([]);
  const prependScrollInfoRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);

  // Fetch WhatsApp user bio / status text
  useEffect(() => {
    if (!chat || chat.isGroup) {
      setContactStatus(null);
      return;
    }
    getContactStatus(chat.id)
      .then((res) => {
        if (res.success && res.data?.status) {
          const val: any = res.data.status;
          const statusText =
            typeof val === "string"
              ? val
              : typeof val?.status === "string"
              ? val.status
              : null;
          setContactStatus(statusText);
        }
      })
      .catch(() => {});
  }, [chat?.id, chat?.isGroup]);

  // Reset scroll and state when chat changes
  useEffect(() => {
    isFirstLoadRef.current = true;
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    prevMessagesRef.current = [];
    setReplyingTo(null);
    prependScrollInfoRef.current = null;
    setLocalHighlightedId(null);
  }, [chat?.id]);

  // Handle messages scroll position adjustments
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    const prev = prevMessagesRef.current;
    const currentFirstId = messages[0]?.id;
    const currentLastId = messages[messages.length - 1]?.id;

    // Case 1: First load of a chat
    if (isFirstLoadRef.current) {
      if (highlightedMessageId) {
        const el = document.getElementById(`msg-${highlightedMessageId}`);
        if (el) {
          el.scrollIntoView({ block: "center" });
        }
      } else {
        container.scrollTop = container.scrollHeight;
      }
      isFirstLoadRef.current = false;
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
      prevMessagesRef.current = messages;
      return;
    }

    // Case 2: Older messages prepended (infinite scroll / load more)
    const isPrepend =
      prev.length > 0 &&
      messages.length > prev.length &&
      currentFirstId !== prev[0]?.id;

    if (isPrepend) {
      if (prependScrollInfoRef.current) {
        const { prevScrollHeight, prevScrollTop } = prependScrollInfoRef.current;
        const heightDiff = container.scrollHeight - prevScrollHeight;
        container.scrollTop = prevScrollTop + heightDiff;
        prependScrollInfoRef.current = null;
      } else {
        const oldFirstEl = document.getElementById(`msg-${prev[0]?.id}`);
        if (oldFirstEl) {
          oldFirstEl.scrollIntoView({ block: "start" });
        }
      }
      prevMessagesRef.current = messages;
      return;
    }

    // Case 3: Message appended (new message received or sent)
    const isAppend =
      prev.length > 0 &&
      messages.length > prev.length &&
      currentLastId !== prev[prev.length - 1]?.id;

    if (isAppend) {
      const lastMsg = messages[messages.length - 1];
      const isSentByMe = lastMsg?.fromMe;

      // If sent by me, or if user was already at the bottom: scroll to bottom
      // If user is scrolled up: DO NOT scroll down automatically!
      if (isSentByMe || isAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        isAtBottomRef.current = true;
        setShowScrollBottomBtn(false);
      } else {
        setShowScrollBottomBtn(true);
      }
      prevMessagesRef.current = messages;
      return;
    }

    // Case 4: Other message updates (status change, etc.)
    prevMessagesRef.current = messages;
  }, [messages, highlightedMessageId]);

  // Scroll to highlighted message when jumping from search or reply
  useEffect(() => {
    if (highlightedMessageId && messages.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`msg-${highlightedMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [highlightedMessageId, messages]);

  // Listen to scroll events on messages container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    function handleScroll() {
      if (!container) return;
      const threshold = 120;
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
      isAtBottomRef.current = atBottom;
      setShowScrollBottomBtn(!atBottom);

      // Check if user scrolled near the top (< 100px) and more messages can be loaded
      if (container.scrollTop < 100 && hasMore && !isLoading) {
        prependScrollInfoRef.current = {
          prevScrollHeight: container.scrollHeight,
          prevScrollTop: container.scrollTop,
        };
        onLoadMore();
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, onLoadMore]);

  // Jump to quoted message handler
  const handleQuotedClick = useCallback(
    (targetId: string) => {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setLocalHighlightedId(targetId);
        setTimeout(() => {
          setLocalHighlightedId((curr) => (curr === targetId ? null : curr));
        }, 2200);
        return;
      }

      // Not loaded in view: delegate to parent to load and center
      if (onJumpToMessage) {
        onJumpToMessage(targetId);
      }
    },
    [onJumpToMessage]
  );

  // Group messages by date for date separators
  const messagesWithDates = useMemo(() => {
    const result: Array<{ type: "date"; label: string } | { type: "message"; message: Message }> = [];
    let lastDate = "";

    const validMessages = messages.filter(
      (msg) =>
        msg &&
        msg.type !== "unknown" &&
        msg.type !== "reaction" &&
        Boolean(msg.type) &&
        msg.text !== "Unsupported message" &&
        !msg.text?.startsWith("[Event:")
    );

    for (const msg of validMessages) {
      const date = new Date(msg.timestamp * 1000);
      const dateStr = date.toLocaleDateString([], {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (dateStr !== lastDate) {
        result.push({ type: "date", label: dateStr });
        lastDate = dateStr;
      }

      result.push({ type: "message", message: msg });
    }

    return result;
  }, [messages]);

  // Empty state when no chat is selected
  if (!chat) {
    return (
      <div className="chat-window chat-window-empty">
        <div className="empty-state">
          <div className="empty-state-icon">
            <ChatsIcon size={56} />
          </div>
          <h3>WhatsApp for Desktop</h3>
          <p>
            Send and receive messages without keeping your phone online.
            <br />
            Select a chat from the list to start messaging.
          </p>
        </div>
        <div className="empty-state-footer">
          <LockIcon size={14} />
          Your personal messages are end-to-end encrypted
        </div>
      </div>
    );
  }

  const isGroup = chat.id.endsWith("@g.us");
  const activeHighlightId = localHighlightedId || highlightedMessageId;

  return (
    <div className="chat-window">
      {/* Chat Header */}
      <div className="chat-header">
        {onBack && (
          <button
            className="icon-btn chat-header-back"
            onClick={onBack}
            aria-label="Back to chats"
          >
            <BackIcon size={22} />
          </button>
        )}
        <div className="chat-header-avatar">
          {chat.profilePicUrl || `/api/chats/${encodeURIComponent(chat.id)}/avatar?redirect=true` ? (
            <img
              src={chat.profilePicUrl || `/api/chats/${encodeURIComponent(chat.id)}/avatar?redirect=true`}
              alt={chat.name}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : isGroup ? (
            <GroupIcon size={24} />
          ) : (
            <UserIcon size={26} />
          )}
        </div>
        <div className="chat-header-info" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          {isEditingName ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename?.(editNameValue);
                    setIsEditingName(false);
                  } else if (e.key === "Escape") {
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="chat-header-rename-input"
              />
              <button
                className="btn btn-primary"
                style={{ padding: "4px 8px", fontSize: "0.9rem" }}
                onClick={() => {
                  onRename?.(editNameValue);
                  setIsEditingName(false);
                }}
              >
                Save
              </button>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 8px", fontSize: "0.9rem" }}
                onClick={() => setIsEditingName(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="chat-header-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chat.name}
              </div>
              <button
                className="icon-btn chat-header-rename-btn"
                title="Rename chat (local only)"
                aria-label="Rename chat"
                onClick={() => {
                  setEditNameValue(chat.name || "");
                  setIsEditingName(true);
                }}
              >
                <PencilIcon size={16} />
              </button>
            </div>
          )}
          <div
            className="chat-header-status"
            title={typeof contactStatus === "string" ? contactStatus : undefined}
          >
            {isGroup
              ? "Group"
              : typeof contactStatus === "string" && contactStatus
              ? contactStatus
              : "Personal chat"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container" ref={messagesContainerRef}>
        {!hasMore && !isLoading && (
          <div className="encryption-notice">
            <LockIcon size={12} />
            <span>
              Messages are end-to-end encrypted. No one outside of this chat,
              not even WhatsApp, can read or listen to them.
            </span>
          </div>
        )}

        {isLoading && messages.length === 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div className="spinner spinner-sm" />
          </div>
        )}

        {hasMore && messages.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px",
            }}
          >
            {isLoading ? (
              <div className="spinner spinner-sm" />
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (messagesContainerRef.current) {
                    prependScrollInfoRef.current = {
                      prevScrollHeight: messagesContainerRef.current.scrollHeight,
                      prevScrollTop: messagesContainerRef.current.scrollTop,
                    };
                  }
                  onLoadMore();
                }}
                style={{ fontSize: "0.8rem" }}
              >
                Load older messages
              </button>
            )}
          </div>
        )}

        {messagesWithDates.map((item, i) => {
          if (item.type === "date") {
            return (
              <div key={`date-${i}`} className="date-separator">
                <span className="date-separator-label">{item.label}</span>
              </div>
            );
          }

          return (
            <MessageBubble
              key={item.message.id}
              message={item.message}
              showSender={isGroup}
              chatName={chat.name}
              resolveSenderName={resolveSenderName}
              onReply={() => setReplyingTo(item.message)}
              onQuotedClick={handleQuotedClick}
              onToggleStar={onToggleStar ? () => onToggleStar(item.message.id) : undefined}
              onDelete={onDeleteMessage ? () => onDeleteMessage(item.message.id) : undefined}
              isHighlighted={item.message.id === activeHighlightId}
            />
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom button */}
      {showScrollBottomBtn && (
        <button
          className="scroll-bottom-btn"
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            isAtBottomRef.current = true;
            setShowScrollBottomBtn(false);
          }}
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ChevronDownIcon size={20} />
        </button>
      )}

      {/* Message Input */}
      <MessageInput 
        chatId={chat.id}
        focusTrigger={focusTrigger}
        onSend={(text, file) => {
          onSendMessage(text, file, replyingTo?.id);
          setReplyingTo(null);
        }}
        replyingTo={replyingTo}
        replySenderName={
          replyingTo
            ? replyingTo.fromMe
              ? "You"
              : !chat.isGroup && chat.name
              ? chat.name
              : (replyingTo.senderName && !replyingTo.senderName.endsWith("@g.us")
                  ? replyingTo.senderName
                  : resolveSenderName(replyingTo.senderId) ||
                    replyingTo.pushName ||
                    (replyingTo.senderId.endsWith("@g.us") ? "Member" : replyingTo.senderId.split("@")[0]))
            : undefined
        }
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
