import { useEffect, useState } from "react";
import { householdSecretsApi } from "../../api";
import type { HouseholdSecretEntry } from "../../api/householdSecrets";
import type { HouseholdSecretKind, Id } from "@shared/types";

type SecretInput = {
  kind: HouseholdSecretKind;
  title: string;
  username: string | null;
  secret: string;
  notes: string | null;
  cost: number | null;
  renewalDate: string | null;
};

// Hushållets lösenord + abonnemang (2026-07-25) — MEDVETET INGEN
// localStorage-cache (till skillnad från useRecipesState.ts/andra hooks i
// appen) — dessa värden är dekrypterade lösenord/känslig info, och att
// låta dem ligga kvar i localStorage på en delad familjeenhet (utsatt för
// XSS, ingen egen utgångstid) är en annan riskklass än todos/recept.
// Hämtas färskt varje gång panelen öppnas istället.
export function useHouseholdSecretsState() {
  const [secrets, setSecrets] = useState<HouseholdSecretEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    householdSecretsApi.getAll().then(setSecrets).catch(console.error).finally(() => setLoading(false));
  }, []);

  function createSecret(input: SecretInput) {
    return householdSecretsApi.create(input).then((entry) => {
      setSecrets((current) => [...current, entry]);
      return entry;
    });
  }

  function updateSecret(id: Id, input: SecretInput) {
    return householdSecretsApi.update(id, input).then(() => {
      setSecrets((current) => current.map((s) => (s.id === id ? { ...s, ...input } : s)));
    });
  }

  function removeSecret(id: Id) {
    householdSecretsApi.remove(id).catch(console.error);
    setSecrets((current) => current.filter((s) => s.id !== id));
  }

  return { secrets, loading, createSecret, updateSecret, removeSecret };
}
