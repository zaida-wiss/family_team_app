import { createPortal } from "react-dom";
import { useState } from "react";
import { MYNT } from "./bankDenoms";
import { useBankDragZone } from "./useBankDragZone";
import { BankWallet } from "./BankWallet";
import { BankDropZones } from "./BankDropZones";
import { BankWishZone } from "./BankWishZone";
import type { Id } from "@shared/types";

type Props = {
  counts: Record<number, number>;
  onSplit: (v: number) => void;
  onZoneConvert: (remove: Record<number, number>, total: number) => void;
  isEmpty: boolean;
  onOpenBank: () => void;
  childId: Id;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
};

export function BankBreakdown({ counts, onSplit, onZoneConvert, isEmpty, onOpenBank, childId, onCreateWish }: Props) {
  const zone = useBankDragZone(counts, onSplit, onZoneConvert);
  const [mode, setMode] = useState<"drag" | "click">("drag");

  return (
    <>
      {isEmpty ? (
        <p className="bm-empty">Tjäna fler stjärnor — varje stjärna är 1 kr! ⭐</p>
      ) : (
        <>
          <div className="bm-mode-toggle" role="group" aria-label="Välj interaktionssätt">
            <button
              type="button"
              className={`bm-mode-btn${mode === "drag" ? " bm-mode-active" : ""}`}
              onClick={() => setMode("drag")}
              aria-pressed={mode === "drag"}
            >
              Dra
            </button>
            <button
              type="button"
              className={`bm-mode-btn${mode === "click" ? " bm-mode-active" : ""}`}
              onClick={() => setMode("click")}
              aria-pressed={mode === "click"}
            >
              Klicka
            </button>
          </div>
          <div className="bm-exchange-layout">
            <BankWallet {...zone} mode={mode} />
            <BankDropZones {...zone} />
          </div>
        </>
      )}

      <BankWishZone
        wishRef={zone.wishRef}
        wishCounts={zone.wishCounts}
        wishTotal={zone.wishTotal}
        wishActive={zone.wishActive}
        clearWish={zone.clearWish}
        childId={childId}
        onCreateWish={onCreateWish}
      />

      <button className="bm-bank-btn" type="button" onClick={onOpenBank}>🏦 Banken</button>

      {zone.dragging !== null && createPortal(
        <div ref={zone.ghostRef} className="bm-ghost">
          {MYNT.includes(zone.dragging) ? (
            <div className="bm-coin-clip" data-coin={zone.dragging}>
              <img src={`/pengar/mynt-${zone.dragging}.webp`} alt="" className="bm-coin-img" />
            </div>
          ) : (
            <img src={`/pengar/sedel-${zone.dragging}.webp`} alt="" className="bm-note-img" data-note={zone.dragging} draggable={false} />
          )}
        </div>,
        document.body
      )}
    </>
  );
}
