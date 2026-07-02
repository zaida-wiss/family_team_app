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
        onClose();
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
  }, [onClose]);

  return containerRef;
}
