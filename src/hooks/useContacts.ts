"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import * as api from "@/lib/api";
import type { Contact } from "@/types";

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getContacts();
      if (res.success && res.data) {
        setContacts(res.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const contactsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contacts) {
      if (c.name && c.name.trim().length > 0) {
        const name = c.name.trim();
        // Exact JID
        map[c.id] = name;
        // Clean JID without device suffix
        const cleanId = c.id.replace(/:(\d+)/, "");
        map[cleanId] = name;
        // User/digits portion
        const digits = c.id.split("@")[0].split(":")[0];
        map[digits] = name;
        map[`${digits}@s.whatsapp.net`] = name;

        if (c.lid) {
          map[c.lid] = name;
          const cleanLid = c.lid.replace(/:(\d+)/, "");
          map[cleanLid] = name;
          const lidDigits = c.lid.split("@")[0].split(":")[0];
          map[lidDigits] = name;
        }
      }
    }
    return map;
  }, [contacts]);

  return { contacts, contactsMap, fetchContacts, isLoading };
}
