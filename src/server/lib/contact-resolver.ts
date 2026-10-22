import type { Contact } from "@/types";

/**
 * Resolves a contact display name following the priority rules in refactor.md §5.4:
 * 1. Saved contact name from address book (name) if non-empty
 * 2. Profile push name (pushName / notify) as fallback
 * 3. Verified business name (verifiedName) if available
 * 4. Phone number / user part of JID as final fallback
 */
/**
 * Formats a raw phone number or phone JID into a human-readable international format.
 */
export function formatPhoneNumber(jidOrNumber: string): string {
  const digits = jidOrNumber.replace(/@.*$/, "").replace(/\D/g, "");
  if (!digits) return jidOrNumber;

  if (digits.startsWith("62")) {
    const rest = digits.slice(2);
    if (rest.length >= 8) {
      return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`;
    }
    return `+62 ${rest}`;
  }

  if (digits.length >= 10) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `+${digits}`;
}

/**
 * Resolves a contact display name following the priority rules in refactor.md §5.4:
 * 1. Saved contact name from address book (name) if non-empty
 * 2. Profile push name (pushName / notify) as fallback
 * 3. Verified business name (verifiedName) if available
 * 4. Mapped phone number (formatted) if available
 * 5. User part of fallback JID (formatted if phone number)
 */
export function resolveContactDisplayName(
  contact: Partial<Contact> | undefined,
  fallbackJid: string,
  mappedPnJid?: string
): string {
  // 1. Saved address book contact name
  if (contact?.name && contact.name.trim().length > 0) {
    return contact.name.trim();
  }

  // 2. Profile push name
  if (contact?.pushName && contact.pushName.trim().length > 0) {
    return contact.pushName.trim();
  }

  // 3. Verified business name
  if (contact?.verifiedName && contact.verifiedName.trim().length > 0) {
    return contact.verifiedName.trim();
  }

  // 4. Mapped phone number user part
  if (mappedPnJid) {
    return mappedPnJid.split("@")[0];
  }

  // 5. User part from fallback JID
  const user = fallbackJid.split("@")[0] || fallbackJid;
  return user;
}

