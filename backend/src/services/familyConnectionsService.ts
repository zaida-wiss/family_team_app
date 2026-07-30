import crypto from "crypto";
import { z } from "zod";
import { AccountModel } from "../db/models/Account.js";
import { MemberModel } from "../db/models/Member.js";
import { UserModel } from "../db/models/User.js";
import { AppError } from "../utils/errors.js";
import { getAllRoles } from "./rolesService.js";
import { getAllRecipes } from "./recipesService.js";
import { getAllLists } from "./shoppingService.js";
import { canManageFamilyConnections } from "../../../shared/permissions.js";
import type { AccessLevel, FamilyConnectionScope } from "../../../shared/types.js";

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar", se ADR:ns rättelseavsnitt): ger INTE kontoåtkomst,
// medlemskap eller en roll — bara extra, tydligt avgränsade sektioner i
// Todos-/Recept-/Inköpslistor-panelerna för de exponerade medlemmarnas
// data. Symmetrisk, TVÅ OBEROENDE HALVOR (Account.familyConnections) — se
// shared/types.ts. Modellerat på childSharesService.ts:s
// pending/accept/decline-mönster (ADR-0024/0029), men på KONTONIVÅ istället
// för per barn.

const DEFAULT_SCOPE: FamilyConnectionScope = { todos: true, recipes: true, shoppingLists: true };

const ScopeSchema = z.object({
  todos: z.boolean(),
  recipes: z.boolean(),
  shoppingLists: z.boolean()
}).partial();

const InviteConnectionBodySchema = z.object({
  otherAccountId: z.string().min(1),
  exposedMemberIds: z.array(z.string().min(1)),
  access: z.enum(["view", "edit"]),
  dataScope: ScopeSchema.optional()
});

const RespondConnectionBodySchema = z.object({
  exposedMemberIds: z.array(z.string().min(1)),
  access: z.enum(["view", "edit"]),
  dataScope: ScopeSchema.optional()
});

function fillScope(partial?: z.infer<typeof ScopeSchema>): FamilyConnectionScope {
  return { ...DEFAULT_SCOPE, ...partial };
}

async function requireMember(accountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return caller;
}

async function requireManager(accountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!canManageFamilyConnections(caller, roles)) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return caller;
}

// Steg 1 — slå upp en annan familjs konto via en vuxen medlems e-post
// (samma UserModel-mönster som childSharesService.ts/invitationsService.ts).
// Anroparen väljer sedan VILKET av de hittade kontona som avses (en person
// kan vara vuxen i flera familjer, samma "reveal nothing"-resonemang som
// childSharesService.ts:s lookupShareCandidate).
export async function lookupConnectionCandidate(accountId: string, callerMemberId: string | null, email: string) {
  await requireManager(accountId, callerMemberId);
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { accounts: [] };
  }
  const members = await MemberModel.find({ userId: user.id, deletedAt: null, isChild: false });
  const accountIds = [...new Set(members.map((m) => m.accountId).filter((id) => id !== accountId))];
  const accounts = await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 });
  return { accounts: accounts.map((a) => ({ accountId: a.id, accountName: a.name })) };
}

// Skickar en inbjudan — skapar EN post i MITT EGET konto (status pending).
// Mottagarens halva skapas inte förrän DE accepterar (acceptConnection).
export async function sendInvitation(accountId: string, callerMemberId: string | null, data: unknown) {
  const caller = await requireManager(accountId, callerMemberId);
  const { otherAccountId, exposedMemberIds, access, dataScope } = InviteConnectionBodySchema.parse(data);

  if (otherAccountId === accountId) {
    throw new AppError(400, "Kan inte ansluta ett konto till sig självt");
  }
  const otherAccount = await AccountModel.findOne({ id: otherAccountId });
  if (!otherAccount) {
    throw new AppError(404, "Kontot hittades inte");
  }
  const exposedMembers = await MemberModel.find({ id: { $in: exposedMemberIds }, accountId, deletedAt: null });
  if (exposedMembers.length !== exposedMemberIds.length) {
    throw new AppError(400, "En eller flera medlemmar hittades inte i ditt konto");
  }

  const account = await AccountModel.findOne({ id: accountId });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }
  const existing = (account.familyConnections ?? []).filter((c) => c.otherAccountId !== otherAccountId);
  account.familyConnections = [
    ...existing,
    {
      id: `famconn-${crypto.randomUUID()}`,
      otherAccountId,
      status: "pending",
      invitedBy: caller.id,
      createdAt: new Date().toISOString(),
      exposedMemberIds,
      access: access as AccessLevel,
      dataScope: fillScope(dataScope)
    }
  ];
  account.markModified("familyConnections");
  await account.save();
}

