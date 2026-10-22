import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Better Auth client instance.
 *
 * Provides React hooks (useSession, signIn, signUp, etc.)
 * and the 2FA client plugin for TOTP verification.
 *
 * Since the auth API runs on the same domain (/api/auth/*),
 * no explicit baseURL is needed.
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Redirect to 2FA verification page when sign-in requires TOTP
        window.location.href = "/two-factor";
      },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
