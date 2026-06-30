import { useState } from "react";
import styles from "./CalendarPanel.module.css";

type Props = {
  words: string[];
  onChangeWords: (words: string[]) => void;
  placeholder?: string;
  label?: string;
};

export function WordTagInput({ words, onChangeWords, placeholder, label }: Props) {
  const [draft, setDraft] = useState("");

  function commit() {
    const word = draft.trim().replace(/,+$/, "");
    if (word.length > 0 && !words.includes(word)) onChangeWords([...words, word]);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
    else if (e.key === "Backspace" && !draft && words.length > 0) {
      onChangeWords(words.slice(0, -1));
    }
  }

  return (
    <div className={styles.tagFieldWrap}>
      {label && <span className={styles.tagLabel}>{label}</span>}
      <div className={styles.tagInput}>
        {words.map((w) => (
          <span key={w} className={styles.tag}>
            {w}
            <button
              className={styles.tagRemove}
              onClick={() => onChangeWords(words.filter((x) => x !== w))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className={styles.tagDraft}
          onBlur={commit}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={words.length === 0 ? placeholder : ""}
          value={draft}
        />
      </div>
    </div>
  );
}
