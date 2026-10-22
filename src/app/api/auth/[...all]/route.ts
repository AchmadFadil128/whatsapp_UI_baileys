import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Catch-all API route for Better Auth.
 * Handles all auth endpoints under /api/auth/*.
 */
export const { POST, GET } = toNextJsHandler(auth);
