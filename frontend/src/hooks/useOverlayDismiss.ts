import { useRef } from "react";

// Modalens overlay ("bakgrunden") stängde tidigare direkt vid ett vanligt
// onClick={onClose} — men click-eventets TARGET avgörs av var muspekaren
// SLÄPPS, inte var den TRYCKS NER. Om man t.ex. markerar text inuti
// modalens innehåll och råkar dra pekaren utanför innan man släpper,
// registreras klicket som ett klick på overlayn (inte på innehållet), och
// modalen stängdes oavsiktligt mitt i en textmarkering (2026-08-06, Zaidas
// önskemål: "modalen skall inte heller försvinna om man råkar dra fingret
// utanför"). Denna hook kräver istället att BÅDE nedtryck OCH släpp skedde
// direkt på overlayn själv (currentTarget) — ett drag som startar inuti
// innehållet (även om det slutar på overlayn) stänger då aldrig modalen.
export function useOverlayDismiss(onDismiss: () => void) {
  const downOnOverlay = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      downOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (downOnOverlay.current && e.target === e.currentTarget) {
        onDismiss();
      }
      downOnOverlay.current = false;
    }
  };
}
