import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Delad tillgänglighetslogik för modaler/dialoger (WCAG 2.1.2 Ingen
// tangentbordsfälla, 4.1.2 Namn/roll/värde): Escape stänger, Tab/Shift+Tab
// hålls kvar inom dialogen, och fokus flyttas in vid öppning och tillbaka till
// det som öppnade dialogen vid stängning. Samma mönster som useHoldToConfirm —
// en gång, återanvänd i alla modaler istället för duplicerad logik per fil.
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T>(null);
  // Fångas under render-fasen (inte i useEffect) — annars hinner dialogens
  // eget autoFocus-fält redan ta fokus innan effekten körs, och triggerRef
  // pekar felaktigt in i dialogen istället för på det som öppnade den.
  const triggerRef = useRef<Element | null>(document.activeElement);
  // onClose i en ref (2026-08-07, Zaidas fynd: "kategori-dropdownen stänger
  // sig nästan direkt efter att jag öppnat den") — de flesta anropare
  // (t.ex. TodoEditModal.tsx:s handleClose) skickar in en NY funktion vid
  // varje render, inte en useCallback-memoiserad referens. Utan denna ref
  // låg effekten nedan i [onClose]-beroendelistan och körde om VARJE gång
  // modalen renderade om av EN HELT ANNAN anledning (en prop som todos/
  // members uppdaterades via SSE, en tickande klocka i en förälderkomponent,
  // m.m.) — cleanup:en flyttade då fokus UT ur dialogen och setup-koden
  // flyttade det tillbaka IN igen, en synlig fokus-studs som tvingar
  // webbläsaren att stänga en öppen nativ <select>-dropdown (samma
  // blur-stänger-dropdown-beteende i alla större webbläsare). Effekten körs
  // nu bara EN gång per montering/avmontering, oavsett hur många gånger
  // onClose-referensen byts ut.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    // Respektera ett fält som redan har autoFocus (t.ex. titelinput) —
    // flytta bara in fokus manuellt om inget i dialogen redan har det.
    if (!container?.contains(document.activeElement)) {
      const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable?.[0] ?? container)?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const items = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
