import type { Response } from "express";

const clients = new Set<Response>();

export function addTodoEventsClient(response: Response) {
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

export function broadcastTodosChanged() {
  for (const client of clients) {
    client.write("event: todos-changed\ndata: {}\n\n");
  }
}
