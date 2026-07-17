import type { Response } from "express";

// Realtidssynk för medlemsdata (2026-07-17, Zaidas fynd: "dagens stjärnor och
// framförallt totalt antal stjärnor i barnvyn uppdateras inte direkt, jag
// behöver refresha sidan... vi vill helt jobba i realtid") — useMembersState.ts
// hämtade tidigare bara medlemmar EN gång vid appstart, aldrig igen. När en
// todo godkänns ökar approvedStars server-side (todosService.ts), men klienten
// fick aldrig veta — samma mönster som todoEvents.ts redan använder för todos.
const clients = new Set<Response>();

export function addMemberEventsClient(response: Response) {
  clients.add(response);
  response.write("event: connected\ndata: {}\n\n");
  const heartbeat = setInterval(() => {
    response.write(": keepalive\n\n");
  }, 25_000);

  response.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
  });
}

export function broadcastMembersChanged() {
  for (const client of clients) {
    client.write("event: members-changed\ndata: {}\n\n");
  }
}
