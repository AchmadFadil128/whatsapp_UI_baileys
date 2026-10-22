"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import type { Session } from "@/lib/auth";

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SecuritySettingsModal({
  isOpen,
  onClose,
}: SecuritySettingsModalProps) {
  const { data: sessionData, isPending } = authClient.useSession();
  const [activeStep, setActiveStep] = useState<
    "overview" | "enable-pwd" | "scan-qr" | "show-backup" | "disable-pwd" | "regen-backup-pwd"
  >("overview");

  // Form states
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Parse secret key from TOTP URI for manual entry fallback
  const secretKey = totpURI ? new URL(totpURI).searchParams.get("secret") : null;

  // Generate QR code when totpURI is set
  useEffect(() => {
    if (!totpURI) {
      setQrDataUrl(null);
      return;
    }
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(totpURI, { width: 220, margin: 2 }))
      .then(setQrDataUrl)
      .catch((err) => console.error("Failed to generate QR code:", err));
  }, [totpURI]);

  // Reset state on close
  const handleClose = useCallback(() => {
    setActiveStep("overview");
    setPassword("");
    setVerifyCode("");
    setTotpURI(null);
    setBackupCodes([]);
    setError(null);
    onClose();
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const is2FAEnabled = Boolean(
    (sessionData?.user as { twoFactorEnabled?: boolean })?.twoFactorEnabled
  );

  // ── Step 1: Start 2FA Setup (provide password) ──
  async function handleStartEnable(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await authClient.twoFactor.enable({
        password,
        method: "totp",
      });

      if (res.error) {
        setError(res.error.message || "Failed to start 2FA setup. Check your password.");
      } else if (res.data && res.data.method === "totp") {
        setTotpURI(res.data.totpURI);
        if (res.data.backupCodes) {
          setBackupCodes(res.data.backupCodes);
        }
        setActiveStep("scan-qr");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Step 2: Confirm TOTP code to activate ──
  async function handleConfirmTotp(e: FormEvent) {
    e.preventDefault();
    if (verifyCode.length !== 6) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      });

      if (res.error) {
        setError(res.error.message || "Invalid verification code. Please try again.");
      } else {
        // Successfully verified! Move to backup codes view
        setActiveStep("show-backup");
      }
    } catch (err) {
      setError("Failed to verify code. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Disable 2FA ──
  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await authClient.twoFactor.disable({
        password,
      });

      if (res.error) {
        setError(res.error.message || "Failed to disable 2FA. Check your password.");
      } else {
        setActiveStep("overview");
        setPassword("");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Regenerate Backup Codes ──
  async function handleRegenBackup(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await authClient.twoFactor.generateBackupCodes({
        password,
      });

      if (res.error) {
        setError(res.error.message || "Failed to regenerate backup codes. Check your password.");
      } else if (res.data?.backupCodes) {
        setBackupCodes(res.data.backupCodes);
        setActiveStep("show-backup");
        setPassword("");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // ── Sign Out ──
  async function handleSignOut() {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess() {
            window.location.href = "/login";
          },
        },
      });
    } catch (err) {
      console.error("Sign out error:", err);
      window.location.href = "/login";
    }
  }

  function handleCopySecret() {
    if (secretKey) {
      navigator.clipboard.writeText(secretKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }

  function handleCopyCodes() {
    if (backupCodes.length > 0) {
      navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  }

  return (
    <div className="security-modal-overlay" onClick={handleClose}>
      <div
        className="security-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-settings-title"
      >
        {/* Modal Header */}
        <div className="security-modal-header">
          <div className="security-modal-title-group">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <h2 id="security-settings-title">Account & Security</h2>
          </div>
          <button
            className="security-modal-close"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="security-modal-body">
          {error && (
            <div className="auth-error" style={{ marginBottom: "16px" }} role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zM8 12a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* ════ Overview Step ════ */}
          {activeStep === "overview" && (
            <>
              {/* User Profile Info */}
              <div className="security-section">
                <div className="security-user-card">
                  <div className="security-avatar">
                    {sessionData?.user?.name ? sessionData.user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="security-user-details">
                    <span className="security-user-name">
                      {sessionData?.user?.name || "User"}
                    </span>
                    <span className="security-user-email">
                      {sessionData?.user?.email || "No email"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2FA Status Card */}
              <div className="security-section">
                <div className="security-card">
                  <div className="security-card-header">
                    <div className="security-card-title-group">
                      <span className="security-card-title">Two-Factor Authentication (TOTP)</span>
                      <span className={`security-badge ${is2FAEnabled ? "active" : "inactive"}`}>
                        {is2FAEnabled ? "● Active" : "○ Inactive"}
                      </span>
                    </div>
                    <p className="security-card-desc">
                      Add an extra layer of security to your account by requiring an authenticator code (Google Authenticator, Authy, etc.) during sign in.
                    </p>
                  </div>

                  <div className="security-card-actions">
                    {!is2FAEnabled ? (
                      <button
                        className="auth-button"
                        onClick={() => {
                          setError(null);
                          setPassword("");
                          setActiveStep("enable-pwd");
                        }}
                      >
                        Enable Two-Factor Authentication
                      </button>
                    ) : (
                      <div className="security-action-row">
                        <button
                          className="auth-button secondary"
                          onClick={() => {
                            setError(null);
                            setPassword("");
                            setActiveStep("regen-backup-pwd");
                          }}
                        >
                          View / Regenerate Backup Codes
                        </button>
                        <button
                          className="auth-button danger"
                          onClick={() => {
                            setError(null);
                            setPassword("");
                            setActiveStep("disable-pwd");
                          }}
                        >
                          Disable 2FA
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Application Session */}
              <div className="security-section">
                <div className="security-card">
                  <div className="security-card-header">
                    <span className="security-card-title">App Session</span>
                    <p className="security-card-desc">
                      Sign out of your web application account. Note: WhatsApp connection will remain active on your server.
                    </p>
                  </div>
                  <button
                    className="auth-button danger-outline"
                    onClick={handleSignOut}
                  >
                    Sign Out of App
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ════ Step: Enable 2FA — Enter Password ════ */}
          {activeStep === "enable-pwd" && (
            <form onSubmit={handleStartEnable} className="auth-form">
              <p className="security-step-desc">
                Please confirm your password to configure Two-Factor Authentication.
              </p>
              <div className="auth-field">
                <label htmlFor="confirm-pwd-enable" className="auth-label">
                  Account Password
                </label>
                <input
                  id="confirm-pwd-enable"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input"
                  required
                  autoFocus
                />
              </div>
              <div className="security-action-row">
                <button
                  type="button"
                  className="auth-button secondary"
                  onClick={() => {
                    setError(null);
                    setActiveStep("overview");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-button"
                  disabled={isLoading || !password}
                >
                  {isLoading ? "Validating..." : "Continue →"}
                </button>
              </div>
            </form>
          )}

          {/* ════ Step: Scan QR Code & Verify ════ */}
          {activeStep === "scan-qr" && (
            <div className="security-step-content">
              <p className="security-step-desc">
                Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.):
              </p>

              {/* QR Code */}
              <div className="security-qr-box">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="2FA QR Code" width={220} height={220} />
                ) : (
                  <div className="auth-spinner" />
                )}
              </div>

              {/* Manual Entry Key */}
              {secretKey && (
                <div className="security-manual-key">
                  <span className="security-key-label">Can&apos;t scan? Enter manually:</span>
                  <div className="security-key-display">
                    <code>{secretKey}</code>
                    <button
                      type="button"
                      className="security-copy-btn"
                      onClick={handleCopySecret}
                    >
                      {copiedKey ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm Code Form */}
              <form onSubmit={handleConfirmTotp} className="auth-form" style={{ marginTop: "20px" }}>
                <div className="auth-field">
                  <label htmlFor="verify-totp-code" className="auth-label">
                    Enter the 6-digit code from your app to verify:
                  </label>
                  <input
                    id="verify-totp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="auth-input font-mono text-center"
                    style={{ fontSize: "1.25rem", letterSpacing: "4px" }}
                    required
                    autoFocus
                  />
                </div>
                <div className="security-action-row">
                  <button
                    type="button"
                    className="auth-button secondary"
                    onClick={() => {
                      setError(null);
                      setActiveStep("overview");
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="auth-button"
                    disabled={isLoading || verifyCode.length !== 6}
                  >
                    {isLoading ? "Verifying..." : "Verify & Activate"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ════ Step: Show Backup Codes ════ */}
          {activeStep === "show-backup" && (
            <div className="security-step-content">
              <div className="security-success-banner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Two-Factor Authentication is now active!</span>
              </div>

              <p className="security-step-desc">
                Save these emergency recovery backup codes in a secure place. If you ever lose access to your authenticator device, each code can be used once to sign in.
              </p>

              <div className="backup-codes-grid">
                {backupCodes.map((code, idx) => (
                  <div key={idx} className="backup-code-pill">
                    <code>{code}</code>
                  </div>
                ))}
              </div>

              <div className="security-action-row" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="auth-button secondary"
                  onClick={handleCopyCodes}
                >
                  {copiedCodes ? "Copied all codes!" : "Copy All Codes"}
                </button>
                <button
                  type="button"
                  className="auth-button"
                  onClick={() => {
                    setActiveStep("overview");
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ════ Step: Disable 2FA — Enter Password ════ */}
          {activeStep === "disable-pwd" && (
            <form onSubmit={handleDisable} className="auth-form">
              <p className="security-step-desc" style={{ color: "var(--accent-danger)" }}>
                Warning: Disabling 2FA will remove this extra protection layer. Please enter your password to confirm.
              </p>
              <div className="auth-field">
                <label htmlFor="confirm-pwd-disable" className="auth-label">
                  Account Password
                </label>
                <input
                  id="confirm-pwd-disable"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input"
                  required
                  autoFocus
                />
              </div>
              <div className="security-action-row">
                <button
                  type="button"
                  className="auth-button secondary"
                  onClick={() => {
                    setError(null);
                    setActiveStep("overview");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-button danger"
                  disabled={isLoading || !password}
                >
                  {isLoading ? "Disabling..." : "Confirm Disable"}
                </button>
              </div>
            </form>
          )}

          {/* ════ Step: Regenerate Backup Codes — Enter Password ════ */}
          {activeStep === "regen-backup-pwd" && (
            <form onSubmit={handleRegenBackup} className="auth-form">
              <p className="security-step-desc">
                Enter your password to view or generate a new set of backup recovery codes. Any previous codes will become invalid.
              </p>
              <div className="auth-field">
                <label htmlFor="confirm-pwd-regen" className="auth-label">
                  Account Password
                </label>
                <input
                  id="confirm-pwd-regen"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input"
                  required
                  autoFocus
                />
              </div>
              <div className="security-action-row">
                <button
                  type="button"
                  className="auth-button secondary"
                  onClick={() => {
                    setError(null);
                    setActiveStep("overview");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-button"
                  disabled={isLoading || !password}
                >
                  {isLoading ? "Generating..." : "Generate Codes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
