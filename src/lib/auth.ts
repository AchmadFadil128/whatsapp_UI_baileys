import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "@/server/db/client";

/**
 * Better Auth server instance.
 *
 * This is the single source of truth for authentication configuration.
 * It uses the existing Prisma client and PostgreSQL database.
 *
 * Exported as `auth` (required by Better Auth CLI).
 */
export const auth = betterAuth({
  appName: "WhatsApp Homelab",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "whatsapp-homelab-dev-secret-key-32-chars-min",

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },

  plugins: [
    twoFactor({
      issuer: "WhatsApp Homelab",
    }),
  ],

  session: {
    // Sessions expire after 7 days of inactivity
    expiresIn: 60 * 60 * 24 * 7,
    // Refresh session if it's within 1 day of expiring
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    database: {
      // Enable joins for better performance with Prisma
      joins: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