// Mina väntande inbjudningar FRÅN andra konton (riktade mot mig) — söker i
// ANDRA konton efter en post där otherAccountId === mitt konto.
export async function getPendingConnectionsForMe(accountId: string, callerMemberId: string | null) {
  await requireManager(accountId, callerMemberId);
  const accounts = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: accountId, status: "pending" } }
  });
  return accounts.flatMap((a) => {
    const conn = (a.familyConnections ?? []).find((c) => c.otherAccountId === accountId && c.status === "pending");
    if (!conn) return [];
    return [
      {
        connectionId: conn.id,
        fromAccountId: a.id,
        fromAccountName: a.name,
        exposedMemberCount: conn.exposedMemberIds.length,
        access: conn.access,
        dataScope: conn.dataScope
      }
    ];
  });
}

// Acceptera — markerar AVSÄNDARENS post som accepterad OCH skapar en NY,
// SPEGELVÄND post i MITT EGET konto med MIN EGEN, oberoende konfiguration av
// exponering/åtkomst/dataScope.
export async function acceptConnection(accountId: string, callerMemberId: string | null, fromAccountId: string, data: unknown) {
  const caller = await requireManager(accountId, callerMemberId);
  const { exposedMemberIds, access, dataScope } = RespondConnectionBodySchema.parse(data);

  const fromAccount = await AccountModel.findOne({ id: fromAccountId });
  if (!fromAccount) {
    throw new AppError(404, "Kontot hittades inte");
  }
  const pending = (fromAccount.familyConnections ?? []).find(
    (c) => c.otherAccountId === accountId && c.status === "pending"
  );
  if (!pending) {
    throw new AppError(404, "Ingen väntande inbjudan hittades");
  }
  const exposedMembers = await MemberModel.find({ id: { $in: exposedMemberIds }, accountId, deletedAt: null });
  if (exposedMembers.length !== exposedMemberIds.length) {
    throw new AppError(400, "En eller flera medlemmar hittades inte i ditt konto");
  }

  pending.status = "accepted";
  fromAccount.markModified("familyConnections");
  await fromAccount.save();

  const myAccount = await AccountModel.findOne({ id: accountId });
  if (!myAccount) {
    throw new AppError(404, "Konto hittades inte");
  }
  const withoutExisting = (myAccount.familyConnections ?? []).filter((c) => c.otherAccountId !== fromAccountId);
  myAccount.familyConnections = [
    ...withoutExisting,
    {
      id: `famconn-${crypto.randomUUID()}`,
      otherAccountId: fromAccountId,
      status: "accepted",
      invitedBy: caller.id,
      createdAt: new Date().toISOString(),
      exposedMemberIds,
      access: access as AccessLevel,
      dataScope: fillScope(dataScope)
    }
  ];
  myAccount.markModified("familyConnections");
  await myAccount.save();
}

export async function declineConnection(accountId: string, callerMemberId: string | null, fromAccountId: string) {
  await requireManager(accountId, callerMemberId);
  const fromAccount = await AccountModel.findOne({ id: fromAccountId });
  if (!fromAccount) {
    throw new AppError(404, "Kontot hittades inte");
  }
  fromAccount.familyConnections = (fromAccount.familyConnections ?? []).filter(
    (c) => !(c.otherAccountId === accountId && c.status === "pending")
  );
  fromAccount.markModified("familyConnections");
  await fromAccount.save();
}

