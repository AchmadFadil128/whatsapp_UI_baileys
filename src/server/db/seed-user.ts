import type { PrismaClient } from "@prisma/client";
import { failoverManager } from "./failover";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { createLogger } from "../lib/logger";

const logger = createLogger("auth-seed");

async function seedUserToClient(
  client: PrismaClient,
  dbLabel: string,
  email: string,
  password: string,
  name: string
): Promise<void> {
  try {
    let user = await client.user.findFirst({
      include: { accounts: true },
    });

    if (!user) {
      const userId = crypto.randomUUID();
      const hashedPassword = await hashPassword(password);

      user = await client.user.create({
        data: {
          id: userId,
          email,
          name,
          emailVerified: true,
          accounts: {
            create: {
              id: crypto.randomUUID(),
              accountId: userId,
              providerId: "credential",
              password: hashedPassword,
            },
          },
        },
        include: { accounts: true },
      });

      logger.info({ email: user.email, db: dbLabel }, "Admin user created in database");
      return;
    }

    const needsEmailUpdate = user.email !== email;
    const needsNameUpdate = user.name !== name;

    if (needsEmailUpdate || needsNameUpdate) {
      user = await client.user.update({
        where: { id: user.id },
        data: {
          email,
          name,
        },
        include: { accounts: true },
      });
      logger.info({ email, db: dbLabel }, "Admin user profile synchronized in database");
    }

    const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
    if (!credentialAccount) {
      const hashedPassword = await hashPassword(password);
      await client.account.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
      logger.info({ db: dbLabel }, "Created credential account for admin user");
    } else if (credentialAccount.password) {
      const passwordMatches = await verifyPassword({
        password,
        hash: credentialAccount.password,
      });

      if (!passwordMatches) {
        const newHashedPassword = await hashPassword(password);
        await client.account.update({
          where: { id: credentialAccount.id },
          data: { password: newHashedPassword },
        });
        logger.info({ db: dbLabel }, "Admin user password updated in database");
      }
    }
  } catch (err) {
    logger.warn({ err, db: dbLabel }, "Could not seed admin user to database");
  }
}

/**
 * Ensures the administrator user exists in both Primary DB and Temporary DB
 * so authentication succeeds regardless of failover state.
 */
export async function ensureAdminUser(): Promise<void> {
  const email = (process.env.AUTH_EMAIL || "admin@whatsapp.local").trim().toLowerCase();
  const password = process.env.AUTH_PASSWORD || "admin123456";
  const name = process.env.AUTH_NAME || "Admin";

  const primaryDb = failoverManager.getPrimaryDb();
  await seedUserToClient(primaryDb, "primary", email, password, name);

  if (process.env.DATABASE_URL_TEMP && process.env.DATABASE_URL_TEMP !== process.env.DATABASE_URL) {
    const tempDb = failoverManager.getTempDb();
    await seedUserToClient(tempDb, "temp", email, password, name);
  }
}
