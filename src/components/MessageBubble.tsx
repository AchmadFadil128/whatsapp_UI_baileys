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
} from "@/components/Icons";

interface MessageBubbleProps {
  message: Message;
  showSender?: boolean;
  onReply?: () => void;
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
  onReply,
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
        return <div className="message-text">🏷️ Sticker</div>;
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
        {onReply && (
          <div className="message-action-menu">
            <button className="reply-action-btn" onClick={onReply} title="Reply" aria-label="Reply">
              <ReplyIcon size={18} />
            </button>
          </div>
        )}
        <div className={`message-bubble ${message.type === "text" ? "inline-footer" : ""}`}>
          {showSender && !message.fromMe && message.pushName && (
            <div className="message-sender">{message.pushName}</div>
          )}
          {message.quotedMessage && (
            <div className="message-quoted">
              <div className="message-quoted-sender">{message.quotedMessage.sender.split("@")[0]}</div>
              <div className="message-quoted-text">{message.quotedMessage.text || "Message"}</div>
            </div>
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
        <Lightbox
          src={`/api/media/${message.id}`}
          alt={message.media?.caption || "Full size photo"}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </>
  );
}

