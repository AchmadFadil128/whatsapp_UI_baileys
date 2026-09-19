"use client";

import { useState, useMemo } from "react";
import type { Message } from "@/types";

interface StatusViewProps {
  statuses: Message[];
  isLoading: boolean;
  onDeleteStatus: (id: string) => void;
  onClearAll: () => void;
}

interface StatusGroup {
  senderName: string;
  senderId: string;
  statuses: Message[];
  latestTimestamp: number;
}

/**
 * Status view — WhatsApp Stories-like grid layout.
 * Groups statuses by sender, shows thumbnails per contact.
 * Click a contact to see all their statuses.
 */
export default function StatusView({
  statuses,
  isLoading,
  onDeleteStatus,
  onClearAll,
}: StatusViewProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSender, setSelectedSender] = useState<string | null>(null);

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

  // Filter out deleted messages
  const validStatuses = useMemo(() => {
    return statuses.filter((s) => !s.text?.includes("This message was deleted"));
  }, [statuses]);

  // Group by sender
  const groups = useMemo(() => {
    const map = new Map<string, StatusGroup>();
    for (const status of validStatuses) {
      const key = status.senderId || "unknown";
      const existing = map.get(key);
      if (existing) {
        existing.statuses.push(status);
        if (status.timestamp > existing.latestTimestamp) {
          existing.latestTimestamp = status.timestamp;
          // Update name if pushName available
          if (status.pushName) existing.senderName = status.pushName;
        }
      } else {
        map.set(key, {
          senderName: status.pushName || status.senderId || "Unknown",
          senderId: key,
          statuses: [status],
          latestTimestamp: status.timestamp,
        });
      }
    }

    // Sort groups: newest contact first
    return Array.from(map.values()).sort(
      (a, b) => b.latestTimestamp - a.latestTimestamp
    );
  }, [validStatuses]);

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.senderName.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  // Detail view — selected sender's statuses
  const selectedGroup = useMemo(() => {
    if (!selectedSender) return null;
    return groups.find((g) => g.senderId === selectedSender) || null;
  }, [groups, selectedSender]);

  if (isLoading && validStatuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="spinner spinner-sm" />
          <p>Loading statuses...</p>
        </div>
      </div>
    );
  }

  if (validStatuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <h3>No Status Updates</h3>
          <p>
            Status updates from your contacts will appear here. They are
            persistently stored until you delete them.
          </p>
        </div>
      </div>
    );
  }

  // ─── Detail view for a specific sender ────────────────────
  if (selectedGroup) {
    const sorted = [...selectedGroup.statuses].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    return (
      <div className="chat-window">
        {/* Header */}
        <div className="chat-header">
          <button
            className="btn btn-ghost"
            onClick={() => setSelectedSender(null)}
            style={{ padding: "6px 8px", fontSize: "1.1rem", marginRight: "4px" }}
            aria-label="Back to status overview"
          >
            ←
          </button>
          <div className="chat-header-avatar" style={{ background: "linear-gradient(135deg, var(--accent-teal), var(--accent-primary))" }}>
            {getInitials(selectedGroup.senderName)}
          </div>
          <div className="chat-header-info">
            <div className="chat-header-name">{selectedGroup.senderName}</div>
            <div className="chat-header-status">
              {selectedGroup.statuses.length} status update{selectedGroup.statuses.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Status detail grid */}
        <div className="messages-container" style={{ padding: "16px" }}>
          <div className="status-detail-grid">
            {sorted.map((status) => (
              <div key={status.id} className="status-detail-card">
                {/* Delete button */}
                <button
                  className="status-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteStatus(status.id);
                  }}
                  title="Delete this status"
                  aria-label="Delete status"
                >
                  🗑️
                </button>

                {/* Content */}
                {status.type === "image" && (
                  <img
                    src={`/api/media/${status.id}`}
                    alt={status.media?.caption || "Status photo"}
                    className="status-detail-media"
                    loading="lazy"
                    onClick={() => setLightboxUrl(`/api/media/${status.id}`)}
                  />
                )}
                {status.type === "video" && (
                  <video
                    src={`/api/media/${status.id}`}
                    controls
                    className="status-detail-media"
                    preload="metadata"
                  />
                )}
                {status.type !== "image" && status.type !== "video" && (
                  <div className="status-detail-text-content">
                    {status.text || "[Status]"}
                  </div>
                )}

                {/* Caption & timestamp */}
                <div className="status-detail-footer">
                  {status.media?.caption && (
                    <div className="status-detail-caption">{status.media.caption}</div>
                  )}
                  <div className="status-detail-time">{formatTimestamp(status.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
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

  // ─── Grid overview of all contacts ────────────────────────
  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-avatar" style={{ background: "var(--accent-teal)" }}>
          📡
        </div>
        <div className="chat-header-info" style={{ flex: 1 }}>
          <div className="chat-header-name">Status Updates</div>
          <div className="chat-header-status">
            {validStatuses.length} update{validStatuses.length !== 1 ? "s" : ""} from {groups.length} contact{groups.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={onClearAll}
          title="Clear all statuses"
          style={{ padding: "6px 10px", fontSize: "0.85rem", color: "var(--accent-danger)" }}
        >
          🗑️ Clear All
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-app)" }}>
        <input
          type="text"
          placeholder="Search contacts..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "none", background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Contact Grid */}
      <div className="messages-container" style={{ padding: "16px" }}>
        <div className="status-grid">
          {filteredGroups.map((group) => {
            // Show thumbnail from latest status
            const latest = group.statuses.reduce((a, b) =>
              a.timestamp > b.timestamp ? a : b
            );

            return (
              <div
                key={group.senderId}
                className="status-grid-card"
                onClick={() => setSelectedSender(group.senderId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedSender(group.senderId);
                }}
              >
                {/* Thumbnail */}
                <div className="status-grid-thumb">
                  {latest.type === "image" ? (
                    <img
                      src={`/api/media/${latest.id}`}
                      alt={latest.media?.caption || "Status"}
                      loading="lazy"
                    />
                  ) : latest.type === "video" ? (
                    <div className="status-grid-video-thumb">
                      <video src={`/api/media/${latest.id}`} preload="metadata" />
                      <div className="status-grid-play-icon">▶</div>
                    </div>
                  ) : (
                    <div className="status-grid-text-thumb">
                      <span>{(latest.text || "[Status]").slice(0, 80)}</span>
                    </div>
                  )}

                  {/* Count badge */}
                  {group.statuses.length > 1 && (
                    <div className="status-grid-count">{group.statuses.length}</div>
                  )}
                </div>

                {/* Name */}
                <div className="status-grid-name">{group.senderName}</div>
                <div className="status-grid-time">{formatTimestamp(group.latestTimestamp)}</div>
              </div>
            );
          })}
        </div>
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
