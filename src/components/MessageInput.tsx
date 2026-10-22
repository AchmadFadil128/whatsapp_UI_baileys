"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";

import type { Message } from "@/types";
import { getSocket } from "@/lib/socket";
import { CloseIcon, DocumentIcon, EmojiIcon, PlusIcon, SendIcon, MicIcon } from "@/components/Icons";
import EmojiPicker from "@/components/EmojiPicker";

interface MessageInputProps {
  chatId?: string;
  focusTrigger?: number;
  onSend: (text: string, file?: File) => void;
  disabled?: boolean;
  replyingTo?: Message | null;
  replySenderName?: string;
  onCancelReply?: () => void;
}

/**
 * Message composition bar with auto-resize textarea and image attachment capability.
 * Enter to send, Shift+Enter for newline.
 */
export default function MessageInput({
  chatId,
  focusTrigger,
  onSend,
  disabled,
  replyingTo,
  replySenderName,
  onCancelReply,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const notifyTyping = useCallback(() => {
    if (!chatId) return;
    const socket = getSocket();
    socket.emit("typing:start", chatId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing:stop", chatId);
      typingTimeoutRef.current = null;
    }, 2500);
  }, [chatId]);

  // Auto-focus input when entering a chat, switching chats, or when clicking contacts
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [chatId, focusTrigger, disabled]);

  // Also auto-focus when replying to a message
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled) return;

    if (chatId) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      getSocket().emit("typing:stop", chatId);
    }

    onSend(trimmed, attachment || undefined);
    
    setText("");
    setAttachment(null);
    setShowEmojiPicker(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachment, disabled, onSend, previewUrl, chatId]);

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

  const handleSelectEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextPos = start + emoji.length;
      textarea.setSelectionRange(nextPos, nextPos);
      handleInput();
    });
  }, [text, handleInput]);

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
  const canSend = !disabled && (text.trim().length > 0 || !!attachment);

  return (
    <div className="message-input-container">
      {replyingTo && (
        <div className="input-reply-preview">
          <div className="input-reply-preview-content">
            <div className="input-reply-preview-sender">
              {replySenderName || (replyingTo.fromMe ? "You" : (replyingTo.pushName || replyingTo.senderId.split("@")[0]))}
            </div>
            <div className="input-reply-preview-text">
              {replyingTo.text || "Message"}
            </div>
          </div>
          <button
            className="input-reply-preview-close"
            onClick={onCancelReply}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      )}

      {/* Attachment Preview */}
      {attachment && (
        <div className="input-attachment-preview">
          {previewUrl ? (
            attachment.type.startsWith("video/") ? (
              <video src={previewUrl} className="input-attachment-media" />
            ) : (
              <img src={previewUrl} alt="Attachment preview" className="input-attachment-media" />
            )
          ) : (
            <div className="input-attachment-file">
              <DocumentIcon size={28} />
              <span>{attachment.name}</span>
            </div>
          )}
          <button
            className="input-attachment-remove"
            onClick={removeAttachment}
            aria-label="Remove attachment"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="message-input-row">
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={handleSelectEmoji}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        <button
          id="emoji-picker-btn"
          className={`icon-btn compose-btn ${showEmojiPicker ? "active" : ""}`}
          type="button"
          title="Emoji"
          aria-label="Emoji"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          disabled={disabled}
        >
          <EmojiIcon size={24} />
        </button>
        {/* Attach Button */}
        <button
          id="attach-btn"
          className="icon-btn compose-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach"
          aria-label="Attach file"
        >
          <PlusIcon size={24} />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div className="message-input-wrapper">
          <textarea
            id="message-input"
            ref={textareaRef}
            className="message-input"
            placeholder={attachment ? "Add a caption" : "Type a message"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleInput();
              notifyTyping();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
          />
        </div>

        <button
          id="send-btn"
          className="icon-btn compose-btn send-button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={canSend ? "Send message" : "Voice message (not supported)"}
          title={canSend ? "Send" : "Type a message to send"}
        >
          {canSend ? <SendIcon size={24} /> : <MicIcon size={24} />}
        </button>
      </div>
    </div>
  );
}
