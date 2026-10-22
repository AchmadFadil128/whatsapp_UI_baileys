import { prisma } from "./client";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { createLogger } from "../lib/logger";

const logger = createLogger("auth-seed");

/**
 * Ensures the single administrator user from environment variables (.env)
 * exists in the database.
 *
 * Supports updating AUTH_EMAIL and AUTH_PASSWORD without resetting 2FA
 * enrollment or backup codes.
 */
export async function ensureAdminUser(): Promise<void> {
  const email = (process.env.AUTH_EMAIL || "admin@whatsapp.local").trim().toLowerCase();
  const password = process.env.AUTH_PASSWORD || "admin123456";
  const name = process.env.AUTH_NAME || "Admin";

  try {
    // Check if any user already exists (since this is a single-user system)
    let user = await prisma.user.findFirst({
      include: { accounts: true },
    });

    if (!user) {
      // Create the single admin user
      const userId = crypto.randomUUID();
      const hashedPassword = await hashPassword(password);

      user = await prisma.user.create({
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

      logger.info({ email: user.email }, "Single admin user created from environment variables");
      return;
    }

    // Single-user mode: synchronize email and name if changed in .env
    const needsEmailUpdate = user.email !== email;
    const needsNameUpdate = user.name !== name;

    if (needsEmailUpdate || needsNameUpdate) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          name,
        },
        include: { accounts: true },
      });
      logger.info({ email }, "Admin user profile updated from environment variables");
    }

    // Synchronize password if changed in .env
    const credentialAccount = user.accounts.find((a) => a.providerId === "credential");
    if (!credentialAccount) {
      const hashedPassword = await hashPassword(password);
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
      logger.info("Created credential account for admin user");
    } else if (credentialAccount.password) {
      const passwordMatches = await verifyPassword({
        password,
        hash: credentialAccount.password,
      });

      if (!passwordMatches) {
        const newHashedPassword = await hashPassword(password);
        await prisma.account.update({
          where: { id: credentialAccount.id },
          data: { password: newHashedPassword },
        });
        logger.info("Admin user password updated from environment variables");
      }
    }
  } catch (err) {
    logger.error(err, "Failed to ensure single admin user from environment variables");
  }
}
