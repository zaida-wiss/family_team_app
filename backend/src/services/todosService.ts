import { TodoModel } from "../db/models/Todo.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { broadcastTodosChanged } from "../realtime/todoEvents.js";
import { broadcastMembersChanged } from "../realtime/memberEvents.js";
import { AppError } from "../utils/errors.js";
import { TodoPatchSchema } from "../../../shared/schemas.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import { writeAuditLog } from "./auditLogService.js";
import { getAllRoles } from "./rolesService.js";
import { canCompleteTodo, canDeleteTodo, canEditTodo, canManageChildAccount, getChildShareAccess, hasPermission } from "../../../shared/permissions.js";
import type { Member, Role, Todo } from "../../../shared/types.js";

// Servern litade tidigare bara på att frontend gömde knapparna bakom
// canCompleteTodo/hasPermission(..., "canApproveTodos") — vem som helst
// inloggad i kontot kunde anropa complete/approve/reject direkt för VILKEN
// TODO SOM HELST, oavsett tilldelning/roll (samma klass av brist som redan
// fixades en gång för roller generellt, ADR-0009). hasPermission/canCompleteTodo
// är samma rena funktioner som redan används i frontend (shared/permissions.ts),
// återanvänds här istället för att skriva en ny variant.
async function requireMember(memberId: string | null, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

// completeTodo anropas alltid med den INLOGGADE medlemmens id (x-member-id sätts
// en gång per session, aldrig per todo) — men frontend låter en förälder
// slutföra ett BARNS uppgift via ett långt tryck i tråd-vyn (MemberShellContent.tsx),
// vilket klientsidan tillåter genom att kontrollera canCompleteTodo mot BARNETS
// (tilldelade medlemmens) identitet, inte förälderns. En ren port av
// canCompleteTodo(inloggad medlem, ...) hade därför nekat detta helt legitima
// flödet — och dessutom nekat en vuxen att slutföra sin EGEN personliga uppgift,
// eftersom Förälder-rollens standardbehörigheter saknar canCompleteAssignedTodos
// (den behörigheten gäller uppgifter TILLDELADE AV NÅGON ANNAN, t.ex. ett barns
// rutin — inte en självskapad personlig todo). Tre giltiga vägar:
// 1. Egen, självskapad OCH självtilldelad uppgift (personliga kategori-trådar) — kräver ingen särskild behörighet.
// 2. Tilldelad AV någon annan, men till en själv, och man har canCompleteAssignedTodos.
// 3. Barnets uppgift, hanterad åt barnet av en förälder med canManageChildTodos
//    (canManageChildAccount, samma funktion som redan avgör om en förälder får
//    hantera ett barns konto/uppgifter på andra ställen).
async function canCompleteTodoAsCaller(caller: Member, roles: Role[], todo: Todo) {
  if (todo.createdBy === caller.id && todo.assignedTo === caller.id) return true;
  if (canCompleteTodo(caller, roles, todo)) return true;
  if (!todo.assignedTo) return false;
  const assignee = await MemberModel.findOne({ id: todo.assignedTo, accountId: caller.accountId, deletedAt: null });
  return !!assignee && canManageChildAccount(caller, assignee, roles);
}

export async function getAllTodos(accountId: string) {
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);

  const todos = await TodoModel.find(
    {
      accountId,
      $and: [
        // Soft-deleted: keep last 30 days for trash view
        { $or: [{ deletedAt: null }, { deletedAt: { $gte: cutoff30.toISOString() } }] },
        // Expired: keep last 30 days
        { $or: [{ status: { $ne: "expired" } }, { expiresAt: { $gte: cutoff30.toISOString() } }] },
        // Approved: keep last 7 days — total stars tracked on member.approvedStars
        { $or: [{ status: { $ne: "approved" } }, { approvedAt: { $gte: cutoff7.toISOString() } }] },
      ],
    },
    { _id: 0, __v: 0 }
  ).lean();

  return todos.map((todo) => ({
    ...todo,
    title: decryptField(accountId, todo.title),
    rejectedReason: decryptNullable(accountId, todo.rejectedReason) ?? null,
    notes: decryptNullable(accountId, todo.notes) ?? null
  }));
}