// Återkalla — tar bort BARA min egen halva, rör aldrig motpartens egen
// exponering/konfiguration.
export async function revokeConnection(accountId: string, callerMemberId: string | null, connectionId: string) {
  await requireManager(accountId, callerMemberId);
  const account = await AccountModel.findOne({ id: accountId });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }
  account.familyConnections = (account.familyConnections ?? []).filter((c) => c.id !== connectionId);
  account.markModified("familyConnections");
  await account.save();
}

// Återanvänd av todosService.ts (getConnectionTodos m.fl.) — hittar EN
// accepterad anslutning som exponerar data TILL mig FRÅN `fromAccount`,
// eller null. Kontrollerar INTE dataScope[key] här (anroparen gör det med
// den returnerade posten, samma mönster som shared/permissions.ts:s
// getFamilyConnectionAccess men för HELA anslutningen istället för en
// enskild medlem).
export function findAcceptedConnectionFrom(myAccountId: string, fromAccount: { familyConnections?: unknown }) {
  const connections = (fromAccount.familyConnections ?? []) as Array<{
    otherAccountId: string;
    status: string;
    exposedMemberIds: string[];
    access: AccessLevel;
    dataScope: FamilyConnectionScope;
  }>;
  return connections.find((c) => c.otherAccountId === myAccountId && c.status === "accepted") ?? null;
}

// Mina anslutningar — BÅDA riktningarna: min egen exponering TILL andra
// (mitt kontos egna poster) OCH vad ANDRA exponerar TILL mig (deras poster
// med otherAccountId === mitt konto).
export async function listMyConnections(accountId: string, callerMemberId: string | null) {
  await requireManager(accountId, callerMemberId);

  const myAccount = await AccountModel.findOne({ id: accountId });
  const mine = (myAccount?.familyConnections ?? []).filter((c) => c.status === "accepted");

  const others = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: accountId, status: "accepted" } }
  });

  const accountIds = [...new Set(mine.map((c) => c.otherAccountId))];
  const accountNameById = new Map(
    (await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 })).map((a) => [a.id, a.name])
  );

  return {
    exposedByMe: mine.map((c) => ({
      connectionId: c.id,
      otherAccountId: c.otherAccountId,
      otherAccountName: accountNameById.get(c.otherAccountId) ?? "Okänt konto",
      exposedMemberIds: c.exposedMemberIds,
      access: c.access,
      dataScope: c.dataScope
    })),
    exposedToMe: others.map((a) => {
      const conn = (a.familyConnections ?? []).find((c) => c.otherAccountId === accountId && c.status === "accepted")!;
      return {
        fromAccountId: a.id,
        fromAccountName: a.name,
        exposedMemberIds: conn.exposedMemberIds,
        access: conn.access,
        dataScope: conn.dataScope
      };
    })
  };
}

// Recept/inköpslistor är kontobreda (inte medlems-scopade, ADR-0028/befintlig
// shoppingService) — dataScope styr bara av/på, ingen exposedMemberIds-
// filtrering behövs (till skillnad från todos ovan). Läsning, oavsett
// access-nivå (view/edit) — "om man mest vill ha information", se ADR-0030.
export async function getConnectionRecipes(callerAccountId: string, callerMemberId: string | null) {
  await requireMember(callerAccountId, callerMemberId);
  const accountsExposingToMe = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: callerAccountId, status: "accepted" } }
  });
  const results = [];
  for (const account of accountsExposingToMe) {
    const conn = findAcceptedConnectionFrom(callerAccountId, account);
    if (!conn || !conn.dataScope.recipes) continue;
    const recipes = await getAllRecipes(account.id);
    results.push({ accountId: account.id, accountName: account.name, recipes });
  }
  return results;
}

export async function getConnectionShoppingLists(callerAccountId: string, callerMemberId: string | null) {
  await requireMember(callerAccountId, callerMemberId);
  const accountsExposingToMe = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: callerAccountId, status: "accepted" } }
  });
  const results = [];
  for (const account of accountsExposingToMe) {
    const conn = findAcceptedConnectionFrom(callerAccountId, account);
    if (!conn || !conn.dataScope.shoppingLists) continue;
    const lists = await getAllLists(account.id);
    results.push({ accountId: account.id, accountName: account.name, lists });
  }
  return results;
}
