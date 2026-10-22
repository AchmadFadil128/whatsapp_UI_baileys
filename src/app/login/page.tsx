"use client";

import { useState, FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Login page — email/password sign-in with 2FA support.
 * Dark theme consistent with the WhatsApp-style design system.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: signInError } = await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onSuccess(context) {
            if (context.data.twoFactorRedirect) {
              // 2FA is required — handled by twoFactorClient plugin's onTwoFactorRedirect
              return;
            }
            // Successful sign-in — redirect to main app
            window.location.href = "/";
          },
          onError(context) {
            setError(context.error.message || "Sign in failed. Please check your credentials.");
          },
        }
      );

      if (signInError) {
        setError(signInError.message || "Sign in failed.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Sign in error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <svg viewBox="0 0 39 39" width="39" height="39" fill="none">
              <path
                d="M10.7 32.8l.6.3c2.5 1.5 5.3 2.2 8.1 2.2 8.8 0 16-7.2 16-16 0-4.2-1.7-8.3-4.7-11.3s-7-4.7-11.3-4.7c-8.8 0-16 7.2-15.9 16.1 0 3 .9 5.9 2.4 8.4l.4.6-1.5 5.5 5.9-1.1z"
                fill="var(--accent-primary)"
              />
              <path
                d="M32.4 6.4C29 2.9 24.3 1 19.5 1 9.3 1 1.1 9.3 1.2 19.4c0 3.2.9 6.3 2.4 9.1L1 38l9.7-2.5c2.7 1.5 5.7 2.2 8.7 2.2 10.1 0 18.3-8.3 18.3-18.4 0-4.9-1.9-9.5-5.3-12.9zM19.5 34.6c-2.7 0-5.4-.7-7.7-2.1l-.6-.3-5.8 1.5L6.9 28l-.4-.6c-1.6-2.4-2.3-5.2-2.3-8 0-8.4 6.8-15.2 15.2-15.2 4.1 0 7.9 1.6 10.7 4.4 2.9 2.9 4.4 6.6 4.4 10.7 0 8.5-6.9 15.3-15 15.3zm8.4-11.3c-.5-.2-2.7-1.3-3.1-1.5-.4-.2-.8-.2-1.1.2-.3.5-1.2 1.5-1.5 1.8-.3.3-.5.3-1 .1s-2-0.7-3.8-2.4c-1.4-1.3-2.4-2.8-2.6-3.3-.3-.5 0-.7.2-1 .2-.2.5-.5.7-.8.2-.3.3-.5.5-.8.2-.3.1-.6 0-.8-.1-.3-1.1-2.7-1.5-3.7-.4-1-.8-0.8-1.1-0.8h-1c-.3 0-.8.1-1.2.6-.4.5-1.7 1.6-1.7 4s1.7 4.6 2 4.9c.2.3 3.4 5.2 8.2 7.3 1.1.5 2 .8 2.7 1 1.1.4 2.1.3 2.9.2.9-.1 2.7-1.1 3.1-2.2.4-1.1.4-2 .3-2.2-.1-.2-.5-.3-1-.6z"
                fill="white"
              />
            </svg>
          </div>
          <h1 className="auth-title">WhatsApp Homelab</h1>
          <p className="auth-subtitle">Sign in to your account</p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="auth-input"
              required
              autoComplete="current-password"
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="auth-button"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? (
              <>
                <div className="auth-spinner" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          <p className="auth-hint">
            Protected instance — credentials are configured in your server environment (.env).
          </p>
        </div>
      </div>
    </div>
  );
}
