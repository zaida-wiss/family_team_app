import { useEffect, useRef, useState } from "react";
import { Palette, X } from "lucide-react";
import "./FontPicker.css";

export type FontId = "baloo" | "nunito" | "fredoka" | "comfortaa" | "poppins";

const FONTS: { id: FontId; name: string; display: string; body: string }[] = [
  { id: "baloo",     name: "Baloo",     display: "Baloo 2",          body: "Plus Jakarta Sans" },
  { id: "nunito",    name: "Nunito",    display: "Nunito",           body: "Nunito" },
  { id: "fredoka",   name: "Fredoka",   display: "Fredoka",          body: "DM Sans" },
  { id: "comfortaa", name: "Comfortaa", display: "Comfortaa",        body: "Outfit" },
  { id: "poppins",   name: "Poppins",   display: "Poppins",          body: "Poppins" },
];

const STORAGE_KEY = "app-font";

function applyFont(id: FontId) {
  const el = document.documentElement;
  FONTS.forEach((f) => el.classList.remove(`font-${f.id}`));
  el.classList.add(`font-${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}

export function useAppFont() {
  const [fontId, setFontId] = useState<FontId>(() => {
    return (localStorage.getItem(STORAGE_KEY) as FontId | null) ?? "baloo";
  });

  useEffect(() => {
    applyFont(fontId);
  }, [fontId]);

  return { fontId, setFontId };
}

type Props = {
  fontId: FontId;
  onSelect: (id: FontId) => void;
};

export function FontPicker({ fontId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function select(id: FontId) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div className="font-picker-root" ref={panelRef}>
      {open && (
        <div className="font-picker-panel" role="dialog" aria-label="Välj typsnitt">
          <div className="font-picker-head">
            <span>Typsnitt</span>
            <button className="font-picker-close" onClick={() => setOpen(false)} aria-label="Stäng">
              <X size={14} />
            </button>
          </div>
          <div className="font-picker-grid">
            {FONTS.map((f) => (
              <button
                key={f.id}
                className={`font-picker-option font-${f.id}${fontId === f.id ? " font-picker-option--active" : ""}`}
                onClick={() => select(f.id)}
                type="button"
                title={`${f.display} + ${f.body}`}
              >
                <span className="font-picker-preview">Aa</span>
                <span className="font-picker-label">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        className="font-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Byt typsnitt"
        title="Byt typsnitt"
        type="button"
      >
        <Palette size={20} />
      </button>
    </div>
  );
}
