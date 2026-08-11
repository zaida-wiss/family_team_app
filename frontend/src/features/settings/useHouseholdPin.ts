import { useEffect, useRef, useState } from "react";
import { householdPinApi } from "../../api";

const UNLOCK_DURATION_MS = 15 * 60 * 1000;

// Extra lås för Hushåll-kategorin (2026-07-25, Zaidas önskemål: "en extra
// säkerhet... 6 siffrig kod... inloggad i 15 minuter eller tills jag byter
// vy"). Upplåst-state hålls ENDAST i minnet (ingen persistens) — en
// sidomladdning låser alltid om, matchar "extra säkerhet"-syftet. En
// 15-minuters timer låser om automatiskt om man stannar kvar i Hushåll
// länge; att lämna kategorin (SettingsContent.tsx:s openCategory/
// backToCategories-wrappers runt useSettingsNavSync.ts) låser om direkt,
// vilket kommer FÖRST om det inträffar innan de 15 minuterna gått.
export function useHouseholdPin() {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    householdPinApi.getStatus().then((res) => setIsSet(res.isSet)).catch(() => setIsSet(false));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function lock() {
    setUnlocked(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  async function setupPin(pin: string) {
    setError(null);
    try {
      await householdPinApi.set(pin);
      setIsSet(true);
      unlock();
    } catch {
      setError("Kunde inte spara koden — försök igen.");
    }
  }

  function unlock() {
    setUnlocked(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, UNLOCK_DURATION_MS);
  }

  async function verifyPin(pin: string) {
    setError(null);
    try {
      const res = await householdPinApi.verify(pin);
      if (res.ok) {
        unlock();
      } else {
        setError("Fel kod — försök igen.");
      }
      return res.ok;
    } catch {
      setError("Kunde inte kontrollera koden — försök igen.");
      return false;
    }
  }

  return { isSet, unlocked, error, setupPin, verifyPin, lock };
}
