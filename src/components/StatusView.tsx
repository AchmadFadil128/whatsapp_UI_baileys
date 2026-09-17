"use client";

import { useState } from "react";
import type { Message } from "@/types";

interface StatusViewProps {
  statuses: Message[];
  isLoading: boolean;
}

/**
 * Status/Story view — shows status updates in a feed layout.
 * Each status clearly shows who posted it, the timestamp, and the content.
 */
export default function StatusView({ statuses, isLoading }: StatusViewProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  function formatTimestamp(ts: number): string {
    const date = new Date(ts * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    return `${date.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${time}`;
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (isLoading && statuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="spinner spinner-sm" />
          <p>Loading statuses...</p>
        </div>
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <h3>No Status Updates</h3>
          <p>
            Status updates from your contacts will appear here. They are only visible while the app is running.
          </p>
        </div>
      </div>
    );
  }

  // Sort newest first
  const sorted = [...statuses].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-avatar" style={{ background: "var(--accent-teal)" }}>
          📡
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">Status Updates</div>
          <div className="chat-header-status">
            {statuses.length} update{statuses.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Status Feed */}
      <div className="messages-container" style={{ padding: "16px" }}>
        {sorted.map((status) => (
          <div key={status.id} className="status-card">
            {/* Sender Info */}
            <div className="status-card-header">
              <div className="status-card-avatar">
                {getInitials(status.pushName || status.senderId || "?")}
              </div>
              <div className="status-card-sender-info">
                <div className="status-card-name">
                  {status.pushName || status.senderId}
                </div>
                <div className="status-card-time">
                  {formatTimestamp(status.timestamp)}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="status-card-content">
              {status.type === "image" && (
                <div className="status-card-image-container">
                  <img
                    src={`/api/media/${status.id}`}
                    alt={status.media?.caption || "Status photo"}
                    className="status-card-image"
                    loading="lazy"
                    onClick={() => setLightboxUrl(`/api/media/${status.id}`)}
                  />
                </div>
              )}
              {status.type === "video" && (
                <div className="status-card-text">
                  🎥 {status.media?.caption || status.text || "Video status"}
                </div>
              )}
              {(status.type === "text" || (!["image", "video"].includes(status.type))) && status.text && (
                <div className="status-card-text">{status.text}</div>
              )}
              {status.media?.caption && status.type === "image" && (
                <div className="status-card-caption">{status.media.caption}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button
            className="lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            aria-label="Close"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Full size status"
            className="lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
