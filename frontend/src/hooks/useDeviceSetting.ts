import { useState } from "react";
import { clearDeviceSetting, getDeviceSetting, setDeviceSetting } from "../utils/deviceSettings";

/**
 * En enhetsspecifik inställning (2026-08-10) — override sparas bara i
 * localStorage på DEN HÄR enheten, aldrig synkad till kontot. `accountDefault`
 * (t.ex. Member.textSize) används bara som startvärde tills en override sätts
 * — en helt ny enhet ser alltså det senast kända kontovärdet tills man
 * faktiskt ändrar något lokalt, precis som idag.
 */
export function useDeviceSetting<T>(key: string, accountDefault: T) {
  const [override, setOverrideState] = useState<T | null>(() => getDeviceSetting<T>(key));

  function setOverride(next: T) {
    setDeviceSetting(key, next);
    setOverrideState(next);
  }

  function clearOverride() {
    clearDeviceSetting(key);
    setOverrideState(null);
  }

  return {
    value: override ?? accountDefault,
    hasOverride: override !== null,
    setOverride,
    clearOverride
  };
}
