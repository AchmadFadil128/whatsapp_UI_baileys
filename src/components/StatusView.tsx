"use client";

import { useState } from "react";
import type { Message } from "@/types";
import Lightbox from "@/components/Lightbox";
import { BackIcon, TrashIcon, UserIcon, StatusIcon } from "@/components/Icons";

interface StatusViewProps {
  selectedSenderId: string | null;
  selectedSenderName?: string;
  statuses: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onDeleteStatus: (id: string) => void;
  onDeleteSenderStatuses: (senderId: string) => void;
  onClearSelection: () => void;
}

function StatusDetailImage({
  messageId,
  caption,
  text,
  onClick,
}: {
  messageId: string;
  caption?: string;
  text?: string;
  onClick: () => void;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="status-detail-text-content status-media-fallback">
        <div className="status-media-fallback-icon">📷</div>
        <div className="status-media-fallback-title">Media tidak tersedia</div>
        <div className="status-media-fallback-desc">
          {caption || text || "Media status telah kedaluwarsa atau belum tersimpan"}
        </div>
      </div>
    );
  }

  return (
    <img
      src={`/api/media/${messageId}`}
      alt={caption || text || "Status photo"}
      className="status-detail-media"
      loading="lazy"
      onError={() => setError(true)}
      onClick={onClick}
    />
  );
}

function StatusDetailVideo({
  messageId,
  caption,
  text,
}: {
  messageId: string;
  caption?: string;
  text?: string;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="status-detail-text-content status-media-fallback">
        <div className="status-media-fallback-icon">🎥</div>
        <div className="status-media-fallback-title">Video tidak tersedia</div>
        <div className="status-media-fallback-desc">
          {caption || text || "Media video telah kedaluwarsa atau belum tersimpan"}
        </div>
      </div>
    );
  }

  return (
    <video
      src={`/api/media/${messageId}`}
      controls
      className="status-detail-media"
      preload="metadata"
      onError={() => setError(true)}
    />
  );
}

/**
 * StatusView component.
 * Displays empty state by default until a contact is selected from the sidebar.
 * When selected, lazy-loads and renders all statuses for that contact.
 */
