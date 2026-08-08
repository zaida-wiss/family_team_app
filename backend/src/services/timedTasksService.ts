import { TimedTaskModel } from "../db/models/TimedTask.js";
import { TimedAttemptModel } from "../db/models/TimedAttempt.js";
import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import { getAllRoles } from "./rolesService.js";
import { canManageChildAccount } from "../../../shared/permissions.js";
import type { Member, TimedAttempt, TimedTaskWithBest } from "../../../shared/types.js";

// Säkerhetsfynd fixat 2026-07-16 (samma klass av brist som ADR-0016/ADR-0009):
// GET/POST /api/timed-tasks och DELETE /:id saknade all behörighetskontroll
// utöver requireAuth+attachAccountId — vilken inloggad medlem som helst i
// kontot (i praktiken: ett barn som anropade API:t direkt, UI:t visar aldrig
// Medaljer/Rekord-inställningarna för barn) kunde skapa/ta bort VILKEN
// tidtagen uppgift som helst. recordAttempt/deleteAttempt verifierade heller
// aldrig att den anropande medlemmen faktiskt är uppgiftens mottagare (eller
// en vuxen som hanterar det barnets konto) — vem som helst i kontot kunde
// logga eller radera ett försök på ett ANNAT barns rekord.
async function requireAttemptCaller(caller: Member, task: { assignedTo: string }) {
  if (task.assignedTo === caller.id) return;
  const roles = await getAllRoles(caller.accountId);
  const assignee = await MemberModel.findOne({ id: task.assignedTo, accountId: caller.accountId, deletedAt: null });
  if (assignee && canManageChildAccount(caller, assignee, roles)) return;
  throw new AppError(403, "Åtkomst nekad");
}

export async function getAllTimedTasks(accountId: string): Promise<TimedTaskWithBest[]> {
  const tasks = await TimedTaskModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).lean();
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const attempts = await TimedAttemptModel.find(
    { timedTaskId: { $in: taskIds }, deletedAt: null },
    { _id: 0, __v: 0 }
  ).lean();

  const byTask = new Map<string, { bestDurationMs: number; bestAchievedAt: string; count: number }>();
  for (const attempt of attempts) {
    const current = byTask.get(attempt.timedTaskId);
    if (!current) {
      byTask.set(attempt.timedTaskId, {
        bestDurationMs: attempt.durationMs,
        bestAchievedAt: attempt.achievedAt,
        count: 1
      });
      continue;
    }
    current.count += 1;
    if (attempt.durationMs < current.bestDurationMs) {
      current.bestDurationMs = attempt.durationMs;
      current.bestAchievedAt = attempt.achievedAt;
    }
  }

  return tasks.map((task) => {
    const best = byTask.get(task.id);
    return {
      ...task,
      bestDurationMs: best?.bestDurationMs ?? null,
      bestAchievedAt: best?.bestAchievedAt ?? null,
      attemptCount: best?.count ?? 0
    };
  });
}

export async function createTimedTask(
  accountId: string,
  createdBy: string,
  data: { title: string; symbol?: string | null; assignedTo: string }
) {
  await requireAdultMember(createdBy, accountId);
  const task = new TimedTaskModel({
    id: `tt-${crypto.randomUUID()}`,
    accountId,
    title: data.title,
    symbol: data.symbol ?? null,
    assignedTo: data.assignedTo,
    createdBy,
    deletedAt: null,
    deletedBy: null
  });
  await task.save();
  return { id: task.id };
}

export async function deleteTimedTask(id: string, accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const task = await TimedTaskModel.findOne({ id, accountId });
  if (!task || task.deletedAt) throw new AppError(404, "Tidtagen uppgift hittades inte");
  task.deletedAt = new Date().toISOString();
  task.deletedBy = memberId;
  await task.save();
}

// Barnet mäter tiden klientsidan (Date.now() vid start/stopp) och skickar bara den
// färdiga varaktigheten hit — inget "pågående försök"-tillstånd på servern som kan
// bli övergivet om fliken stängs mitt i.
// achievedAt (2026-07-13, offline-kö-stödet): klienten skickar sin egen
// tidsstämpel (satt exakt när tidtagningen stoppades), inte servertid —
// annars skulle ett försök som köades offline och synkades timmar senare
// felaktigt få synk-ögonblickets tid istället för när det faktiskt hände.
// Saknas den (t.ex. ett äldre cachat klientbygge) faller vi tillbaka på
// servertid, oförändrat beteende.
export async function recordAttempt(
  timedTaskId: string,
  accountId: string,
  memberId: string,
  durationMs: number,
  achievedAt?: string
) {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const caller = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!caller) throw new AppError(403, "Åtkomst nekad");
  await requireAttemptCaller(caller, task);

  const best = await TimedAttemptModel.findOne({ timedTaskId, deletedAt: null }).sort({ durationMs: 1 }).lean();
  const isNewRecord = !best || durationMs < best.durationMs;

  const attempt = new TimedAttemptModel({
    id: `ta-${crypto.randomUUID()}`,
    timedTaskId,
    memberId,
    durationMs,
    achievedAt: achievedAt ?? new Date().toISOString(),
    isNewRecord,
    deletedAt: null,
    deletedBy: null
  });
  await attempt.save();

  return {
    id: attempt.id,
    durationMs: attempt.durationMs,
    achievedAt: attempt.achievedAt,
    isNewRecord: attempt.isNewRecord
  };
}

