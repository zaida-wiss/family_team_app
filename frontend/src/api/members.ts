import type { Member } from "@shared/types";
import { api, request, subscribeToServerEvents } from "./client";

export const membersApi = {
  getAll: () => request<Member[]>(api("members")),
  create: (member: Member) =>
    request<{ id: string }>(api("members"), { method: "POST", body: JSON.stringify(member) }),
  update: (id: string, patch: Partial<Member>) =>
    request<{ ok: boolean }>(api(`members/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch),
      // keepalive (2026-07-06): updateMemberNavigation-anrop (bl.a. todoThreadOrder)
      // är avsiktligt fire-and-forget, ofta följt direkt av en sidomladdning
      // (t.ex. användaren drar en kategori och laddar om för att se att det sparats).
      // Utan keepalive kan webbläsaren avbryta ett pågående fetch-anrop när
      // dokumentet börjar laddas om, vilket tyst tappar sparningen. Bodyn här är
      // alltid liten (fält, aldrig filer — se keepalive-specets 64 kB-gräns),
      // så säkert att sätta på alla members-patchar.
      keepalive: true
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  setCredentials: (id: string, username: string, password: string) =>
    request<{ id: string; username: string }>(api(`members/${id}/credentials`), {
      method: "PUT",
      body: JSON.stringify({ username, password })
    }),
  // Realtidssynk (2026-07-17, Zaidas fynd: stjärnor uppdaterades inte förrän
  // en omladdning) — samma SSE-mönster som todosApi redan använder.
  subscribeToChanges: (onChange: () => void) => {
    let initialConnect = true;
    return subscribeToServerEvents(api("members/events"), (eventName) => {
      if (eventName === "members-changed") {
        onChange();
      } else if (eventName === "connected") {
        if (initialConnect) { initialConnect = false; return; }
        onChange();
      }
    });
  }
};
