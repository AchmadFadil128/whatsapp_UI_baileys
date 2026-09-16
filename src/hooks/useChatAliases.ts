"use client";

import { useState, useEffect, useCallback } from "react";

export function useChatAliases() {
  const [aliases, setAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem("whatsapp_chat_aliases");
      if (stored) {
        setAliases(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load chat aliases", e);
    }
  }, []);

  const setAlias = useCallback((chatId: string, name: string) => {
    setAliases((prev) => {
      const updated = { ...prev };
      if (!name.trim()) {
        delete updated[chatId];
      } else {
        updated[chatId] = name.trim();
      }
      
      try {
        localStorage.setItem("whatsapp_chat_aliases", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save chat alias", e);
      }
      return updated;
    });
  }, []);

  return { aliases, setAlias };
}