// Dela ett barns todos med en annan vuxen (ADR-0024, 2026-07-22) — hittar
// alla barn (i VILKET konto som helst) som delat med den inloggade
// medlemmen, och återanvänder getAllTodos ovan per barns EGET konto (samma
// dekryptering/kvarhållningsfönster, ingen duplicerad logik) — filtrerar
// sedan ner till just det barnets tilldelade uppgifter.
export async function getSharedChildrenTodos(callerMemberId: string, callerAccountId: string) {
  const children = await MemberModel.find({
    isChild: true,
    deletedAt: null,
    childSharedWith: { $elemMatch: { memberId: callerMemberId, accountId: callerAccountId } }
  });

  const results = [];
  for (const child of children) {
    const grant = (child.childSharedWith ?? []).find(
      (s) => s.memberId === callerMemberId && s.accountId === callerAccountId
    );
    if (!grant) continue;
    const accountTodos = await getAllTodos(child.accountId);
    results.push({
      child: {
        id: child.id,
        accountId: child.accountId,
        name: child.name,
        avatarUrl: child.avatarUrl,
        color: child.color,
        dashboardTheme: child.dashboardTheme
      },
      access: grant.access,
      todos: accountTodos.filter((t) => t.assignedTo === child.id)
    });
  }
  return results;
}

// Enda mutationen på ett delat barns todos i denna första version (ADR-0024s
// uppföljningsavsnitt) — bara "markera klar", inte skapa/godkänna/neka/
// delmoment/in-progress. assignedMemberNeedsApproval är alltid true för ett
// barn, så resultatet blir alltid status "done" (väntar på godkännande) —
// ALDRIG "approved" direkt, ingen stjärntilldelning sker här. Slutgiltigt
// godkännande (och stjärnorna) sker bara via barnets EGET konto, som
// tidigare, av en medlem DÄR. Ingen risk att en delning kringgår den
// gränsen.
export async function completeSharedChildTodo(
  todoId: string,
  childAccountId: string,
  childMemberId: string,
  callerMemberId: string,
  callerAccountId: string,
  elapsedMs: number | null
) {
  const child = await MemberModel.findOne({ id: childMemberId, accountId: childAccountId, deletedAt: null, isChild: true });
  if (!child) {
    throw new AppError(404, "Barnet hittades inte");
  }
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId: callerAccountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  if (getChildShareAccess(caller, child) !== "edit") {
    throw new AppError(403, "Åtkomst nekad");
  }

  const todo = await TodoModel.findOne({ id: todoId, accountId: childAccountId, assignedTo: childMemberId });
  if (!todo || todo.status !== "pending") {
    throw new AppError(404, "Todo hittades inte eller är inte pending");
  }

  todo.completedAt = new Date().toISOString();
  if (todo.timerEnabled && elapsedMs !== null) {
    todo.elapsedMs = elapsedMs;
  }
  todo.inProgressBy = [];
  todo.inProgressSince = null;

  if (await assignedMemberNeedsApproval(todo.assignedTo)) {
    todo.status = "done";
  } else {
    todo.status = "approved";
    todo.approvedBy = callerMemberId;
    todo.approvedAt = todo.completedAt;
    if (todo.assignedTo && todo.starValue) {
      await MemberModel.updateOne({ id: todo.assignedTo }, { $inc: { approvedStars: todo.starValue } });
      broadcastMembersChanged();
    }
  }

  await todo.save();
  broadcastTodosChanged();
}

export async function createTodo(data: unknown) {
  const existingId = getTodoId(data);
  if (existingId) {
    const existingTodo = await TodoModel.findOne({ id: existingId });
    if (existingTodo) {
      return { id: existingTodo.id };
    }
  }

  const input = data as Partial<Todo> & { accountId: string; title: string };
  const encrypted = {
    ...input,
    title: encryptField(input.accountId, input.title),
    rejectedReason: encryptNullable(input.accountId, input.rejectedReason) ?? null,
    notes: encryptNullable(input.accountId, input.notes) ?? null
  };

  const todo = new TodoModel(encrypted);
  try {
    await todo.save();
  } catch (error) {
    if (existingId && isDuplicateKeyError(error)) {
      const existingTodo = await TodoModel.findOne({ id: existingId });
      if (existingTodo) {
        return { id: existingTodo.id };
      }
    }

    throw error;
  }
  broadcastTodosChanged();
  return { id: todo.id };
}

function getTodoId(data: unknown) {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null;
  }

  const id = (data as Partial<Todo>).id;
  return typeof id === "string" ? id : null;
}

function isDuplicateKeyError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

