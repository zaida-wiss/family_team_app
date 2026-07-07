import "./EmojiPickerSv.css";
import { useState } from "react";
import { EMOJIS } from "./emojiData";

type Props = {
  onSelect: (emoji: string) => void;
};

export function EmojiPickerSv({ onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? EMOJIS.filter((e) => {
        const q = query.toLowerCase().trim();
        return (
          e.label.toLowerCase().includes(q) ||
          e.keywords.some((k: string) => k.includes(q) || q.startsWith(k))
        );
      })
    : EMOJIS;

  return (
    <div className="emoji-picker-sv">
      <div className="emoji-picker-sv__search">
        <input
          autoFocus
          placeholder="Sök på svenska..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <button
        className="emoji-picker-sv__clear"
        onClick={() => onSelect("")}
        type="button"
      >
        Ingen ikon
      </button>
      <div className="emoji-picker-sv__grid">
        {filtered.length === 0 ? (
          <p className="emoji-picker-sv__empty">Inga resultat</p>
        ) : (
          filtered.map((e, idx) => (
            <button
              key={`${e.emoji}-${idx}`}
              className="emoji-picker-sv__btn"
              title={e.label}
              type="button"
              onClick={() => onSelect(e.emoji)}
            >
              {e.emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
