"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { SearchIcon, CloseIcon } from "@/components/Icons";

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    name: "Smileys & Emotion",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪",
      "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
      "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕",
      "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓",
      "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧",
      "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫",
      "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👻",
      "👽", "👾", "🤖"
    ],
  },
  {
    id: "people",
    name: "People & Gestures",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘",
      "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛",
      "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾",
      "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀",
      "👁️", "👅", "👄", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩",
      "🧓", "👴", "👵", "👮", "🕵️", "💂", "👷", "🤴", "👸", "👳", "👲", "🧕",
      "🤵", "👰", "🤰", "🤱", "👼", "🎅", "🤶", "🦸", "🦹", "🧙", "🧚", "🧛"
    ],
  },
  {
    id: "animals",
    name: "Animals & Nature",
    icon: "🐱",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
      "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🦆",
      "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞",
      "🐜", "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖", "🐙", "🦑", "🦐",
      "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍",
      "🐘", "🦛", "🦏", "🐪", "🦒", "🦘", "🐃", "🐄", "🐎", "🐖", "🐑", "🐐",
      "🦌", "🐕", "🐩", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢", "🕊️", "🐇", "🦝",
      "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🍃", "🍂", "🍁", "🍄", "🌹",
      "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌙", "⭐", "🌟", "✨", "⚡", "🔥",
      "🌈", "☀️", "🌤️", "⛅", "🌧️", "❄️", "⛄", "🌊", "💧"
    ],
  },
  {
    id: "food",
    name: "Food & Drink",
    icon: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥒", "🌶️", "🌽", "🥕",
      "🧄", "🧅", "🥔", "🍠", "🥐", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🥞",
      "🧇", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🌮",
      "🌯", "🥗", "🥘", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙",
      "🍚", "🍘", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🍫", "🍬",
      "🍭", "🍮", "🍯", "🥛", "☕", "🫖", "🍵", "🧃", "🥤", "🧋", "🍺", "🍻",
      "🥂", "🍷", "🥃", "🍸", "🍹", "🍾", "🧊"
    ],
  },
  {
    id: "activities",
    name: "Activities & Sports",
    icon: "⚽",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🏓", "🏸",
      "🏒", "🏑", "🏏", "🥊", "🥋", "🥅", "⛳", "🏹", "🎣", "🤿", "🛹", "🛼",
      "🎿", "🏂", "🏋️", "🤼", "🤸", "⛹️", "🤺", "🏇", "🧘", "🏄", "🏊", "🚣",
      "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎫", "🎟️", "🎪",
      "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲",
      "♟️", "🎯", "🎳", "🎮", "🎰", "🧩"
    ],
  },
  {
    id: "travel",
    name: "Travel & Places",
    icon: "🚗",
    emojis: [
      "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚",
      "🚜", "🚲", "🛴", "🛵", "🏍️", "🚨", "🚔", "🚍", "🚘", "🚖", "🚄", "🚅",
      "🚆", "🚇", "🚊", "🚉", "🚁", "✈️", "🛫", "🛬", "🚀", "🛸", "⛵", "🚤",
      "🛳️", "⛴️", "🚢", "⚓", "🚧", "🚦", "🚥", "🗺️", "🗿", "🗽", "🗼", "🏰",
      "🏯", "🏟️", "🎡", "🎢", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🏕️", "🏠",
      "🏡", "🏢", "🏣", "🏥", "🏦", "🏨", "🏪", "🏫", "🏛️", "⛪", "🕌", "⛩️"
    ],
  },
  {
    id: "objects",
    name: "Objects",
    icon: "💡",
    emojis: [
      "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "📷", "📸", "📹", "🎥",
      "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "⏰", "⏱️", "⏲️", "⏳", "📡",
      "🔋", "🔌", "💡", "🔦", "🕯️", "💸", "💵", "💴", "💶", "💷", "💰", "💳",
      "💎", "⚖️", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🔩", "⚙️", "⛓️", "🧲", "🔫",
      "💣", "🧨", "🔪", "🗡️", "⚔️", "🛡️", "🔑", "🗝️", "🚪", "🪑", "🛋️", "🛏️",
      "🛍️", "🛒", "🎁", "🎈", "🎉", "🎊", "✉️", "📩", "📦", "🏷️", "📜", "📄",
      "📑", "📊", "📈", "📉", "📅", "📆", "🗑️", "📋", "📁", "📂", "📚", "📖",
      "🔖", "📎", "🖇️", "📌", "📍", "✂️", "🖊️", "🖋️", "📝", "✏️", "🔍", "🔎",
      "🔒", "🔓", "🔏", "🔐"
    ],
  },
  {
    id: "symbols",
    name: "Symbols & Flags",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
      "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️",
      "✡️", "☯️", "☦️", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐",
      "♑", "♒", "♓", "🆔", "⚛️", "✴️", "🆚", "🅰️", "🅱️", "🆎", "🅾️", "🆘",
      "❌", "⭕", "🛑", "⛔", "🚫", "💯", "💢", "♨️", "❗️", "❕", "❓", "❔",
      "‼️", "⁉️", "⚠️", "♻️", "✅", "❇️", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧",
      "🚹", "🚺", "🚻", "🈁", "🈂️", "▶️", "⏸️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩",
      "⏪", "⏫", "⏬", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "🔄",
      "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "💲", "™️", "©️", "®️", "🔴",
      "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟥", "🟧", "🟨", "🟩", "🟦",
      "🟪", "⬛", "⬜", "🏁", "🚩", "🎌", "🏴", "🏳️", "🇮🇩", "🇲🇾", "🇸🇬", "🇵🇸",
      "🇯🇵", "🇰🇷", "🇺🇸", "🇬🇧"
    ],
  },
];

