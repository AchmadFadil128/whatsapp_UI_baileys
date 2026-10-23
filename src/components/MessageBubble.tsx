"use client";

import { useState } from "react";
import type { Message } from "@/types";
import Lightbox from "@/components/Lightbox";
import {
  CheckIcon,
  DoubleCheckIcon,
  ClockIcon,
  ReplyIcon,
  DocumentIcon,
  DownloadIcon,
  MicIcon,
  StarIcon,
  TrashIcon,
} from "@/components/Icons";

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
  chatName?: string;
  resolveSenderName?: (senderJid: string) => string | undefined;
  onReply?: () => void;
  onQuotedClick?: (quotedMessageId: string) => void;
  onToggleStar?: () => void;
  onDelete?: () => void;
  isHighlighted?: boolean;
}

/**
 * Individual message bubble with sent/received styling,
 * timestamp, and delivery status indicators.
 * Supports inline image rendering with click-to-enlarge.
 */
export default function MessageBubble({
  message,
  showSender = false,
  chatName,
  resolveSenderName,
  onReply,
  onQuotedClick,
  onToggleStar,
  onDelete,
  isHighlighted = false,
}: MessageBubbleProps) {
  // Do not display unsupported messages or unsupported events
  if (
    message.type === "unknown" ||
    message.type === "reaction" ||
    !message.type ||
    message.text === "Unsupported message" ||
    message.text?.startsWith("[Event:")
  ) {
    return null;
  }

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

  function getQuotedSenderDisplay(): string {
    if (!message.quotedMessage) return "";
    const { sender, senderName } = message.quotedMessage;

    // 1. If self
    if (sender === "me" || senderName === "You") {
      return "You";
    }

    // 2. If backend provided a resolved contact name or display name (that is not a raw JID)
    if (
      senderName &&
      senderName.trim().length > 0 &&
      senderName !== sender &&
      senderName !== sender.split("@")[0] &&
      !senderName.endsWith("@g.us")
    ) {
      return senderName.trim();
    }

    // 3. If parent provided a resolveSenderName function
    if (resolveSenderName) {
      const resolved = resolveSenderName(sender);
      if (resolved && resolved !== sender && resolved !== sender.split("@")[0] && !resolved.endsWith("@g.us")) {
        return resolved;
      }
    }

    // 4. In a 1-on-1 chat, the other person is the chat contact (chatName)
    if (!showSender && chatName && chatName.trim().length > 0) {
      return chatName.trim();
    }

    // 5. Use senderName fallback if present
    if (senderName && senderName.trim().length > 0 && !senderName.endsWith("@g.us")) {
      return senderName.trim();
    }

    // 6. Fallback: user part of JID (guard against group JID)
    if (!sender || sender.endsWith("@g.us") || sender === "unknown") {
      return "Member";
    }
    const digits = sender.split("@")[0].split(":")[0];
    if (/^\d{7,15}$/.test(digits)) {
      return `+${digits}`;
    }
    return digits;
  }

  function getMessageSenderDisplay(): string {
    // 1. If backend resolved a human-readable senderName
    if (
      message.senderName &&
      message.senderName !== message.senderId &&
      message.senderName !== message.senderId.split("@")[0] &&
      !message.senderName.endsWith("@g.us")
    ) {
      return message.senderName;
    }

    // 2. If client-side resolver has a contact name
    if (resolveSenderName && message.senderId && !message.senderId.endsWith("@g.us")) {
      const resolved = resolveSenderName(message.senderId);
      if (resolved && resolved !== message.senderId && !resolved.endsWith("@g.us")) {
        return resolved;
      }
    }

    // 3. Push name
    if (message.pushName && message.pushName.trim().length > 0) {
      return message.pushName.trim();
    }

    // 4. If sender is not a group JID, format or display sender digits
    if (message.senderId && !message.senderId.endsWith("@g.us") && message.senderId !== "unknown") {
      const digits = message.senderId.split("@")[0].split(":")[0];
      if (/^\d{7,15}$/.test(digits)) {
        return `+${digits}`;
      }
      return digits;
    }

    // 5. Safe fallback for group messages
    return "Member";
  }

  function renderStatusIcon() {
    if (!message.fromMe) return null;

    switch (message.status) {
      case "pending":
        return <span className="check"><ClockIcon size={15} /></span>;
      case "sent":
        return <span className="check"><CheckIcon width={16} height={11} /></span>;
      case "delivered":
        return <span className="check"><DoubleCheckIcon width={16} height={11} /></span>;
      case "read":
        return <span className="check read"><DoubleCheckIcon width={16} height={11} /></span>;
      default:
        return <span className="check"><CheckIcon width={16} height={11} /></span>;
    }
  }

  function renderContent() {
    switch (message.type) {
      case "text":
        return (
          <div className="message-text">
            {message.text}
            <span className="message-spacer" aria-hidden="true" />
          </div>
        );
      case "image":
        return renderImage();
      case "video":
        return renderVideo();
      case "ptv":
        return renderPtv();
      case "audio":
        return renderAudio();
      case "document":
        return renderDocument();
      case "sticker":
        return renderSticker();
      case "location":
        return <div className="message-text">📍 {message.text || "Location"}</div>;
      case "contact":
        return <div className="message-text">👤 {message.text || "Contact card"}</div>;
      case "reaction":
        return null;
      case "poll":
        return <div className="message-text">{message.text || "📊 Poll"}</div>;
      default:
        return null;
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

  function renderPtv() {
    const mediaUrl = `/api/media/${message.id}`;
    return (
      <div className="message-media ptv-message" style={{ display: 'flex', justifyContent: 'center' }}>
        <video
          src={mediaUrl}
          controls
          autoPlay
          loop
          muted
          className="message-image loaded"
          style={{ width: "240px", height: "240px", borderRadius: "50%", objectFit: "cover", background: "#000" }}
          preload="metadata"
        />
      </div>
    );
  }

  function renderAudio() {
    const mediaUrl = `/api/media/${message.id}`;
    return (
      <div className="message-media audio-message">
        <div className="audio-message-icon">
          <MicIcon size={22} />
        </div>
        <audio
          src={mediaUrl}
          controls
          controlsList="nodownload"
          preload="metadata"
          style={{ height: "36px", minWidth: "220px", borderRadius: "18px", outline: "none" }}
        />
      </div>
    );
  }

  function renderSticker() {
    const mediaUrl = `/api/media/${message.id}`;
    const isAnimated = message.media?.mimetype === "image/webp";

    return (
      <div className="message-sticker">
        {!imageLoaded && !imageError && (
          <div className="sticker-placeholder">
            <div className="spinner spinner-sm" />
          </div>
        )}
        {imageError ? (
          <div className="sticker-placeholder sticker-error">
            <span>🏷️</span>
            <span style={{ fontSize: "0.75rem" }}>Sticker</span>
          </div>
        ) : (
          <img
            src={mediaUrl}
            alt={isAnimated ? "Animated sticker" : "Sticker"}
            className={`sticker-image ${imageLoaded ? "loaded" : "loading"}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        )}
      </div>
    );
  }

  function renderDocument() {
    const mediaUrl = `/api/media/${message.id}`;
    const fileName = message.media?.fileName || "Document";
    const caption = message.media?.caption || message.text;

    return (
      <div className="message-media document-message">
        <a
          href={mediaUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className="document-card"
        >
          <span className="document-card-icon"><DocumentIcon size={28} /></span>
          <span className="document-card-name">
            {fileName}
          </span>
          <span className="document-card-download" title="Download"><DownloadIcon size={20} /></span>
        </a>
        {caption && <div className="message-text media-caption">{caption}</div>}
      </div>
    );
  }

  return (
    <>
      <div id={`msg-${message.id}`} className={`message-row ${direction} ${isHighlighted ? "highlighted" : ""}`}>
        {(onReply || onToggleStar || onDelete) && (
          <div className="message-action-menu">
            {onReply && (
              <button className="reply-action-btn" onClick={onReply} title="Reply" aria-label="Reply">
                <ReplyIcon size={18} />
              </button>
            )}
            {onToggleStar && (
              <button
                className="reply-action-btn"
                onClick={onToggleStar}
                title={message.isStarred ? "Unstar message" : "Star message"}
                aria-label="Star"
                style={{ color: message.isStarred ? "var(--accent-primary, #eab308)" : undefined }}
              >
                <StarIcon size={16} filled={message.isStarred} />
              </button>
            )}
            {onDelete && (
              <button
                className="reply-action-btn"
                onClick={onDelete}
                title="Delete for me"
                aria-label="Delete message"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        )}
        <div className={`message-bubble ${message.type === "text" ? "inline-footer" : ""} ${message.type === "sticker" ? "sticker-bubble" : ""}`}>
          {showSender && !message.fromMe && (
            <div className="message-sender">
              {getMessageSenderDisplay()}
            </div>
          )}
          {message.quotedMessage && (
            <div
              className="message-quoted"
              onClick={(e) => {
                e.stopPropagation();
                const targetId = message.quotedMessage?.id || message.quotedMessageId;
                if (targetId && onQuotedClick) {
                  onQuotedClick(targetId);
                }
              }}
              title="Jump to quoted message"
            >
              <div className="message-quoted-sender">{getQuotedSenderDisplay()}</div>
              <div className="message-quoted-text">{message.quotedMessage.text || "Message"}</div>
            </div>
          )}
          {renderContent()}
          <div className="message-footer">
            {message.isStarred && (
              <span className="message-star" title="Starred" style={{ display: "inline-flex", color: "#eab308", marginRight: "3px" }}>
                <StarIcon size={12} filled />
              </span>
            )}
            <span className="message-time">{formatTime(message.timestamp)}</span>
            <span className="message-status">{renderStatusIcon()}</span>
          </div>
        </div>
      </div>

      {/* Lightbox overlay for full-size image viewing */}
      {showLightbox && message.type === "image" && (
        <Lightbox
          src={`/api/media/${message.id}`}
          alt={message.media?.caption || "Full size photo"}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  );
}

