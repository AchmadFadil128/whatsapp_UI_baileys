"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import type { Message, Chat } from "@/types";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";
import { BackIcon, PencilIcon, LockIcon, UserIcon, GroupIcon, ChatsIcon } from "@/components/Icons";

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  highlightedMessageId?: string | null;
  onSendMessage: (text: string, file?: File, replyToMessageId?: string) => void;
  onLoadMore: () => void;
  onBack?: () => void;
  onRename?: (newName: string) => void;
}

/**
 * Right panel: message area with header, scrollable message list,
 * date separators, and message input bar.
 */
export default function ChatWindow({
  chat,
  messages,
  isLoading,
  hasMore,
  highlightedMessageId,
  onSendMessage,
  onLoadMore,
  onBack,
  onRename,
}: ChatWindowProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  // Auto-scroll to bottom on new messages (unless jumping to a specific highlighted message)
  useEffect(() => {
    if (messages.length > 0) {
      if (highlightedMessageId) return;

      // On first load or when a new message arrives, scroll to bottom
      if (isFirstLoad.current) {
        messagesEndRef.current?.scrollIntoView();
        isFirstLoad.current = false;
      } else {
        // Smooth scroll for new messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages.length, highlightedMessageId]);

  // Scroll to highlighted message when loaded
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

  // Reset first load flag and reply state when chat changes
  useEffect(() => {
    isFirstLoad.current = true;
    setReplyingTo(null);
  }, [chat?.id]);

  // Handle scroll to top for infinite scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    function handleScroll() {
      if (container!.scrollTop < 100 && hasMore && !isLoading) {
        onLoadMore();
      }
    }

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, onLoadMore]);

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
          {chat.profilePicUrl ? (
            <img src={chat.profilePicUrl} alt={chat.name} />
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
          <div className="chat-header-status">
            {isGroup ? "Group" : "Personal chat"}
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
                onClick={onLoadMore}
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
              onReply={() => setReplyingTo(item.message)}
              isHighlighted={item.message.id === highlightedMessageId}
            />
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <MessageInput 
        onSend={(text, file) => {
          onSendMessage(text, file, replyingTo?.id);
          setReplyingTo(null);
        }}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