// Redigera-modalen (2026-07-13, "vi ska kunna se våra rekord datum och antal
// försök per dag... vi ska kunna ta bort tider") — grupperingen (datum+antal
// per dag) görs klientsidan på den råa listan, ingen egen aggregerings-
// endpoint (listan är redan liten, en uppgifts alla försök).
export async function getAttemptsForTask(
  timedTaskId: string,
  accountId: string
): Promise<Omit<TimedAttempt, "deletedAt" | "deletedBy">[]> {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const attempts = await TimedAttemptModel.find(
    { timedTaskId, deletedAt: null },
    { _id: 0, __v: 0, deletedAt: 0, deletedBy: 0 }
  )
    .sort({ achievedAt: -1 })
    .lean();
  return attempts;
}

// Mjuk radering (aldrig hard delete, se CLAUDE.md) — timedTaskId i frågan
// (inte bara attemptId) förhindrar att en manipulerad :id i URL:en raderar
// ett försök som hör till en ANNAN tidtagen uppgift.
// Automatisk koppling mellan en todos ÖPPNA tidtagning (Todo.timerEnabled
// utan plannedDurationMinutes) och Medaljer/Rekord (2026-08-08, Zaidas
// önskemål: "resultatet på den tidtagningen skall skickas till rekord och
// medaljer och ligga under sin kategori där... där ska jag kunna se mina
// tidtagningar över tid, med statistiken"). Anropas INIFRÅN completeTodo
// (todosService.ts), inte via en klient-vänd endpoint — INGEN av de vanliga
// behörighetskontrollerna (requireAdultMember/requireAttemptCaller) gäller
// här, det är servern själv som utför en sidoeffekt av en redan godkänd
// completeTodo-anrop, inte en ny användarinitierad handling. Ett barn som
// slutför sin EGEN tidtagna uppgift (den vanligaste vägen hit) skulle annars
// blockerats av requireAdultMember. "Sin kategori" tolkas som uppgiftens
// EGEN titel — get-or-create en TimedTask per (accountId, assignedTo,
// title), samma namn varje gång samma återkommande uppgift slutförs, så
// resultaten samlas under EN kategori över tid istället för en ny per
// tillfälle.
// Returnerar nu isNewRecord (2026-08-09, Zaidas önskemål: "skulle det kunna
// komma en pokal med tiden över skärmen då? och att det blinkar lite grönt
// i bakgrunden") — räknades redan ut här men kastades tidigare bort direkt,
// completeTodo (todosService.ts) hade ingen väg att veta om det blev nytt
// rekord eller inte. Samma returform som recordAttempt ovan.
export async function recordAutoTimedAttempt(
  accountId: string,
  assignedTo: string,
  title: string,
  symbol: string | null,
  durationMs: number
): Promise<{ isNewRecord: boolean; durationMs: number; title: string }> {
  let task = await TimedTaskModel.findOne({ accountId, assignedTo, title, deletedAt: null });
  if (!task) {
    task = new TimedTaskModel({
      id: `tt-${crypto.randomUUID()}`,
      accountId,
      title,
      symbol,
      assignedTo,
      createdBy: assignedTo,
      deletedAt: null,
      deletedBy: null
    });
    await task.save();
  }

  const best = await TimedAttemptModel.findOne({ timedTaskId: task.id, deletedAt: null })
    .sort({ durationMs: 1 })
    .lean();
  const isNewRecord = !best || durationMs < best.durationMs;

  const attempt = new TimedAttemptModel({
    id: `ta-${crypto.randomUUID()}`,
    timedTaskId: task.id,
    memberId: assignedTo,
    durationMs,
    achievedAt: new Date().toISOString(),
    isNewRecord,
    deletedAt: null,
    deletedBy: null
  });
  await attempt.save();

  return { isNewRecord, durationMs, title };
}

export async function deleteAttempt(
  attemptId: string,
  timedTaskId: string,
  accountId: string,
  memberId: string | null
) {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const caller = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!caller) throw new AppError(403, "Åtkomst nekad");
  await requireAttemptCaller(caller, task);

  const attempt = await TimedAttemptModel.findOne({ id: attemptId, timedTaskId });
  if (!attempt || attempt.deletedAt) throw new AppError(404, "Försök hittades inte");
  attempt.deletedAt = new Date().toISOString();
  attempt.deletedBy = memberId;
  await attempt.save();
}
