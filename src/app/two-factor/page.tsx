"use client";

import { useState, useRef, FormEvent, KeyboardEvent, ClipboardEvent } from "react";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

const CODE_LENGTH = 6;

/**
 * Two-Factor Authentication verification page.
 * Accepts a 6-digit TOTP code from an authenticator app,
 * or a backup code for emergency account recovery.
 * Features auto-advancing digit inputs and paste support.
 */
export default function TwoFactorPage() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setRef(index: number) {
    return (el: HTMLInputElement | null) => {
      inputRefs.current[index] = el;
    };
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are filled
    if (digit && index === CODE_LENGTH - 1) {
      const code = newDigits.join("");
      if (code.length === CODE_LENGTH) {
        handleVerifyTotp(code);
      }
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (pastedData.length > 0) {
      const newDigits = Array(CODE_LENGTH).fill("");
      for (let i = 0; i < pastedData.length; i++) {
        newDigits[i] = pastedData[i];
      }
      setDigits(newDigits);

      const focusIndex = Math.min(pastedData.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();

      if (pastedData.length === CODE_LENGTH) {
        handleVerifyTotp(pastedData);
      }
    }
  }

  async function handleVerifyTotp(code: string) {
    setError(null);
    setIsLoading(true);

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code,
        trustDevice,
      });

      if (verifyError) {
        setError(verifyError.message || "Invalid verification code. Please try again.");
        setDigits(Array(CODE_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("2FA verification error:", err);
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyBackup(e: FormEvent) {
    e.preventDefault();
    if (!backupCode.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyBackupCode({
        code: backupCode.trim(),
      });

      if (verifyError) {
        setError(verifyError.message || "Invalid backup code. Please check and try again.");
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Backup code verification error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "totp") {
      const code = digits.join("");
      if (code.length === CODE_LENGTH) {
        handleVerifyTotp(code);
      }
    } else {
      handleVerifyBackup(e);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-2fa-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
              <circle cx="12" cy="16" r="1.5" fill="var(--accent-primary)" />
            </svg>
          </div>
          <h1 className="auth-title">Two-Factor Authentication</h1>
          <p className="auth-subtitle">
            {mode === "totp"
              ? "Enter the 6-digit code from your authenticator app"
              : "Enter an emergency backup code"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zM8 12a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Mode Selector */}
        <div className="auth-mode-switch">
          <button
            type="button"
            className={`auth-mode-btn ${mode === "totp" ? "active" : ""}`}
            onClick={() => {
              setMode("totp");
              setError(null);
            }}
          >
            Authenticator App
          </button>
          <button
            type="button"
            className={`auth-mode-btn ${mode === "backup" ? "active" : ""}`}
            onClick={() => {
              setMode("backup");
              setError(null);
            }}
          >
            Backup Code
          </button>
        </div>

        {/* Form */}
        {mode === "totp" ? (
          <form onSubmit={handleFormSubmit} className="auth-form">
            <div className="totp-inputs">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={setRef(index)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="totp-digit"
                  disabled={isLoading}
                  autoFocus={index === 0}
                  aria-label={`Digit ${index + 1}`}
                />
              ))}
            </div>

            {/* Trust Device */}
            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="auth-checkbox"
              />
              <span>Trust this device for 30 days</span>
            </label>

            <button
              type="submit"
              className="auth-button"
              disabled={isLoading || digits.join("").length !== CODE_LENGTH}
            >
              {isLoading ? (
                <>
                  <div className="auth-spinner" />
                  Verifying...
                </>
              ) : (
                "Verify Code"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyBackup} className="auth-form">
            <div className="auth-field">
              <label htmlFor="backup-code" className="auth-label">
                Recovery Backup Code
              </label>
              <input
                id="backup-code"
                type="text"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                placeholder="e.g. abcd1234ef"
                className="auth-input font-mono"
                required
                autoFocus
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={isLoading || !backupCode.trim()}
            >
              {isLoading ? (
                <>
                  <div className="auth-spinner" />
                  Verifying...
                </>
              ) : (
                "Verify Backup Code"
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="auth-footer">
          <p className="auth-hint">
            {mode === "totp"
              ? "Open Google Authenticator, Authy, or 1Password to view your current 6-digit code."
              : "Each backup code can only be used once."}
          </p>
          <div style={{ marginTop: "12px" }}>
            <Link href="/login" className="auth-link">
              ← Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
