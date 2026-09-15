"use client";

import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
}

/**
 * Individual message bubble with sent/received styling,
 * timestamp, and delivery status indicators.
 */
export default function MessageBubble({
  message,
  showSender = false,
}: MessageBubbleProps) {
  const direction = message.fromMe ? "sent" : "received";

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function renderStatusIcon() {
    if (!message.fromMe) return null;

    switch (message.status) {
      case "pending":
        return <span className="check">🕐</span>;
      case "sent":
        return <span className="check">✓</span>;
      case "delivered":
        return <span className="check">✓✓</span>;
      case "read":
        return <span className="check read">✓✓</span>;
      default:
        return <span className="check">✓</span>;
    }
  }

  function renderContent() {
    switch (message.type) {
      case "text":
        return <div className="message-text">{message.text}</div>;
      case "image":
        return (
          <div className="message-text">
            📷 {message.media?.caption || message.text || "Photo"}
          </div>
        );
      case "video":
        return (
          <div className="message-text">
            🎥 {message.media?.caption || message.text || "Video"}
          </div>
        );
      case "audio":
        return <div className="message-text">🎵 Audio message</div>;
      case "document":
        return (
          <div className="message-text">
            📄 {message.media?.fileName || "Document"}
          </div>
        );
      case "sticker":
        return <div className="message-text">🏷️ Sticker</div>;
      case "location":
        return <div className="message-text">📍 Location</div>;
      case "contact":
        return <div className="message-text">👤 Contact card</div>;
      default:
        return (
          <div className="message-text">
            {message.text || "[Unsupported message]"}
          </div>
        );
    }
  }

  return (
    <div className={`message-row ${direction}`}>
      <div className="message-bubble">
        {showSender && !message.fromMe && message.pushName && (
          <div className="message-sender">{message.pushName}</div>
        )}
        {renderContent()}
        <div className="message-footer">
          <span className="message-time">{formatTime(message.timestamp)}</span>
          <span className="message-status">{renderStatusIcon()}</span>
        </div>
      </div>
    </div>
  );
}