// Det är bara BARNENS uppgifter som ska behöva ett separat godkännande-steg
// (Zaidas rättelse 2026-07-05) — en vuxens egen personliga uppgift har ingen
// förälder-över-föräldern som ska godkänna den, så den går direkt till
// "approved" istället för att fastna i "done" och dyka upp i godkänna-listan.
async function assignedMemberNeedsApproval(assignedTo: string | null): Promise<boolean> {
  if (!assignedTo) return false;
  const member = await MemberModel.findOne({ id: assignedTo });
  if (!member) return false;
  if (member.isChild) return true;
  const role = await RoleModel.findOne({ id: member.roleId });
  return role?.isChildRole === true;
}

export async function completeTodo(
  id: string,
  accountId: string,
  memberId: string | null,
  elapsedMs: number | null = null
) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "pending") {
    throw new AppError(404, "Todo hittades inte eller är inte pending");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!(await canCompleteTodoAsCaller(member, roles, todo))) {
    throw new AppError(403, "Åtkomst nekad");
  }
  todo.completedAt = new Date().toISOString();
  // Timerfunktion (2026-07-07) — sparas bara om uppgiften faktiskt hade
  // timerEnabled och klienten skickade med en uppmätt tid.
  if (todo.timerEnabled && elapsedMs !== null) {
    todo.elapsedMs = elapsedMs;
  }
  // "Någon håller på med den här"-indikatorn är bara meningsfull medan
  // uppgiften faktiskt är pending — rensas här, samma mönster som övriga
  // engångstillstånd (t.ex. completedAt) som sätts vid samma övergång.
  todo.inProgressBy = [];
  todo.inProgressSince = null;

  if (await assignedMemberNeedsApproval(todo.assignedTo)) {
    todo.status = "done";
  } else {
    todo.status = "approved";
    todo.approvedBy = memberId;
    todo.approvedAt = todo.completedAt;
    if (todo.assignedTo && todo.starValue) {
      await MemberModel.updateOne({ id: todo.assignedTo }, { $inc: { approvedStars: todo.starValue } });
      broadcastMembersChanged();
    }
  }

  await todo.save();
  broadcastTodosChanged();
}

// "Någon håller på med den här"-indikator (2026-07-22) — se shared/types.ts.
// targetMemberId är avsiktligt SKILT från callerMemberId (den inloggade
// anroparen): samma "delat hushållsdon"-modell som resten av tråd-vyns
// håll-in-flöde redan bygger på (en förälder slutför redan ett barns
// uppgift via samma UI, med barnets identitet, inte sin egen) — en
// familjemedlem kan markera VILKEN annan medlem som helst som "på" en
// uppgift via avatarväljaren, ingen extra behörighet utöver kontomedlemskap.
export async function toggleInProgress(
  id: string,
  accountId: string,
  callerMemberId: string | null,
  targetMemberId: string
) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "pending") {
    throw new AppError(404, "Todo hittades inte eller är inte pending");
  }
  await requireMember(callerMemberId, accountId);
  const target = await MemberModel.findOne({ id: targetMemberId, accountId, deletedAt: null });
  if (!target) {
    throw new AppError(404, "Medlem hittades inte");
  }

  const current = todo.inProgressBy ?? [];
  const alreadyIn = current.includes(target.id);
  const nextList = alreadyIn ? current.filter((m) => m !== target.id) : [...current, target.id];

  todo.inProgressBy = nextList;
  todo.inProgressSince = nextList.length > 0 ? todo.inProgressSince ?? new Date().toISOString() : null;
  await todo.save();
  broadcastTodosChanged();
  return { inProgressBy: nextList, inProgressSince: todo.inProgressSince };
}

export async function updateTodo(id: string, accountId: string, data: unknown, memberId: string | null) {
  const patch = TodoPatchSchema.parse(data);
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!canEditTodo(member, roles, todo)) {
    throw new AppError(403, "Åtkomst nekad");
  }

  if (patch.title !== undefined) patch.title = encryptField(accountId, patch.title);
  if (patch.notes !== undefined) patch.notes = encryptNullable(accountId, patch.notes) ?? null;

  Object.assign(todo, patch);
  await todo.save();
  broadcastTodosChanged();
  return { ok: true };
}

