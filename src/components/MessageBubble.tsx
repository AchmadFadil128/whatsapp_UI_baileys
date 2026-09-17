"use client";

import { useState } from "react";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
}

/**
 * Individual message bubble with sent/received styling,
 * timestamp, and delivery status indicators.
 * Supports inline image rendering with click-to-enlarge.
 */
export default function MessageBubble({
  message,
  showSender = false,
}: MessageBubbleProps) {
  const direction = message.fromMe ? "sent" : "received";
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

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
        return renderImage();
      case "video":
        return renderVideo();
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
        return <div className="message-text">📍 {message.text || "Location"}</div>;
      case "contact":
        return <div className="message-text">👤 {message.text || "Contact card"}</div>;
      case "reaction":
        return <div className="message-text">{message.text}</div>;
      case "poll":
        return <div className="message-text">{message.text || "📊 Poll"}</div>;
      default:
        return (
          <div className="message-text">
            {message.text || "Unsupported message"}
          </div>
        );
    }
  }

  function renderImage() {
    const mediaUrl = `/api/media/${message.id}`;
    const caption = message.media?.caption || message.text;

    return (
      <div className="message-media">
        {!imageLoaded && !imageError && (
          <div className="media-placeholder">
            <div className="spinner spinner-sm" />
          </div>
        )}
        {imageError ? (
          <div className="media-placeholder media-error">
            <span>📷</span>
            <span>Could not load image</span>
          </div>
        ) : (
          <img
            src={mediaUrl}
            alt={caption || "Photo"}
            className={`message-image ${imageLoaded ? "loaded" : "loading"}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            onClick={() => setShowLightbox(true)}
            loading="lazy"
          />
        )}
        {caption && <div className="message-text media-caption">{caption}</div>}
      </div>
    );
  }

  function renderVideo() {
    const mediaUrl = `/api/media/${message.id}`;
    const caption = message.media?.caption || message.text;

    return (
      <div className="message-media">
        <video
          src={mediaUrl}
          controls
          className="message-image loaded"
          style={{ maxWidth: "100%", borderRadius: "8px", background: "#000" }}
          preload="metadata"
        />
        {caption && <div className="message-text media-caption">{caption}</div>}
      </div>
    );
  }

  return (
    <>
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

      {/* Lightbox overlay for full-size image viewing */}
      {showLightbox && message.type === "image" && (
        <div
          className="lightbox-overlay"
          onClick={() => setShowLightbox(false)}
        >
          <button
            className="lightbox-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowLightbox(false);
            }}
            aria-label="Close"
          >
            ✕
          </button>
          <img
            src={`/api/media/${message.id}`}
            alt={message.media?.caption || "Full size photo"}
            className="lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

