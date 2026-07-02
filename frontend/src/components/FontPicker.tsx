import { useEffect, useState } from "react";

export type FontId = "baloo" | "nunito" | "fredoka" | "comfortaa" | "poppins";

export const FONTS: { id: FontId; name: string; display: string; body: string }[] = [
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