export default function StatusView({
  selectedSenderId,
  selectedSenderName,
  statuses,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onDeleteStatus,
  onDeleteSenderStatuses,
  onClearSelection,
}: StatusViewProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  function handleDeleteSender() {
    if (!selectedSenderId) return;
    const name = selectedSenderName || selectedSenderId;
    const ok = window.confirm(
      `Hapus semua status dari ${name}? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!ok) return;
    onDeleteSenderStatuses(selectedSenderId);
  }

  function formatTimestamp(ts: number): string {
    const date = new Date(ts * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    if (diffDays === 0) return `Hari ini, ${time}`;
    if (diffDays === 1) return `Kemarin, ${time}`;
    return `${date.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${time}`;
  }

  // 1. Default empty state: No contact selected
  if (!selectedSenderId) {
    return (
      <div className="chat-window">
        <div className="empty-state">
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "var(--bg-hover)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              color: "var(--text-secondary)",
            }}
          >
            <StatusIcon size={44} />
          </div>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: "8px" }}>
            Pembaruan Status
          </h3>
          <p style={{ maxWidth: "340px", color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Pilih salah satu kontak di bilah samping untuk melihat pembaruan status mereka secara lengkap.
          </p>
        </div>
      </div>
    );
  }

  // 2. Loading state for selected contact
  if (isLoading && statuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="chat-header">
          <button
            className="icon-btn"
            onClick={onClearSelection}
            aria-label="Kembali ke daftar status"
          >
            <BackIcon size={22} />
          </button>
          <div className="chat-header-avatar">
            <UserIcon size={24} />
          </div>
          <div className="chat-header-info" style={{ flex: 1 }}>
            <div className="chat-header-name">{selectedSenderName || selectedSenderId}</div>
            <div className="chat-header-status">Memuat status...</div>
          </div>
        </div>
        <div className="empty-state">
          <div className="spinner spinner-sm" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "var(--text-secondary)" }}>Mengambil semua status kontak...</p>
        </div>
      </div>
    );
  }

  // Filter out deleted messages and sort newest first
  const validStatuses = statuses
    .filter((s) => !s.text?.includes("This message was deleted"))
    .sort((a, b) => b.timestamp - a.timestamp);

  // 3. No statuses found for selected contact
  if (validStatuses.length === 0) {
    return (
      <div className="chat-window">
        <div className="chat-header">
          <button
            className="icon-btn"
            onClick={onClearSelection}
            aria-label="Kembali ke daftar status"
          >
            <BackIcon size={22} />
          </button>
          <div className="chat-header-avatar">
            <UserIcon size={24} />
          </div>
          <div className="chat-header-info" style={{ flex: 1 }}>
            <div className="chat-header-name">{selectedSenderName || selectedSenderId}</div>
            <div className="chat-header-status">0 status</div>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <h3>Tidak Ada Status</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            Belum ada status yang tersedia atau semua status telah dihapus.
          </p>
        </div>
      </div>
    );
  }

  const displayName = selectedSenderName || selectedSenderId;

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <button
          className="icon-btn"
          onClick={onClearSelection}
          aria-label="Kembali ke daftar status"
        >
          <BackIcon size={22} />
        </button>
        <div className="chat-header-avatar">
          <UserIcon size={24} />
        </div>
        <div className="chat-header-info" style={{ flex: 1 }}>
          <div className="chat-header-name">{displayName}</div>
          <div className="chat-header-status">
            {validStatuses.length} pembaruan status
          </div>
        </div>
        <button
          id="status-delete-sender-btn"
          className="btn btn-ghost"
          onClick={handleDeleteSender}
          title="Hapus semua status dari kontak ini"
          style={{
            padding: "6px 12px",
            fontSize: "0.85rem",
            color: "var(--accent-danger)",
            gap: "6px",
          }}
        >
          <TrashIcon size={16} />
          Hapus Semua
        </button>
      </div>

      {/* Status Detail Grid */}
      <div className="messages-container" style={{ padding: "16px" }}>
        <div className="status-detail-grid">
          {validStatuses.map((status) => (
            <div key={status.id} className="status-detail-card">
              {/* Delete button */}
              <button
                className="status-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteStatus(status.id);
                }}
                title="Hapus status ini"
                aria-label="Delete status"
              >
                🗑️
              </button>

              {/* Media/Content */}
              {status.type === "image" && (
                <StatusDetailImage
                  messageId={status.id}
                  caption={status.media?.caption}
                  text={status.text}
                  onClick={() => setLightboxUrl(`/api/media/${status.id}`)}
                />
              )}
              {status.type === "video" && (
                <StatusDetailVideo
                  messageId={status.id}
                  caption={status.media?.caption}
                  text={status.text}
                />
              )}
              {status.type !== "image" && status.type !== "video" && (
                <div className="status-detail-text-content">
                  {status.text || "[Status]"}
                </div>
              )}

              {/* Caption & Timestamp */}
              <div className="status-detail-footer">
                {status.media?.caption && (
                  <div className="status-detail-caption">{status.media.caption}</div>
                )}
                <div className="status-detail-time">{formatTimestamp(status.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="status-load-more">
            <button
              id="status-load-more-btn"
              className="btn btn-ghost status-load-more-btn"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <>
                  <span className="spinner spinner-sm" /> Memuat...
                </>
              ) : (
                "Muat status lebih lama"
              )}
            </button>
          </div>
        )}
      </div>

      {/* Lightbox for full size photo */}
      {lightboxUrl && (
        <Lightbox
          src={lightboxUrl}
          alt="Full size status"
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </div>
  );
}
