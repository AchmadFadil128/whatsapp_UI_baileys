"use client";

import { useEffect, useState, useCallback } from "react";
import type { WhatsAppConnectionState } from "@/types";

interface QRScreenProps {
  connectionState: WhatsAppConnectionState;
  qrCode?: string;
  pairingCode?: string;
  error?: string;
  isLoading: boolean;
  isPairingLoading?: boolean;
  onConnect: () => void;
  onRetry: () => void;
  onRequestPairingCode?: (phoneNumber: string) => Promise<string | void>;
}

/**
 * Connection screen supporting both QR code scanning and 8-digit pairing code.
 * Follows AGENTS.md §5:
 *   - Supports QR code pairing & pairing code authentication
 *   - Presentation layer only, does not import Baileys
 */
export default function QRScreen({
  connectionState,
  qrCode,
  pairingCode,
  error,
  isLoading,
  isPairingLoading = false,
  onConnect,
  onRetry,
  onRequestPairingCode,
}: QRScreenProps) {
  const [authMode, setAuthMode] = useState<"qr" | "pairing">("qr");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // If connection state moves to "pairing" or pairingCode arrives, auto-switch to pairing tab
  useEffect(() => {
    if (connectionState === "pairing" || pairingCode) {
      setAuthMode("pairing");
    }
  }, [connectionState, pairingCode]);

  // Generate QR Data URL
  useEffect(() => {
    if (!qrCode) {
      setQrDataUrl(null);
      return;
    }

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

  const handleRequestPairing = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);

      const digitsOnly = phoneNumber.replace(/\D/g, "");
      if (!digitsOnly || digitsOnly.length < 7) {
        setLocalError(
          "Please enter a valid phone number with country code (e.g. 628123456789)."
        );
        return;
      }

      if (!onRequestPairingCode) {
        setLocalError("Pairing code is not supported by the client.");
        return;
      }

      try {
        await onRequestPairingCode(digitsOnly);
      } catch (err) {
        setLocalError(
          (err as Error).message || "Failed to request pairing code."
        );
      }
    },
    [phoneNumber, onRequestPairingCode]
  );

  const handleCopyCode = useCallback(() => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/\s+/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [pairingCode]);

  // Format pairing code for display (e.g. "ABCD - EFGH" or group into 4 & 4)
  const cleanCode = (pairingCode || "").replace(/-/g, "");
  const codeGroup1 = cleanCode.length >= 4 ? cleanCode.slice(0, 4) : cleanCode;
  const codeGroup2 = cleanCode.length > 4 ? cleanCode.slice(4) : "";

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

        {/* Auth Mode Switcher */}
        {connectionState !== "connecting" &&
          connectionState !== "reconnecting" &&
          connectionState !== "logged_out" && (
            <div className="auth-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "qr"}
                className={`auth-mode-tab ${authMode === "qr" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("qr");
                  setLocalError(null);
                }}
              >
                <span>📷</span>
                <span>QR Code</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "pairing"}
                className={`auth-mode-tab ${
                  authMode === "pairing" ? "active" : ""
                }`}
                onClick={() => {
                  setAuthMode("pairing");
                  setLocalError(null);
                }}
              >
                <span>🔢</span>
                <span>Pairing Code</span>
              </button>
            </div>
          )}

        {/* Global Error Banner if present */}
        {error && connectionState === "error" && (
          <div className="pairing-error-alert" role="alert">
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        {/* ─── Mode 1: QR Code Flow ──────────────────────────────── */}
        {authMode === "qr" && (
          <>
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
                  <h3>Scan QR Code</h3>
                  <p>
                    Connect using your phone’s camera by scanning a QR code.
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
                    "Show QR Code"
                  )}
                </button>
              </>
            )}
          </>
        )}

        {/* ─── Mode 2: Pairing Code Flow ─────────────────────────── */}
        {authMode === "pairing" && (
          <>
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

            {/* Pairing Code Display (Code Ready) */}
            {(connectionState === "pairing" || pairingCode) &&
              connectionState !== "connecting" && (
                <div className="pairing-code-wrapper">
                  <div className="pairing-code-badges">
                    <div className="pairing-code-group">
                      {codeGroup1.split("").map((char, idx) => (
                        <div key={`c1-${idx}`} className="pairing-code-char">
                          {char}
                        </div>
                      ))}
                    </div>
                    {codeGroup2 && (
                      <>
                        <span className="pairing-code-divider">—</span>
                        <div className="pairing-code-group">
                          {codeGroup2.split("").map((char, idx) => (
                            <div key={`c2-${idx}`} className="pairing-code-char">
                              {char}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`pairing-code-copy-btn ${copied ? "copied" : ""}`}
                    onClick={handleCopyCode}
                  >
                    {copied ? (
                      <>
                        <span>✓</span>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>

                  <div className="qr-instructions">
                    <h3>Enter code on your phone</h3>
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
                      <li>
                        Tap <strong>Link with phone number instead</strong>
                      </li>
                      <li>Enter the 8-character code shown above</li>
                    </ol>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: "8px", fontSize: "0.8125rem", padding: "8px 16px" }}
                    onClick={() => {
                      setPhoneNumber("");
                      setLocalError(null);
                    }}
                  >
                    Use Different Number
                  </button>
                </div>
              )}

            {/* Input Phone Number Form (Before Code is Generated) */}
            {!pairingCode &&
              connectionState !== "pairing" &&
              connectionState !== "connecting" &&
              connectionState !== "reconnecting" && (
                <form className="pairing-form" onSubmit={handleRequestPairing}>
                  <div className="qr-instructions">
                    <h3>Link with Phone Number</h3>
                    <p>
                      Receive an 8-digit pairing code to enter on your phone
                      without scanning a QR code.
                    </p>
                  </div>

                  {localError && (
                    <div className="pairing-error-alert" role="alert">
                      {localError}
                    </div>
                  )}

                  <div className="pairing-input-group">
                    <label
                      htmlFor="pairing-phone-input"
                      className="pairing-input-label"
                    >
                      Phone Number (with Country Code)
                    </label>
                    <div className="pairing-input-wrapper">
                      <input
                        id="pairing-phone-input"
                        type="tel"
                        className="pairing-phone-input"
                        placeholder="e.g. 6281234567890"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={isPairingLoading}
                        autoFocus
                      />
                    </div>
                    <span className="pairing-input-hint">
                      Include country code, digits only (e.g. 62 for Indonesia,
                      1 for US). No +, dashes, or spaces.
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isPairingLoading || !phoneNumber.trim()}
                  >
                    {isPairingLoading ? (
                      <>
                        <div className="spinner spinner-sm" />
                        Generating Code...
                      </>
                    ) : (
                      "Get Pairing Code"
                    )}
                  </button>
                </form>
              )}
          </>
        )}

        {/* ─── Logged Out State ─────────────────────────────────── */}
        {connectionState === "logged_out" && (
          <>
            <div className="qr-instructions">
              <h3>Logged Out</h3>
              <p>
                Your WhatsApp session has been terminated. Connect again to
                start a new session.
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

        {/* ─── Error State (Retry) ──────────────────────────────── */}
        {connectionState === "error" && !pairingCode && (
          <button
            className="btn btn-primary"
            onClick={onRetry}
            disabled={isLoading || isPairingLoading}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
