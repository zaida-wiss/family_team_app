import { api, request } from "./client";

export const householdPinApi = {
  getStatus: () => request<{ isSet: boolean }>(api("household-pin")),
  set: (pin: string) =>
    request<{ ok: boolean }>(api("household-pin"), { method: "PUT", body: JSON.stringify({ pin }) }),
  verify: (pin: string) =>
    request<{ ok: boolean }>(api("household-pin/verify"), { method: "POST", body: JSON.stringify({ pin }) })
};
