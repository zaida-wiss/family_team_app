import "./ReturningBill.css";
import { useEffect, useState } from "react";
import { MYNT } from "../children/bankDenoms";

export type ReturningBillData = {
  id: string;
  denom: number;
  fromRect: DOMRect;
  toRect: DOMRect;
};

function centerOf(rect: DOMRect) {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 };
}

// En enskild sedel/mynt som sveper långsamt från belöningskortet tillbaka till
// plånboken när barnet betalat för mycket — så det hinner uppfattas vilka pengar
// som blev över, inte bara att plånbokssaldot plötsligt ändras.
export function ReturningBill({ denom, fromRect, toRect }: ReturningBillData) {
  const [pos, setPos] = useState(() => centerOf(fromRect));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPos(centerOf(toRect)));
    return () => cancelAnimationFrame(frame);
  }, [toRect]);

  return (
    <div className="returning-bill" style={{ left: pos.left, top: pos.top }} aria-hidden="true">
      {MYNT.includes(denom) ? (
        <div className="shop-coin-clip" data-coin={denom}>
          <img src={`/pengar/mynt-${denom}.webp`} alt="" className="shop-coin-img" />
        </div>
      ) : (
        <img src={`/pengar/sedel-${denom}.webp`} alt="" className="shop-note-img" data-note={denom} />
      )}
    </div>
  );
}
