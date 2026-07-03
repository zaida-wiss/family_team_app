import { useEffect, useRef, useState } from "react";
import type { RewardShopItem } from "@shared/types";
import { flattenCounts, splitPayment } from "../children/bankDenoms";
import type { useShopWalletDrag } from "./useShopWalletDrag";
import type { ReturningBillData } from "./ReturningBill";

const RETURN_TRAVEL_MS = 1300;
const FLASH_MS = 650;

// Triggar köpet automatiskt så fort tillräckligt är draget till ett kort, och sveper
// eventuella onödiga sedlar/mynt (splitPayment) synligt tillbaka till plånboken istället
// för att bara tyst konsumera dem.
export function useAutoPurchase(
  items: RewardShopItem[],
  drag: ReturnType<typeof useShopWalletDrag>,
  walletStripRef: React.RefObject<HTMLDivElement | null>,
  onPurchase: (item: RewardShopItem) => void
) {
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [returningBills, setReturningBills] = useState<ReturningBillData[]>([]);
  const purchasingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const item of items) {
      const cardCounts = drag.pendingPayments[item.id] ?? {};
      const paid = drag.getCardTotal(item.id);
      if (paid >= item.starCost && paid > 0 && !purchasingRef.current.has(item.id)) {
        purchasingRef.current.add(item.id);
        setFlashingId(item.id);
        // Vilka av de nedlagda sedlarna/mynten som faktiskt inte behövdes för priset —
        // de ska svepa tillbaka till plånboken, synliga, inte bara försvinna.
        const { excessCounts } = splitPayment(cardCounts, item.starCost);

        setTimeout(() => {
          onPurchase(item);
          setFlashingId(null);
          purchasingRef.current.delete(item.id);

          const cardEl = document.querySelector(`[data-item-id="${item.id}"]`);
          const fromRect = cardEl?.getBoundingClientRect();
          const toRect = walletStripRef.current?.getBoundingClientRect();

          if (Object.keys(excessCounts).length > 0 && fromRect && toRect) {
            drag.removeExcessFromCard(item.id, excessCounts);
            drag.commitPurchase(item.id);
            const travelIds = flattenCounts(excessCounts).map((denom, i) => ({
              id: `${item.id}-${denom}-${i}-${Date.now()}`,
              denom,
              fromRect,
              toRect,
            }));
            setReturningBills((prev) => [...prev, ...travelIds]);
            setTimeout(() => {
              drag.depositToWallet(excessCounts);
              setReturningBills((prev) => prev.filter((b) => !travelIds.some((t) => t.id === b.id)));
            }, RETURN_TRAVEL_MS);
          } else {
            drag.commitPurchase(item.id);
          }
        }, FLASH_MS);
      }
    }
  });

  // setFlashingId exponeras separat — gratis (0 kr) belöningar bekräftas via
  // hold-to-confirm i RewardShopModal, inte via den här hookens auto-köp-effekt,
  // men återanvänder samma flash-animation.
  return { flashingId, setFlashingId, returningBills };
}
