import { useState, type Dispatch, type SetStateAction } from "react";
import { calendarsApi } from "../../api";
import type { AppleCalDavAccountSummary } from "../../api/calendars";
import type { Calendar, Id } from "@shared/types";

// ADR-0027 (2026-07-24, uppdaterad 2026-07-30) — samma "egen hook, delar
// setCalendars"-mönster som useCalendarSubscriptions.ts, men för den nya
// tvåvägs CalDAV-anslutningen. Apple-inloggningen ligger sedan 2026-07-30 på
// KONTONIVÅ (appleAccounts nedan) — en enskild BMAD-kalender (connectApple)
// väljer bara VILKET redan tillagt konto + VILKEN av dess Apple-kalendrar
// den ska kopplas till, skriver aldrig in e-post/lösenord själv.
export function useCalendarCalDav(setCalendars: Dispatch<SetStateAction<Calendar[]>>) {
  const [appleAccounts, setAppleAccounts] = useState<AppleCalDavAccountSummary[]>([]);

  async function refreshAppleAccounts() {
    const accounts = await calendarsApi.listAppleAccounts();
    setAppleAccounts(accounts);
    return accounts;
  }

  async function addAppleAccount(accountEmail: string, appSpecificPassword: string) {
    const created = await calendarsApi.addAppleAccount(accountEmail, appSpecificPassword);
    setAppleAccounts((current) => [...current, created]);
    return created;
  }

  async function removeAppleAccount(appleAccountId: Id) {
    await calendarsApi.removeAppleAccount(appleAccountId);
    setAppleAccounts((current) => current.filter((a) => a.id !== appleAccountId));
    // Ett borttaget konto kopplar automatiskt bort alla kalendrar som
    // använde det (backend, appleCalDavService.ts:s removeAppleAccount) —
    // hämta om kalenderlistan så UI:t speglar det direkt.
    const updated = await calendarsApi.getAll();
    setCalendars(updated);
  }

  // Listar kalendrarna på ett REDAN tillagt Apple-konto — ingen ny
  // inloggning behövs, de lagrade creds:en återanvänds server-side.
  async function listCalendarsForAccount(appleAccountId: Id) {
    return calendarsApi.listCalendarsForAppleAccount(appleAccountId);
  }

  async function connectApple(calendarId: Id, appleAccountId: Id, calendarUrl: string) {
    const created = await calendarsApi.connectAppleCalDav(calendarId, appleAccountId, calendarUrl);
    setCalendars((current) =>
      current.map((cal) =>
        cal.id !== calendarId ? cal : { ...cal, calDavConnections: [...(cal.calDavConnections ?? []), created] }
      )
    );
  }

  async function disconnect(calendarId: Id, connectionId: Id) {
    await calendarsApi.disconnectCalDav(calendarId, connectionId);
    setCalendars((current) =>
      current.map((cal) =>
        cal.id !== calendarId
          ? cal
          : { ...cal, calDavConnections: (cal.calDavConnections ?? []).filter((c) => c.id !== connectionId) }
      )
    );
  }

  async function updateInterval(calendarId: Id, connectionId: Id, syncIntervalMinutes: number) {
    setCalendars((current) =>
      current.map((cal) =>
        cal.id !== calendarId
          ? cal
          : {
              ...cal,
              calDavConnections: (cal.calDavConnections ?? []).map((c) =>
                c.id !== connectionId ? c : { ...c, syncIntervalMinutes }
              )
            }
      )
    );
    await calendarsApi.updateCalDavInterval(calendarId, connectionId, syncIntervalMinutes);
  }

  async function syncNow(calendarId: Id, connectionId: Id) {
    await calendarsApi.syncCalDav(calendarId, connectionId);
    const updated = await calendarsApi.getAll();
    setCalendars(updated);
  }

  return {
    appleAccounts,
    refreshAppleAccounts,
    addAppleAccount,
    removeAppleAccount,
    listCalendarsForAccount,
    connectApple,
    disconnect,
    updateInterval,
    syncNow
  };
}
