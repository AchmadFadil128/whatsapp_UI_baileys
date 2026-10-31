import { PrismaClient } from "@prisma/client";
import { failoverManager } from "./failover";

/**
 * Transparent Proxy for PrismaClient that dynamically delegates all operations
 * to the active database connection managed by FailoverManager:
 * - Primary DB on VM 2 (when PRIMARY state)
 * - Temporary DB on VM 1 (when FAILOVER or SYNCING state)
 *
 * All modules importing `prisma` from `@/server/db/client` (Better Auth, Store, API routes)
 * automatically interact with the correct database without requiring code changes.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const activeClient = failoverManager.getDb();
    const value = (activeClient as any)[prop];
    if (typeof value === "function") {
      return value.bind(activeClient);
    }
    return value;
  },
});

export { failoverManager };
export default prisma;
