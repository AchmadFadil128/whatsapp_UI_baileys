"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer.
 * Rendered through a portal into document.body so ancestors with
 * transform / backdrop-filter / animations (message bubbles, chat panel)
 * can't trap the `position: fixed` overlay inside their own box.
 */
export default function Lightbox({ src, alt, onClose }: LightboxProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <button
        className="lightbox-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
