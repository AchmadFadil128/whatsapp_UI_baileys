"use client";

import { useEffect, useRef, useMemo } from "react";
import type { Message, Chat } from "@/types";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";

interface ChatWindowProps {
  chat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  onSendMessage: (text: string) => void;
  onLoadMore: () => void;
  onBack?: () => void;
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
  onSendMessage,
  onLoadMore,
  onBack,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      // On first load or when a new message arrives, scroll to bottom
      if (isFirstLoad.current) {
        messagesEndRef.current?.scrollIntoView();
        isFirstLoad.current = false;
      } else {
        // Smooth scroll for new messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages.length]);

  // Reset first load flag when chat changes
  useEffect(() => {
    isFirstLoad.current = true;
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

    for (const msg of messages) {
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

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  // Empty state when no chat is selected
  if (!chat) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <h3>WhatsApp Client</h3>
          <p>
            Send and receive messages from your browser. Select a chat from the
            sidebar to get started.
          </p>
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
            className="btn btn-ghost"
            onClick={onBack}
            style={{ padding: "6px 8px", fontSize: "1.1rem", marginRight: "4px" }}
            aria-label="Back to chats"
          >
            ←
          </button>
        )}
        <div className="chat-header-avatar">
          {getInitials(chat.name || "?")}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{chat.name}</div>
          <div className="chat-header-status">
            {isGroup ? "Group" : "Chat"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container" ref={messagesContainerRef}>
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
            />
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <MessageInput onSend={onSendMessage} />
    </div>
  );
}
