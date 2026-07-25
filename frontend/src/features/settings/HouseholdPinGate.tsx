import "./HouseholdSecretsSettings.css";
import { useState } from "react";
import { Lock } from "lucide-react";
import type { useHouseholdPin } from "./useHouseholdPin";

type Props = {
  pinState: ReturnType<typeof useHouseholdPin>;
  children: React.ReactNode;
};

// Extra lås för Hushåll-kategorin (2026-07-25, Zaidas önskemål). Delas av
// BÅDA underkategorierna (Lösenord/Abonnemang) — pinState kommer från EN
// enda useHouseholdPin-instans som SettingsContent.tsx äger, så man inte
// behöver ange koden igen bara för att växla mellan dem (bara useHouseholdPin
// själv, som lever på SettingsContent-nivå, avgör upplåst/låst).
export function HouseholdPinGate({ pinState, children }: Props) {
  const { isSet, unlocked, error, setupPin, verifyPin } = pinState;
  const [pinInput, setPinInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isSet === null) {
    return <p className="empty-note">Hämtar…</p>;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  async function submit() {
    if (pinInput.length !== 6) return;
    setSubmitting(true);
    try {
      const ok = isSet ? await verifyPin(pinInput) : await (async () => { await setupPin(pinInput); return true; })();
      if (ok) setPinInput("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="settings-sub household-pin-gate">
      <Lock aria-hidden="true" size={28} />
      <p>
        {isSet
          ? "Ange den 6-siffriga koden för att se hushållets lösenord och abonnemang."
          : "Sätt en 6-siffrig kod som skyddar hushållets lösenord och abonnemang. Alla vuxna i familjen använder samma kod."}
      </p>
      <input
        autoFocus
        className="text-input household-pin-gate__input"
        inputMode="numeric"
        maxLength={6}
        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder="••••••"
        value={pinInput}
      />
      {error && <p className="household-pin-gate__error">{error}</p>}
      <button
        className="primary-button"
        disabled={pinInput.length !== 6 || submitting}
        onClick={() => void submit()}
        type="button"
      >
        {isSet ? "Lås upp" : "Spara kod"}
      </button>
    </div>
  );
}
