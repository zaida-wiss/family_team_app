export const SEDLAR = [1000, 500, 200, 100, 50, 20];
export const MYNT = [10, 5, 2, 1];
export const ALL_DENOMS = [...SEDLAR, ...MYNT];

// { 100: 2, 20: 1 } -> [100, 100, 20] — en lista av enskilda valörer, en post per sedel/mynt
export function flattenCounts(counts: Record<number, number>): number[] {
  return Object.entries(counts).flatMap(([denom, count]) => Array(count).fill(Number(denom)));
}

// s: lista av [målvalör, antal] — vilka sedlar/mynt man får tillbaka vid växling
export const DENOM_RULES: Partial<Record<number, { s?: Array<[number, number]> }>> = {
  1000: { s: [[500,  2]]          },
  500:  { s: [[100,  5]]          },
  200:  { s: [[100,  2]]          },
  100:  { s: [[20,   5]]          },
  50:   { s: [[10,   5]]          },
  20:   { s: [[10,   2]]          },
  10:   { s: [[5,    2]]          },
  5:    { s: [[2, 2], [1, 1]]     },
  2:    { s: [[1,    2]]          },
};

export function denomCounts(kr: number): Record<number, number> {
  const result: Record<number, number> = {};
  let rem = Math.floor(kr);
  for (const v of ALL_DENOMS) {
    const n = Math.floor(rem / v);
    if (n > 0) { result[v] = n; rem -= n * v; }
  }
  return result;
}

// Stämmer av en cachad sedel/mynt-fördelning mot det sanna saldot (approvedStars -
// spentStars). Om det sanna saldot är högre (fler stjärnor godkända sen sist) läggs
// mellanskillnaden till som nya sedlar/mynt. Om det är lägre (t.ex. spenderat i shopen)
// byggs fördelningen om från grunden — den gamla, för höga uppdelningen litar man inte på.
// Delad mellan plånboken (ChildBanknotesModal) och shopen (useShopWalletDrag) så de två
// vyerna aldrig kan visa olika belopp för samma barn.
export function reconcileCounts(
  stored: { counts: Record<number, number>; savedTotal: number } | null,
  totalKronor: number
): Record<number, number> {
  if (!stored) return denomCounts(totalKronor);
  const storedSum = Object.entries(stored.counts).reduce((s, [k, n]) => s + Number(k) * n, 0);
  if (storedSum === totalKronor) return stored.counts;
  if (totalKronor > storedSum) {
    const delta = denomCounts(totalKronor - storedSum);
    const merged = { ...stored.counts };
    for (const [d, n] of Object.entries(delta)) merged[Number(d)] = (merged[Number(d)] ?? 0) + n;
    return merged;
  }
  return denomCounts(totalKronor);
}

export function countsDiffer(a: Record<number, number>, b: Record<number, number>): boolean {
  const ka = Object.keys(a).sort().join(",");
  const kb = Object.keys(b).sort().join(",");
  if (ka !== kb) return true;
  return Object.keys(a).some((k) => a[+k] !== b[+k]);
}

export function applySplit(value: number, prev: Record<number, number>): Record<number, number> {
  const rule = DENOM_RULES[value];
  if (!rule?.s || (prev[value] ?? 0) < 1) return prev;
  const next = { ...prev };
  next[value] = (next[value] ?? 0) - 1;
  if (next[value] <= 0) delete next[value];
  for (const [target, qty] of rule.s) {
    next[target] = (next[target] ?? 0) + qty;
  }
  return next;
}

// Avgör vilka av de nedlagda sedlarna/mynten som faktiskt behövdes för att nå priset,
// och vilka som blev över. De överblivna sedlarna/mynten returneras oförändrade — samma
// fysiska valör man la dit. Ingen automatisk växling: om enda sättet att nå priset är en
// enskild sedel som själv är större än priset (t.ex. en 100:a för en 20-krones-vara)
// räknas den som nödvändig och konsumeras hel, precis som idag — vill barnet ha exakt
// betalning får de själva växla sedeln i plånboken innan de handlar (manuell växling).
export function splitPayment(
  cardCounts: Record<number, number>,
  cost: number
): { excessCounts: Record<number, number> } {
  const bills: number[] = [];
  for (const [denomStr, count] of Object.entries(cardCounts)) {
    const denom = Number(denomStr);
    for (let i = 0; i < count; i++) bills.push(denom);
  }
  bills.sort((a, b) => a - b);

  let sum = 0;
  const excess: number[] = [];
  for (const bill of bills) {
    if (sum >= cost) {
      excess.push(bill);
    } else {
      sum += bill;
    }
  }

  const excessCounts: Record<number, number> = {};
  for (const v of excess) excessCounts[v] = (excessCounts[v] ?? 0) + 1;
  return { excessCounts };
}

export function applyZoneConvert(
  prev: Record<number, number>,
  remove: Record<number, number>,
  total: number,
): Record<number, number> {
  const next = { ...prev };
  for (const [k, n] of Object.entries(remove)) {
    next[+k] = (next[+k] ?? 0) - n;
    if ((next[+k] ?? 0) <= 0) delete next[+k];
  }
  let rem = total;
  for (const v of ALL_DENOMS) {
    const n = Math.floor(rem / v);
    if (n > 0) { next[v] = (next[v] ?? 0) + n; rem -= n * v; }
  }
  return next;
}