const RECENT_KEY = "whatsapp_ui_recent_emojis";

export default function EmojiPicker({ onSelectEmoji, onClose }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("smileys");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load recent emojis on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentEmojis(parsed.slice(0, 36));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save recent emoji when one is selected
  const handleEmojiClick = (emoji: string) => {
    try {
      const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 36);
      setRecentEmojis(updated);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    onSelectEmoji(emoji);
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Filter emojis based on search query
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;

    // Collect all emojis
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    // Since emojis don't have English names embedded in unicode, we search
    // category names or direct match
    const matchedCategories = EMOJI_CATEGORIES.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
    if (matchedCategories.length > 0) {
      return matchedCategories.flatMap((c) => c.emojis);
    }
    // Return all emojis that might match character directly
    return all.filter((e) => e.includes(q));
  }, [search]);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const target = categoryRefs.current[id];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="emoji-picker-container" ref={containerRef} role="dialog" aria-label="Emoji picker">
      {/* Search Header */}
      <div className="emoji-picker-header">
        <div className="emoji-search-inner">
          <span className="emoji-search-icon">
            <SearchIcon size={18} />
          </span>
          <input
            ref={searchInputRef}
            type="text"
            className="emoji-search-input"
            placeholder="Search emoji"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              type="button"
              className="emoji-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Navigation Tabs */}
      <div className="emoji-categories-nav">
        {recentEmojis.length > 0 && (
          <button
            type="button"
            className={`emoji-cat-btn ${activeCategory === "recent" ? "active" : ""}`}
            onClick={() => scrollToCategory("recent")}
            title="Recent"
            aria-label="Recent"
          >
            🕒
          </button>
        )}
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`emoji-cat-btn ${activeCategory === cat.id ? "active" : ""}`}
            onClick={() => scrollToCategory(cat.id)}
            title={cat.name}
            aria-label={cat.name}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      {/* Emoji Scroll Area */}
      <div className="emoji-picker-body">
        {searchResults !== null ? (
          <div className="emoji-category-section">
            <div className="emoji-category-title">
              {searchResults.length > 0 ? "Search results" : "No emojis found"}
            </div>
            <div className="emoji-grid">
              {searchResults.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  className="emoji-btn"
                  onClick={() => handleEmojiClick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {recentEmojis.length > 0 && (
              <div
                className="emoji-category-section"
                ref={(el) => {
                  categoryRefs.current["recent"] = el;
                }}
              >
                <div className="emoji-category-title">Recent</div>
                <div className="emoji-grid">
                  {recentEmojis.map((emoji, index) => (
                    <button
                      key={`recent-${emoji}-${index}`}
                      type="button"
                      className="emoji-btn"
                      onClick={() => handleEmojiClick(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {EMOJI_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className="emoji-category-section"
                ref={(el) => {
                  categoryRefs.current[cat.id] = el;
                }}
              >
                <div className="emoji-category-title">{cat.name}</div>
                <div className="emoji-grid">
                  {cat.emojis.map((emoji, index) => (
                    <button
                      key={`${cat.id}-${emoji}-${index}`}
                      type="button"
                      className="emoji-btn"
                      onClick={() => handleEmojiClick(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
