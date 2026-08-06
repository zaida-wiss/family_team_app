import { useEffect, useState } from "react";
import { birthdaysApi } from "../../api";
import type { Birthday, Id } from "@shared/types";

type BirthdayInput = {
  name: string;
  month: number;
  day: number;
  year: number | null;
};

// Födelsedagslista (2026-08-06) — samma självförsörjande, cache-fria mönster
// som useHouseholdSecretsState.ts (fetched färskt varje gång panelen öppnas,
// SettingsCategoryNav.tsx mountar redan om underkategorins innehåll varje
// gång — ingen separat cache-invalidering behövs).
export function useBirthdaysState() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    birthdaysApi.getAll().then(setBirthdays).catch(console.error).finally(() => setLoading(false));
  }, []);

  function createBirthday(input: BirthdayInput) {
    return birthdaysApi.create(input).then((entry) => {
      setBirthdays((current) => [...current, entry]);
      return entry;
    });
  }

  function updateBirthday(id: Id, input: BirthdayInput) {
    return birthdaysApi.update(id, input).then(() => {
      setBirthdays((current) => current.map((b) => (b.id === id ? { ...b, ...input } : b)));
    });
  }

  function removeBirthday(id: Id) {
    birthdaysApi.remove(id).catch(console.error);
    setBirthdays((current) => current.filter((b) => b.id !== id));
  }

  return { birthdays, loading, createBirthday, updateBirthday, removeBirthday };
}
