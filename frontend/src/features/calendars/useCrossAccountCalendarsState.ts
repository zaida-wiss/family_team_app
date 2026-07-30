import { useCallback, useEffect, useState } from "react";
import { calendarsApi } from "../../api";
import type { CrossAccountCalendar } from "@shared/types";

// "Mina familjekonton" (2026-07-30, Zaidas önskemål: "alla privata
// kalendrar som jag skapat skall jag kunna dela med samtliga familjer jag
// är medlem i") — samma "egen, riktig medlemsstatus i flera konton"-princip
// som useCrossAccountFamilyState.ts (todos), bara för kalendrar. Läsbart
// bara (Zaidas val: "bara jag själv" ser kalendern, ingen redigering
// cross-account).
export function useCrossAccountCalendars() {
  const [threads, setThreads] = useState<CrossAccountCalendar[]>([]);

  const refresh = useCallback(() => {
    calendarsApi.getCrossAccount().then(setThreads).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { crossAccountCalendars: threads, refreshCrossAccountCalendars: refresh };
}
