import { PrismaClient } from "@prisma/client";
import { createLogger } from "@/server/lib/logger";
import type { DatabaseFailoverState } from "@/types";

const logger = createLogger("failover");

/**
 * Manages dual PostgreSQL connections:
 * - primaryDb: Pointing to VM 2 (DATABASE_URL)
 * - tempDb: Pointing to VM 1 local (DATABASE_URL_TEMP)
 *
 * Implements automated health checking, failover routing, and sync triggering.
 */
export class FailoverManager {
  private primaryDb: PrismaClient;
  private tempDb: PrismaClient;
  private state: DatabaseFailoverState = "PRIMARY";
  private failCount = 0;
  private readonly maxFail = 3;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isStarted = false;
  private isSyncing = false;
  private listeners: Set<(state: DatabaseFailoverState) => void> = new Set();

  constructor() {
    const primaryUrl = process.env.DATABASE_URL;
    const tempUrl = process.env.DATABASE_URL_TEMP || process.env.DATABASE_URL;

    this.primaryDb = new PrismaClient({
      datasourceUrl: primaryUrl,
      log:
        process.env.NODE_ENV === "development"
          ? [
              { emit: "event", level: "error" },
              { emit: "event", level: "warn" },
            ]
          : ["error"],
    });

    this.tempDb = new PrismaClient({
      datasourceUrl: tempUrl,
      log:
        process.env.NODE_ENV === "development"
          ? [
              { emit: "event", level: "error" },
              { emit: "event", level: "warn" },
            ]
          : ["error"],
    });
  }

  /**
   * Initializes connections and starts the background health check.
   */
  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Check primary DB availability at startup
    const isPrimaryOnline = await this.ping(this.primaryDb);
    if (isPrimaryOnline) {
      this.state = "PRIMARY";
      this.failCount = 0;
      logger.info("Primary database is connected (PRIMARY mode active)");
    } else {
      this.state = "FAILOVER";
      this.failCount = this.maxFail;
      logger.warn(
        "Primary database is unreachable at startup. Starting in FAILOVER mode (using temporary DB)"
      );
    }

    // Verify temporary DB connection if configured separately
    if (process.env.DATABASE_URL_TEMP) {
      const isTempOnline = await this.ping(this.tempDb);
      if (!isTempOnline) {
        logger.error("Temporary database is NOT reachable! Please check DATABASE_URL_TEMP.");
      } else {
        logger.info("Temporary database is ready");
      }
    }

    // Start background health checking (every 10 seconds)
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.healthCheckInterval = setInterval(() => {
      this.healthCheck().catch((err) => {
        logger.error({ err }, "Error during failover health check cycle");
      });
    }, 10000);

    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }
  }

  /**
   * Stops health checking and cleans up intervals.
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isStarted = false;
  }

  /**
   * Returns the active PrismaClient instance based on current failover state.
   */
  getDb(): PrismaClient {
    if (this.state === "PRIMARY") {
      return this.primaryDb;
    }
    return this.tempDb;
  }

  getPrimaryDb(): PrismaClient {
    return this.primaryDb;
  }

  getTempDb(): PrismaClient {
    return this.tempDb;
  }

  getState(): DatabaseFailoverState {
    return this.state;
  }

  isFailover(): boolean {
    return this.state !== "PRIMARY";
  }

  onStateChange(listener: (state: DatabaseFailoverState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(newState: DatabaseFailoverState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    logger.info({ oldState, newState }, "Database failover state changed");
    for (const listener of this.listeners) {
      try {
        listener(newState);
      } catch (err) {
        logger.error({ err }, "Error in failover state change listener");
      }
    }
  }

  /**
   * Periodic health check against primary DB.
   */
  private async healthCheck(): Promise<void> {
    if (this.isSyncing) {
      return; // Do not check while sync is actively in progress
    }

    // If temp and primary use identical URL (e.g. dev without DATABASE_URL_TEMP), no-op
    if (!process.env.DATABASE_URL_TEMP || process.env.DATABASE_URL_TEMP === process.env.DATABASE_URL) {
      return;
    }

    const isPrimaryUp = await this.ping(this.primaryDb);

    if (this.state === "PRIMARY") {
      if (!isPrimaryUp) {
        this.failCount++;
        logger.warn(
          { failCount: this.failCount, maxFail: this.maxFail },
          "Primary DB heartbeat failed"
        );
        if (this.failCount >= this.maxFail) {
          logger.error("Primary DB unreachable 3 times consecutively. Switching to FAILOVER mode.");
          this.setState("FAILOVER");
        }
      } else {
        this.failCount = 0;
      }
    } else if (this.state === "FAILOVER") {
      if (isPrimaryUp) {
        logger.info("Primary DB is back online! Initiating synchronization...");
        this.setState("SYNCING");
        this.isSyncing = true;

        try {
          const { syncTempToPrimary } = await import("@/server/services/sync.service");
          const success = await syncTempToPrimary(this.tempDb, this.primaryDb);

          if (success) {
            logger.info("Data synchronization succeeded. Restoring PRIMARY mode.");
            this.failCount = 0;
            this.setState("PRIMARY");
          } else {
            logger.warn("Data synchronization failed. Remaining in FAILOVER mode.");
            this.setState("FAILOVER");
          }
        } catch (syncErr) {
          logger.error({ syncErr }, "Unexpected error during failover synchronization");
          this.setState("FAILOVER");
        } finally {
          this.isSyncing = false;
        }
      }
    }
  }

  /**
   * Ping database with a 3.5s timeout to prevent hanging connections.
   */
  private async ping(client: PrismaClient): Promise<boolean> {
    try {
      const queryPromise = client.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB ping timeout")), 3500)
      );
      await Promise.race([queryPromise, timeoutPromise]);
      return true;
    } catch {
      return false;
    }
  }
}

const globalForFailover = globalThis as unknown as {
  __failoverManager?: FailoverManager;
};

export const failoverManager =
  globalForFailover.__failoverManager ?? new FailoverManager();

if (process.env.NODE_ENV !== "production") {
  globalForFailover.__failoverManager = failoverManager;
}

export default failoverManager;

