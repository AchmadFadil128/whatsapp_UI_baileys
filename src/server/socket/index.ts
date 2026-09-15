import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { createLogger } from "@/server/lib/logger";
import { whatsappService } from "@/server/services/whatsapp.service";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ConnectionUpdate,
  MessageEvent,
  MessageStatusEvent,
  ChatUpdateEvent,
  TypingEvent,
} from "@/types";

const logger = createLogger("socket");

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

/**
 * Initializes the Socket.IO server and wires it to WhatsAppService events.
 * Creates a single centralized realtime layer per AGENTS.md §12.
 */
export function initSocketServer(
  httpServer: HTTPServer
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    }
  );

  // ─── Client Connection ──────────────────────────────────────
  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    // Send current connection state immediately
    const currentState = whatsappService.getConnectionState();
    const currentQr = whatsappService.getCurrentQrCode();
    socket.emit("whatsapp:connection", {
      state: currentState,
      qrCode: currentQr || undefined,
    });

    // ─── Client Events ──────────────────────────────────────
    socket.on("typing:start", (chatId: string) => {
      if (whatsappService.isConnected()) {
        logger.debug({ chatId }, "Typing start");
      }
    });

    socket.on("typing:stop", (chatId: string) => {
      if (whatsappService.isConnected()) {
        logger.debug({ chatId }, "Typing stop");
      }
    });

    socket.on("message:read", (chatId: string) => {
      whatsappService.markChatRead(chatId);
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Client disconnected");
    });
  });

  // ─── WhatsApp Service → Socket.IO Bridge ────────────────────

  whatsappService.on("whatsapp:connection", (data: ConnectionUpdate) => {
    io?.emit("whatsapp:connection", data);
  });

  whatsappService.on("message:received", (data: MessageEvent) => {
    io?.emit("message:received", data);
  });

  whatsappService.on("message:sent", (data: MessageEvent) => {
    io?.emit("message:received", data);
  });

  whatsappService.on("message:updated", (data: MessageStatusEvent) => {
    io?.emit("message:updated", data);
  });

  whatsappService.on("chat:updated", (data: ChatUpdateEvent) => {
    io?.emit("chat:updated", data);
  });

  whatsappService.on("typing:updated", (data: TypingEvent) => {
    io?.emit("typing:updated", data);
  });

  whatsappService.on("history:synced", () => {
    // After history sync, tell clients to refresh their chat list
    io?.emit("whatsapp:connection", {
      state: whatsappService.getConnectionState(),
    });
  });

  logger.info("Socket.IO server initialized");
  return io;
}

export function getIO(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents
> | null {
  return io;
}
