"use client";

import { useEffect, useState } from "react";
import type { WhatsAppConnectionState } from "@/types";

interface QRScreenProps {
  connectionState: WhatsAppConnectionState;
  qrCode?: string;
  error?: string;
  isLoading: boolean;
  onConnect: () => void;
  onRetry: () => void;
}

/**
 * Connection / QR code screen.
 * Shown when WhatsApp is not connected. Renders QR code, connection states, or error UI.
 */
export default function QRScreen({
  connectionState,
  qrCode,
  error,
  isLoading,
  onConnect,
  onRetry,
}: QRScreenProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrCode) {
      setQrDataUrl(null);
      return;
    }

    // Dynamically import qrcode to generate a data URL on the client
    async function generateQR(data: string) {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(data, {
          width: 256,
          margin: 0,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(url);
      } catch {
        setQrDataUrl(null);
      }
    }

    generateQR(qrCode);
  }, [qrCode]);

  return (
    <div className="qr-screen">
      <div className="qr-card">
        {/* Logo */}
        <div className="qr-logo">
          <div className="qr-logo-icon">💬</div>
          <div className="qr-logo-text">
            <span>WA</span> Client
          </div>
        </div>

        {/* QR Code State */}
        {connectionState === "qr" && qrDataUrl && (
          <>
            <div className="qr-code-wrapper">
              <img src={qrDataUrl} alt="WhatsApp QR Code" />
            </div>
            <div className="qr-instructions">
              <h3>Scan to connect</h3>
              <ol>
                <li>
                  Open <strong>WhatsApp</strong> on your phone
                </li>
                <li>
                  Tap <strong>Menu ⋮</strong> or <strong>Settings</strong> →{" "}
                  <strong>Linked Devices</strong>
                </li>
                <li>
                  Tap <strong>Link a Device</strong>
                </li>
                <li>Point your phone at this screen to scan the QR code</li>
              </ol>
            </div>
          </>
        )}

        {/* Connecting State */}
        {(connectionState === "connecting" ||
          connectionState === "reconnecting") && (
          <>
            <div className="spinner" />
            <div className="qr-instructions">
              <h3>
                {connectionState === "reconnecting"
                  ? "Reconnecting..."
                  : "Connecting..."}
              </h3>
              <p>Establishing connection to WhatsApp servers</p>
            </div>
          </>
        )}

        {/* Disconnected State */}
        {connectionState === "disconnected" && (
          <>
            <div className="qr-instructions">
              <h3>WhatsApp Disconnected</h3>
              <p>
                Click the button below to connect your WhatsApp account to this
                client.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={onConnect}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="spinner spinner-sm" />
                  Connecting...
                </>
              ) : (
                "Connect WhatsApp"
              )}
            </button>
          </>
        )}

        {/* Logged Out State */}
        {connectionState === "logged_out" && (
          <>
            <div className="qr-instructions">
              <h3>Logged Out</h3>
              <p>
                Your WhatsApp session has been terminated. Connect again to start
                a new session.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={onConnect}
              disabled={isLoading}
            >
              Connect WhatsApp
            </button>
          </>
        )}

        {/* Error State */}
        {connectionState === "error" && (
          <>
            <div className="qr-instructions">
              <h3>Connection Error</h3>
              <p>{error || "An unexpected error occurred. Please try again."}</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={onRetry}
              disabled={isLoading}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
