import type { Dispatch, SetStateAction } from "react";
import { calendarsApi } from "../../api";
import type { Calendar, Id, IcsSubscription } from "@shared/types";

// Utbruten ur useCalendarsState.ts (452 rader, Sprint 3 S7) — prenumerations-
// hanteringen (ICS-abonnemang) är ett eget ansvarsområde, skilt från kalender-/
// händelse-CRUD och delning. Tar emot samma setCalendars som useCalendarsState
// äger, så bägge hookarna fortsätter mutera exakt samma state.
export function useCalendarSubscriptions(setCalendars: Dispatch<SetStateAction<Calendar[]>>) {
  function addSubscription(calendarId: Id, sub: Omit<IcsSubscription, "id" | "calendarId" | "lastSyncedAt">) {
    calendarsApi.createSubscription(calendarId, sub).then((created) => {
      setCalendars((current) =>
        current.map((cal) =>
          cal.id !== calendarId ? cal : { ...cal, subscriptions: [...cal.subscriptions, created] }
        )
      );
    }).catch(console.error);
  }

  async function updateSubscription(
    calendarId: Id,
    subId: Id,
    patch: Partial<Pick<IcsSubscription, "includeWords" | "excludeWords" | "dateFrom" | "dateTo" | "displaySymbol">>
  ) {
    setCalendars((current) =>
      current.map((cal) =>
        cal.id !== calendarId ? cal : {
          ...cal,
          subscriptions: cal.subscriptions.map((s) => s.id !== subId ? s : { ...s, ...patch })
        }
      )
    );
    await calendarsApi.updateSubscription(calendarId, subId, patch);
  }

  function removeSubscription(calendarId: Id, subId: Id) {
    calendarsApi.deleteSubscription(calendarId, subId).catch(console.error);
    const deletedAt = new Date().toISOString();
    setCalendars((current) =>
      current.map((cal) => {
        if (cal.id !== calendarId) return cal;
        return {
          ...cal,
          subscriptions: cal.subscriptions.filter((s) => s.id !== subId),
          events: cal.events.map((ev) =>
            ev.subscriptionId === subId && !ev.deletedAt ? { ...ev, deletedAt } : ev
          )
        };
      })
    );
  }

  async function syncSubscription(calendarId: Id, subId: Id) {
    await calendarsApi.syncSubscription(calendarId, subId);
    const updated = await calendarsApi.getAll();
    setCalendars(updated);
  }

  return { addSubscription, updateSubscription, removeSubscription, syncSubscription };
}
