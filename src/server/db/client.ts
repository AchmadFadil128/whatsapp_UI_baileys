import { PrismaClient } from "@prisma/client";
import { createLogger } from "@/server/lib/logger";

const logger = createLogger("db");

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "error" },
            { emit: "event", level: "warn" },
          ]
        : ["error"],
  });

if (process.env.NODE_ENV !== "development") {
  // in production, attach to global
} else if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
