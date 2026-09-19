"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";

interface MessageInputProps {
  onSend: (text: string, file?: File) => void;
  disabled?: boolean;
}

/**
 * Message composition bar with auto-resize textarea and image attachment capability.
 * Enter to send, Shift+Enter for newline.
 */
export default function MessageInput({ onSend, disabled }: MessageInputProps) {
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

    if (file.type.startsWith("image/")) {
      setAttachment(file);
      setPreviewUrl(URL.createObjectURL(file));
      // Focus textarea to type caption
      textareaRef.current?.focus();
    } else {
      alert("Please select an image file.");
    }
    
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
      {/* Image Preview Overlay */}
      {previewUrl && (
        <div 
          style={{
            position: "relative",
            display: "inline-block",
            marginBottom: "12px",
            background: "var(--bg-app)",
            padding: "8px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)"
          }}
        >
          <img 
            src={previewUrl} 
            alt="Attachment preview" 
            style={{ maxHeight: "150px", maxWidth: "200px", borderRadius: "var(--radius-sm)", objectFit: "contain" }} 
          />
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
          title="Attach image"
          style={{ padding: "10px", fontSize: "1.2rem", color: "var(--text-secondary)" }}
        >
          📎
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          accept="image/*"
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
