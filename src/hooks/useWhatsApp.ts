"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import * as api from "@/lib/api";
import type { WhatsAppConnectionState, ConnectionUpdate } from "@/types";

/**
 * React hook for WhatsApp connection state.
 * Listens to Socket.IO events for realtime state updates.
 * Exposes connect/disconnect/logout actions.
 */
export function useWhatsApp() {
  const [connectionState, setConnectionState] =
    useState<WhatsAppConnectionState>("disconnected");
  const [qrCode, setQrCode] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    function onConnectionUpdate(data: ConnectionUpdate) {
      setConnectionState(data.state);
      setQrCode(data.qrCode);
      setError(data.error);
    }

    socket.on("whatsapp:connection", onConnectionUpdate);

    // Fetch initial status
    api.getStatus().then((res) => {
      if (res.success && res.data) {
        setConnectionState(res.data.state as WhatsAppConnectionState);
        setQrCode(res.data.qrCode);
      }
    });

    return () => {
      socket.off("whatsapp:connection", onConnectionUpdate);
    };
  }, []);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      await api.connectWhatsApp();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.disconnectWhatsApp();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.logoutWhatsApp();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    connectionState,
    qrCode,
    error,
    isLoading,
    connect,
    disconnect,
    logout,
  };
}
