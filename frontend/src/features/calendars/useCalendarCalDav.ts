import type { Dispatch, SetStateAction } from "react";
import { calendarsApi } from "../../api";
import type { Calendar, Id } from "@shared/types";

// ADR-0027 (2026-07-24) — samma "egen hook, delar setCalendars" mönster som
// useCalendarSubscriptions.ts, men för den nya tvåvägs CalDAV-anslutningen.
export function useCalendarCalDav(setCalendars: Dispatch<SetStateAction<Calendar[]>>) {
  // Kalenderväljaren (2026-07-30) — bara ett uppslag mot Apple, sparar/
  // ansluter ingenting. Anropas innan connectApple, med samma inloggning.
  async function listApple(accountEmail: string, appSpecificPassword: string) {
    return calendarsApi.listAppleCalendars(accountEmail, appSpecificPassword);
  }

  async function connectApple(calendarId: Id, accountEmail: string, appSpecificPassword: string, calendarUrl: string) {
    const created = await calendarsApi.connectAppleCalDav(calendarId, accountEmail, appSpecificPassword, calendarUrl);
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

  return { listApple, connectApple, disconnect, updateInterval, syncNow };
}
