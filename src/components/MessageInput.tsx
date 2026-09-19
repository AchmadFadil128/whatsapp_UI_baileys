"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";

import type { Message } from "@/types";

interface MessageInputProps {
  onSend: (text: string, file?: File) => void;
  disabled?: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
}

/**
 * Message composition bar with auto-resize textarea and image attachment capability.
 * Enter to send, Shift+Enter for newline.
 */
export default function MessageInput({ onSend, disabled, replyingTo, onCancelReply }: MessageInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled) return;

    onSend(trimmed, attachment || undefined);
    
    setText("");
    setAttachment(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachment, disabled, onSend, previewUrl]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAttachment(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    textareaRef.current?.focus();
    
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };
  return (
    <div className="message-input-container" style={{ flexDirection: "column", padding: "12px 20px" }}>
      {replyingTo && (
        <div className="input-reply-preview">
          <div className="input-reply-preview-content">
            <div className="input-reply-preview-sender">
              {replyingTo.fromMe ? "You" : (replyingTo.pushName || replyingTo.senderId.split("@")[0])}
            </div>
            <div className="input-reply-preview-text">
              {replyingTo.text || "Message"}
            </div>
          </div>
          <button
            className="input-reply-preview-close"
            onClick={onCancelReply}
            title="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      {/* Attachment Preview Overlay */}
      {attachment && (
        <div 
          style={{
            position: "relative",
            display: "inline-block",
            marginBottom: "12px",
            background: "var(--bg-app)",
            padding: "8px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            maxWidth: "300px"
          }}
        >
          {previewUrl ? (
            attachment.type.startsWith("video/") ? (
              <video 
                src={previewUrl} 
                style={{ maxHeight: "150px", maxWidth: "200px", borderRadius: "var(--radius-sm)", objectFit: "contain" }} 
              />
            ) : (
              <img 
                src={previewUrl} 
                alt="Attachment preview" 
                style={{ maxHeight: "150px", maxWidth: "200px", borderRadius: "var(--radius-sm)", objectFit: "contain" }} 
              />
            )
          ) : (
            <div style={{ padding: "16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
              <span style={{ fontSize: "24px" }}>📄</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {attachment.name}
              </span>
            </div>
          )}
          <button 
            onClick={removeAttachment}
            style={{
              position: "absolute",
              top: "-8px",
              right: "-8px",
              background: "var(--accent-danger)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              boxShadow: "var(--shadow-md)"
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", width: "100%" }}>
        {/* Attach Button */}
        <button
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach file"
          style={{ padding: "10px", fontSize: "1.2rem", color: "var(--text-secondary)" }}
        >
          📎
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleFileChange}
        />

        <div className="message-input-wrapper" style={{ flex: 1 }}>
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder={attachment ? "Add a caption..." : "Type a message"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            style={{ padding: "12px 16px" }}
          />
        </div>
        
        <button
          className="send-button"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !attachment)}
          aria-label="Send message"
          title="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
