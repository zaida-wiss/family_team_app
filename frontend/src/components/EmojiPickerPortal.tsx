import { lazy, Suspense, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./EmojiPickerPortal.css";

const EmojiPickerSv = lazy(() =>
  import("./EmojiPickerSv").then((m) => ({ default: m.EmojiPickerSv }))
);

// Projektets tsconfig-lib (ES2020) saknar Intl.Segmenter-typerna trots att
// metoden finns i alla moderna körtidsmiljöer — smal, lokal typning istället
// för att höja hela projektets lib-mål för en enda funktion.
type GraphemeSegmenter = new (
  locale: string,
  options: { granularity: "grapheme" }
) => { segment: (text: string) => Iterable<{ segment: string }> };

// Intl.Segmenter räknar hela emoji-sekvenser (ZWJ/hudton-modifierare) som ETT
// tecken — en enkel Array.from/[...text] klipper isär dem i flera trasiga kodpunkter.
function firstGrapheme(text: string): string {
  const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter;
  if (Segmenter) {
    const segments = new Segmenter("sv", { granularity: "grapheme" }).segment(text);
    const first = segments[Symbol.iterator]().next();
    return first.done ? "" : first.value.segment;
  }
  return [...text][0] ?? "";
}

type Props = {
  symbol: string;
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
};

export function EmojiPickerPortal({ symbol, onSelect, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        pickerRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  }

  return (
    <>
      <input
        ref={triggerRef}
        type="text"
        className={triggerClassName ?? "emoji-portal-trigger"}
        aria-label="Välj emoji"
        value={symbol}
        placeholder="＋"
        onClick={toggle}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        onPaste={(e) => {
          const pasted = firstGrapheme(e.clipboardData.getData("text"));
          e.preventDefault();
          if (pasted) onSelect(pasted);
        }}
        onChange={(e) => onSelect(firstGrapheme(e.target.value))}
        style={{
          textAlign: "center",
          fontFamily: "inherit",
          appearance: "none",
          WebkitAppearance: "none",
        }}
      />

      {open &&
        createPortal(
          <div
            ref={pickerRef}
            className="emoji-portal-popup"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
          >
            <Suspense fallback={<div className="emoji-portal-loading">Laddar…</div>}>
              <EmojiPickerSv
                onSelect={(emoji) => {
                  onSelect(emoji);
                  setOpen(false);
                }}
              />
            </Suspense>
          </div>,
          document.body
        )}
    </>
  );
}
