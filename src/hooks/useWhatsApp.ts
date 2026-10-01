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
  const [pairingCode, setPairingCode] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    function onConnectionUpdate(data: ConnectionUpdate) {
      setConnectionState(data.state);
      setQrCode(data.qrCode);
      setPairingCode(data.pairingCode);
      setError(data.error);
    }

    socket.on("whatsapp:connection", onConnectionUpdate);

    // Fetch initial status
    api.getStatus().then((res) => {
      if (res.success && res.data) {
        setConnectionState(res.data.state as WhatsAppConnectionState);
        setQrCode(res.data.qrCode);
        setPairingCode(res.data.pairingCode);
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

  const requestPairingCode = useCallback(async (phoneNumber: string) => {
    setIsPairingLoading(true);
    setError(undefined);
    try {
      const res = await api.requestPairingCode(phoneNumber);
      if (res.success && res.data?.code) {
        setPairingCode(res.data.code);
        setConnectionState("pairing");
        return res.data.code;
      } else {
        throw new Error(res.error || "Failed to request pairing code");
      }
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsPairingLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.disconnectWhatsApp();
      setPairingCode(undefined);
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
      setPairingCode(undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    connectionState,
    qrCode,
    pairingCode,
    error,
    isLoading,
    isPairingLoading,
    connect,
    requestPairingCode,
    disconnect,
    logout,
  };
}
