import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EmojiPickerSv } from "./EmojiPickerSv";
import "./EmojiPickerPortal.css";

type Props = {
  symbol: string;
  onSelect: (emoji: string) => void;
  triggerClassName?: string;
};

export function EmojiPickerPortal({ symbol, onSelect, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
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
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? "emoji-portal-trigger"}
        onClick={toggle}
      >
        {symbol || "＋"}
      </button>

      {open &&
        createPortal(
          <div
            ref={pickerRef}
            className="emoji-portal-popup"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
          >
            <EmojiPickerSv
              onSelect={(emoji) => {
                onSelect(emoji);
                setOpen(false);
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}