export async function approveTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, "canApproveTodos")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  todo.status = "approved";
  todo.approvedBy = memberId;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  if (todo.assignedTo && todo.starValue) {
    await MemberModel.updateOne(
      { id: todo.assignedTo },
      { $inc: { approvedStars: todo.starValue } }
    );
    const member = await MemberModel.findOne({ id: todo.assignedTo });
    await writeAuditLog(
      accountId,
      "stars_approved",
      memberId,
      `Godkände ${todo.starValue} stjärnor för "${decryptField(accountId, todo.title)}" (${member?.name ?? "okänd medlem"})`
    );
    broadcastMembersChanged();
  }
  broadcastTodosChanged();
}

export async function rejectTodo(id: string, accountId: string, memberId: string | null, reason: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, "canApproveTodos")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const encryptedReason = encryptNullable(accountId, reason) ?? null;
  if (canRetryRejectedTodo({ expiresAt: todo.expiresAt })) {
    todo.status = "pending";
    todo.completedAt = null;
    todo.approvedBy = null;
    todo.approvedAt = null;
    todo.rejectedBy = null;
    todo.rejectedAt = null;
    todo.rejectedReason = encryptedReason;
    await todo.save();
    broadcastTodosChanged();
    return;
  }

  todo.status = "rejected";
  todo.rejectedBy = memberId;
  todo.rejectedAt = new Date().toISOString();
  todo.rejectedReason = encryptedReason;
  await todo.save();
  broadcastTodosChanged();
}

function canRetryRejectedTodo(todo: { expiresAt: string | null }, now = Date.now()) {
  if (!todo.expiresAt) {
    return true;
  }

  return new Date(todo.expiresAt).getTime() > now;
}

export async function deleteTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!canDeleteTodo(member, roles, todo)) {
    throw new AppError(403, "Åtkomst nekad");
  }
  todo.deletedAt = new Date().toISOString();
  todo.deletedBy = memberId;
  await todo.save();
  broadcastTodosChanged();
}

// Sprint 8 S3 (2026-07-17), uppföljning noterad redan i ADR-0009/ADR-0016:
// saknade helt server-side behörighetskontroll — vilken inloggad medlem som
// helst i kontot kunde återställa VILKEN raderad todo som helst, oavsett
// egen canRestoreFromTrash-behörighet (klienten gömde bara knappen, se
// TrashView.tsx). Samma mönster som redan fixats för complete/approve/
// reject/update/delete.
export async function restoreTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, "canRestoreFromTrash")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  todo.deletedAt = null;
  todo.deletedBy = null;
  await todo.save();
  broadcastTodosChanged();
}

// Föräldravyn med delmoment (Sprint 6 S1) — bockar av/på ett enskilt delmoment,
// oberoende av complete/approve/reject-flödet. Lika vikt, ingen viktning (se
// discussions/2026-07-04-designspike-medaljer-och-foraldravy.md).
export async function toggleSubtask(id: string, accountId: string, subtaskId: string) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  const subtask = todo.subtasks?.find((s) => s.id === subtaskId);
  if (!subtask) {
    throw new AppError(404, "Delmoment hittades inte");
  }
  subtask.done = !subtask.done;
  todo.markModified("subtasks");
  await todo.save();
  broadcastTodosChanged();
  return { done: subtask.done };
}

// Automatisk mjuk-radering av gamla, avslutade återkommande OCCURRENCES
// (2026-07-08, Zaidas önskemål: "det är ingen vits med att spara gamla
// avklarade kopior på en todo som renderas och blir en ny kopia varje gång
// för varje person"). Rör ALDRIG mallen själv (recurringSourceId===null) —
// mallen ska finnas kvar för evigt, precis som "mallen ska finnas kvar"
// (samma princip gäller nu mallbiblioteket, se todoTemplatesService.ts).
// Rör heller aldrig engångsuppgifter (de kan istället sparas som en
// uppgiftsmall om man vill bevara dem). Gäller bara avslutade tillstånd
// (approved/rejected/expired) — pending/done (väntar på godkännande) rörs
// aldrig, de är fortfarande aktiva.
export async function pruneOldTodoOccurrences() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString();
  const nowIso = new Date().toISOString();

  const result = await TodoModel.updateMany(
    {
      recurringSourceId: { $ne: null },
      deletedAt: null,
      status: { $in: ["approved", "rejected", "expired"] },
      $or: [
        { approvedAt: { $ne: null, $lt: cutoffIso } },
        { rejectedAt: { $ne: null, $lt: cutoffIso } },
        { expiresAt: { $ne: null, $lt: cutoffIso } }
      ]
    },
    { $set: { deletedAt: nowIso, deletedBy: null } }
  );
  return { prunedCount: result.modifiedCount };
}
