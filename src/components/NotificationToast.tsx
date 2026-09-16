"use client";

import React from "react";
import type { ToastNotification } from "@/hooks/useNotifications";

interface NotificationToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
  onSelectChat: (chatId: string) => void;
}

export default function NotificationToastContainer({
  toasts,
  onDismiss,
  onSelectChat,
}: NotificationToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-card"
          onClick={() => {
            onSelectChat(toast.chatId);
            onDismiss(toast.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onSelectChat(toast.chatId);
              onDismiss(toast.id);
            }
          }}
        >
          <div className="toast-avatar">
            {toast.title.slice(0, 2).toUpperCase()}
          </div>
          <div className="toast-content">
            <div className="toast-header">
              <span className="toast-title">{toast.title}</span>
              <span className="toast-time">just now</span>
            </div>
            <p className="toast-body">{toast.body}</p>
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
