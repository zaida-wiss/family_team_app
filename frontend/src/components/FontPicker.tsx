import { useEffect, useRef, useState } from "react";

export type FontId = "baloo" | "nunito" | "fredoka" | "comfortaa" | "poppins";

export const FONTS: { id: FontId; name: string; display: string; body: string }[] = [
  { id: "baloo",     name: "Baloo",     display: "Baloo 2",          body: "Plus Jakarta Sans" },
  { id: "nunito",    name: "Nunito",    display: "Nunito",           body: "Nunito" },
  { id: "fredoka",   name: "Fredoka",   display: "Fredoka",          body: "DM Sans" },
  { id: "comfortaa", name: "Comfortaa", display: "Comfortaa",        body: "Outfit" },
  { id: "poppins",   name: "Poppins",   display: "Poppins",          body: "Poppins" },
];

// Google Fonts-frågesträngar — måste matcha FONTS-objektet i public/font-init.js exakt.
const GOOGLE_FONTS_QUERY: Record<FontId, string> = {
  baloo: "Baloo+2:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700",
  nunito: "Nunito:wght@400;500;600;700;800",
  fredoka: "DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Fredoka:wght@400;500;600;700",
  comfortaa: "Comfortaa:wght@400;500;600;700&family=Outfit:wght@400;500;600;700",
  poppins: "Poppins:wght@400;500;600;700;800",
};

const STORAGE_KEY = "app-font";

// public/font-init.js laddar redan det sparade typsnittets Google Fonts-stylesheet vid
// sidladdning (för snabb första målning, innan React ens hunnit montera). Men om barnet/
// föräldern byter typsnitt i väljaren MEDAN appen körs har det nya typsnittets teckensnittsfil
// aldrig hämtats — CSS-variabeln pekar på ett typsnitt webbläsaren inte känner till och faller
// tyst tillbaka till systemtypsnittet, så bytet syns inte förrän sidan laddas om. Ladda därför
// stylesheeten dynamiskt här också, varje gång typsnittet faktiskt ändras (inte vid första
// mount — då har font-init.js redan gjort det).
function loadGoogleFont(id: FontId) {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = `https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS_QUERY[id]}&display=swap`;
  link.crossOrigin = "";
  link.onload = () => {
    link.rel = "stylesheet";
    link.onload = null;
  };
  document.head.appendChild(link);
}

function applyFontClass(id: FontId) {
  const el = document.documentElement;
  FONTS.forEach((f) => el.classList.remove(`font-${f.id}`));
  el.classList.add(`font-${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}

export function useAppFont() {
  const [fontId, setFontId] = useState<FontId>(() => {
    return (localStorage.getItem(STORAGE_KEY) as FontId | null) ?? "baloo";
  });
  const isFirstRun = useRef(true);

  useEffect(() => {
    applyFontClass(fontId);

    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    loadGoogleFont(fontId);
  }, [fontId]);

  return { fontId, setFontId };
}
