import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./src/server/socket/index.js";
import { whatsappService } from "./src/server/services/whatsapp.service.js";
import { createLogger } from "./src/server/lib/logger.js";
import { migrateJsonStoreIfNeeded } from "./src/server/db/migrate-json.js";

const logger = createLogger("server");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Automatically migrate legacy JSON store data to PostgreSQL if DB is empty
  await migrateJsonStoreIfNeeded().catch((err) => {
    logger.error(err, "Error checking JSON store migration");
  });

  const httpServer = createServer(handle);

  // Initialize Socket.IO on the same HTTP server
  initSocketServer(httpServer);

  // Auto-connect to WhatsApp if auth state exists
  whatsappService.connect().catch((error) => {
    logger.warn(error, "Initial WhatsApp connection failed — waiting for manual connect");
  });

  httpServer.listen(port, () => {
    logger.info(`> Server ready on http://${hostname}:${port}`);
    logger.info(`> Environment: ${dev ? "development" : "production"}`);
  });
});
