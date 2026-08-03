import { TodoModel } from "../db/models/Todo.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { RoleModel } from "../db/models/Role.js";
import { broadcastTodosChanged } from "../realtime/todoEvents.js";
import { broadcastMembersChanged } from "../realtime/memberEvents.js";
import { AppError } from "../utils/errors.js";
import { TodoPatchSchema } from "../../../shared/schemas.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import { writeAuditLog } from "./auditLogService.js";
import { getAllRoles } from "./rolesService.js";
import { canCompleteTodo, canDeleteTodo, canEditTodo, canManageChildAccount, getChildShareAccess, hasPermission, isShareActive } from "../../../shared/permissions.js";
import type { CalendarEvent, Member, Role, Todo } from "../../../shared/types.js";
// Dela ALLT kopplat till barnets konto, inte bara todos (2026-07-27, Zaidas
// önskemål: "en förälder som tillhör en annan familj ska få åtkomst till
// allt som är kopplat till barnets konto") — getSharedChildrenData nedan
// återanvänder varje domäns egen befintliga hämtningsfunktion rakt av
// (samma mönster som accountsService.ts:s exportAccount, som redan
// importerar tvärs över flera services för en aggregerad vy), ingen
// duplicerad hämtningslogik.
import { getAllCalendars } from "./calendarsService.js";
import { getPurchasedRewardsForMember } from "./rewardShopService.js";
import { getAllTimedTasks } from "./timedTasksService.js";
import { findAcceptedConnectionFrom } from "./familyConnectionsService.js";

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

function decryptTodo<
  T extends { title: string; rejectedReason: string | null; notes?: string | null; subtasks?: { title: string }[] }
>(accountId: string, todo: T): T {
  return {
    ...todo,
    title: decryptField(accountId, todo.title),
    rejectedReason: decryptNullable(accountId, todo.rejectedReason) ?? null,
    notes: decryptNullable(accountId, todo.notes) ?? null,
    subtasks: todo.subtasks?.map((s) => ({ ...s, title: decryptField(accountId, s.title) }))
  };
}

// Paginering (2026-07-26, Zaidas önskemål: "fixa pagineringen på todo") —
// mjuk-raderade todos (papperskorgen) togs helt bort ur denna, huvud-
// endpointen (var tidigare kvar 30 dagar "för papperskorgsvyn") och flyttades
// till en egen, paginerad getTodosHistoryPage nedan. Bekräftat säkert innan
// ändringen: soft-deletade todos konsumeras ENDAST av TrashView.tsx, inte av
// completedPercent (ParentTodoThreadView.tsx), CSV-export (todoCsv.ts,
// filtrerar redan bort deletedAt!==null) eller barnens nekad-uppgift-
// feedback. Expired/approved-fönstren (30/7 dagar) lämnas MEDVETET orörda
// här — completedPercent läser approved-status ur denna endpoint (via
// isDueWithinRange, som i praktiken bara räknar todos vars expiresAt inte
// redan passerat — ett bredare fönster hade inte gjort skillnad för den
// statistiken, men att ta bort approved helt hade krävt att flytta
// beräkningen server-side, ett större jobb som INTE gjordes denna gång).
export async function getAllTodos(accountId: string) {
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);

  const todos = await TodoModel.find(
    {
      accountId,
      deletedAt: null,
      $and: [
        // Expired: keep last 30 days
        { $or: [{ status: { $ne: "expired" } }, { expiresAt: { $gte: cutoff30.toISOString() } }] },
        // Approved: keep last 7 days — total stars tracked on member.approvedStars
        { $or: [{ status: { $ne: "approved" } }, { approvedAt: { $gte: cutoff7.toISOString() } }] },
      ],
    },
    { _id: 0, __v: 0 }
  ).lean();

  return todos.map((todo) => decryptTodo(accountId, todo));
}

// Historik/papperskorg, paginerad (2026-07-26) — allt som huvud-endpointen
// ovan INTE längre returnerar i sin helhet: mjuk-raderade todos (oavsett
// status) OCH avslutade todos (godkända/nekade/utgångna) UTAN tidsfönster —
// till skillnad från getAllTodos ovan finns ingen 7/30-dagarsgräns här,
// eftersom paginering redan löser problemet med en obegränsat växande
// mängd. Samma sida-mönster som rewardShopService.ts:s
// getPurchasedRewardsPage (page/pageSize/total), konsumeras av
// TodoHistory.tsx OCH TrashView.tsx (var sin filtrering av samma sida).
export async function getTodosHistoryPage(accountId: string, page: number, pageSize: number) {
  const filter = {
    accountId,
    $or: [{ deletedAt: { $ne: null } }, { status: { $in: ["approved", "rejected", "expired"] } }]
  };
  const [todos, total] = await Promise.all([
    TodoModel.find(filter, { _id: 0, __v: 0 })
      // Ingen enskild "senast ändrad"-tidsstämpel finns på modellen — deletedAt
      // (om satt) är den mest relevanta signalen, annars expiresAt.
      .sort({ deletedAt: -1, expiresAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    TodoModel.countDocuments(filter)
  ]);

  return {
    items: todos.map((todo) => decryptTodo(accountId, todo)),
    page,
    pageSize,
    total
  };
}

// Dela ett barns todos med en annan vuxen (ADR-0024, 2026-07-22), utökad
// 2026-07-27 till ALLT kopplat till barnets konto (Zaidas önskemål) — hittar
// alla barn (i VILKET konto som helst) som delat med den inloggade
// medlemmen, och återanvänder varje domäns egen befintliga hämtningsfunktion
// per barns EGET konto (samma dekryptering/kvarhållningsfönster som varje
// domän redan har, ingen duplicerad logik) — filtrerar sedan ner till just
// det barnet. Todos-mutationer (complete) var redan implementerade sedan
// ADR-0024 och är oförändrade; kalender/belöningar/Medaljer är MEDVETET
// bara läsbara i denna första version (samma "godkännande/stjärnor sker
// bara i barnets eget konto"-princip som redan gäller todos) — se ADR-0024s
// uppföljningsavsnitt.
export async function getSharedChildrenData(callerMemberId: string, callerAccountId: string) {
  const children = await MemberModel.find({
    isChild: true,
    deletedAt: null,
    childSharedWith: { $elemMatch: { memberId: callerMemberId, accountId: callerAccountId } }
  });

  const now = new Date();
  const untilDate = new Date(now);
  untilDate.setDate(untilDate.getDate() + 30);
  const fromStr = now.toISOString().slice(0, 10);
  const untilStr = untilDate.toISOString().slice(0, 10);

  const results = [];
  for (const child of children) {
    const grant = (child.childSharedWith ?? []).find(
      (s) => s.memberId === callerMemberId && s.accountId === callerAccountId
    );
    if (!grant || !isShareActive(grant)) continue;

    const [accountTodos, calendars, purchased, timedTasks, homeAccount] = await Promise.all([
      getAllTodos(child.accountId),
      getAllCalendars(child.accountId, fromStr, untilStr),
      getPurchasedRewardsForMember(child.accountId, child.id, 25),
      getAllTimedTasks(child.accountId),
      AccountModel.findOne({ id: child.accountId })
    ]);

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
      // 2026-07-29, Zaidas placeringsbeslut: "barnet skall vara på samma
      // ställe [Familjemedlemmar], men med en text under som informerar" —
      // hemkontots namn + relationen (om satt) är precis den informationen.
      homeAccountName: homeAccount?.name ?? "Okänt konto",
      relation: grant.relation ?? null,
      // recurrence.type==="none" (2026-08-01, Zaidas fynd: "i min todo vy
      // står fortfarande todo-mallar som tillhör olika familjer") — filtret
      // saknade den exkludering som getCrossAccountFamilyTodos/
      // getConnectionTodos redan har, så en återkommande MALL (inte bara
      // dess dagliga occurrence) för ett delat barn visades som en egen,
      // aldrig avklarbar boll i SharedChildrenThreads.tsx.
      todos: accountTodos.filter((t) => t.assignedTo === child.id && t.recurrence.type === "none"),
      // Nästa 30 dagar, samma fönster som CalendarPanel default visar —
      // en delnings-vy är tänkt för samordning framåt, inte historik.
      calendarEvents: calendars
        .filter((c) => c.ownerId === child.id)
        .flatMap((c) => c.events.map((e: CalendarEvent) => ({ ...e, calendarName: c.name }))),
      purchasedRewards: purchased,
      stars: { approved: child.approvedStars, spent: child.spentStars },
      timedTasks: timedTasks.filter((t) => t.assignedTo === child.id)
    });
  }
  return results;
}

// Mina familjekonton (2026-07-25, Zaidas önskemål) — till skillnad från
// getSharedChildrenTodos ovan (en delnings-GRANT från någon annan) är det
// här mina EGNA, riktiga medlemskap i andra konton (flera Member-poster med
// samma userId). Ingen ny behörighetsmodell — anroparen ÄR redan en
// fullvärdig medlem av målkontot, precis som om de bytt konto helt via
// inloggningens familjeväxlare. Bara den delade "Familjen"-tråden (todo utan
// tilldelad mottagare, ADR-2026-07-23) tas med, inte hela kontots todos.
export async function getCrossAccountFamilyTodos(callerUserId: string, currentAccountId: string, currentMemberId: string) {
  const currentMember = await MemberModel.findOne({ id: currentMemberId, accountId: currentAccountId });
  const hidden = new Set(currentMember?.hiddenCrossAccountIds ?? []);

  const memberDocs = await MemberModel.find({ userId: callerUserId, deletedAt: null });
  const results = [];
  for (const m of memberDocs) {
    if (!m.accountId || m.accountId === currentAccountId || hidden.has(m.accountId)) continue;
    const account = await AccountModel.findOne({ id: m.accountId });
    if (!account) continue;
    const accountTodos = await getAllTodos(m.accountId);
    // Inkluderar även todos jag redan är tilldelad ELLER signat upp på DÄR
    // (assignedTo===m.id eller inProgressBy innehåller m.id) — inte bara det
    // otagna poolen (assignedTo:null). m.id (min egen medlemspost i det
    // andra kontot) returneras nedan som myMemberId, så frontend kan avgöra
    // vilka todos JAG signat upp på (för "Mina uppgifter" i Todos-panelen,
    // 2026-08-01, Zaidas önskemål: "det som är signat på mina todos skall
    // istället visas i todovyn") utan att gissa.
    const familyTodos = accountTodos.filter(
      (t) =>
        (t.assignedTo === null || t.assignedTo === m.id) &&
        t.status === "pending" &&
        t.deletedAt === null &&
        t.recurrence.type === "none"
    );
    results.push({ accountId: m.accountId, accountName: account.name, myMemberId: m.id, todos: familyTodos });
  }
  return results;
}

// Slutför en Familjen-uppgift i ETT AV MINA ANDRA konton — hittar min egen
// medlemspost DÄR via userId (inte via x-member-id/accountId, som bara
// gäller det AKTIVA kontot) och återanvänder completeTodo rakt av, samma
// väg som om jag bytt konto och klickat där direkt.
export async function completeCrossAccountFamilyTodo(
  callerUserId: string,
  targetAccountId: string,
  todoId: string,
  elapsedMs: number | null
) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  await completeTodo(todoId, targetAccountId, memberInTarget.id, elapsedMs);
}

// "Signa upp sig" på en Familjen-uppgift i ETT AV MINA ANDRA konton
// (2026-08-01, ersätter samma dags tidigare claim/assignedTo-mekanism —
// Zaidas rättelse: "signa upp sig på samma sätt som i todovyn... två tryck
// för att tilldela" syftar på den REDAN BEFINTLIGA "vem håller på med den
// här"-dubbeltryck-mekaniken, inte en separat Ta uppgiften-knapp) — samma
// mönster som lokala toggleInProgress, bara autentiserad via min riktiga
// Member-post i målkontot (hittad via userId) istället för x-member-id/
// req.accountId, som bara gäller det AKTIVA kontot. targetMemberId får vara
// VILKEN som helst av målkontots aktiva medlemmar (samma "delat
// hushållsdon"-princip som den lokala varianten) — jag är en riktig medlem
// där, samma tillit som att vara inloggad på det kontot direkt.
export async function toggleInProgressCrossAccountFamilyTodo(
  callerUserId: string,
  targetAccountId: string,
  todoId: string,
  targetMemberId: string
) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return toggleInProgress(todoId, targetAccountId, memberInTarget.id, targetMemberId);
}

// Mutationer på ett delat barns todos (2026-07-29, ADR-0024-uppföljning,
// Zaidas beslut: "full åtkomst, som en riktig förälder") — utökar den
// ursprungliga "bara markera klar"-begränsningen med godkänn/neka, samma
// mönster som completeSharedChildTodo redan etablerade: hitta barnet i DESS
// EGET konto, kräv "edit"-åtkomst (getChildShareAccess, som nu även
// kontrollerar att delningen är accepterad och inte utgången), applicera
// exakt samma statusövergång/stjärntilldelning som normal approveTodo/
// rejectTodo (samma konto, bara en annan anropare). Skapa/redigera/
// delmoment/in-progress för ett delat barns todos är MEDVETET INTE med i
// denna omgång — se ADR-0024-uppföljningens scope-avsnitt.
async function requireEditableSharedChild(childAccountId: string, childMemberId: string, callerMemberId: string, callerAccountId: string) {
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
  return child;
}

export async function approveSharedChildTodo(
  todoId: string,
  childAccountId: string,
  childMemberId: string,
  callerMemberId: string,
  callerAccountId: string
) {
  const child = await requireEditableSharedChild(childAccountId, childMemberId, callerMemberId, callerAccountId);

  const todo = await TodoModel.findOne({ id: todoId, accountId: childAccountId, assignedTo: childMemberId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  todo.status = "approved";
  todo.approvedBy = callerMemberId;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  if (todo.starValue) {
    await MemberModel.updateOne({ id: childMemberId }, { $inc: { approvedStars: todo.starValue } });
    await writeAuditLog(
      childAccountId,
      "stars_approved",
      callerMemberId,
      `Godkände ${todo.starValue} stjärnor för "${decryptField(childAccountId, todo.title)}" (${child.name}) — delad åtkomst från ett annat konto`
    );
    broadcastMembersChanged();
  }
  broadcastTodosChanged();
}

export async function rejectSharedChildTodo(
  todoId: string,
  childAccountId: string,
  childMemberId: string,
  callerMemberId: string,
  callerAccountId: string,
  reason: string | null
) {
  await requireEditableSharedChild(childAccountId, childMemberId, callerMemberId, callerAccountId);

  const todo = await TodoModel.findOne({ id: todoId, accountId: childAccountId, assignedTo: childMemberId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  const encryptedReason = encryptNullable(childAccountId, reason) ?? null;
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
  todo.rejectedBy = callerMemberId;
  todo.rejectedAt = new Date().toISOString();
  todo.rejectedReason = encryptedReason;
  await todo.save();
  broadcastTodosChanged();
}

// Enda mutationen på ett delat barns todos i den ALLRA första versionen
// (ADR-0024s uppföljningsavsnitt) — bara "markera klar", inte skapa/godkänna/
// neka/delmoment/in-progress. assignedMemberNeedsApproval är alltid true för
// ett barn, så resultatet blir alltid status "done" (väntar på godkännande)
// — ALDRIG "approved" direkt, ingen stjärntilldelning sker här. Godkännande/
// nekande (och stjärnorna) sker via approveSharedChildTodo/
// rejectSharedChildTodo ovan (tillagda 2026-07-29), samma "edit"-krav.
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

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"), inte kontoåtkomst/medlemskap. Mirror av
// getSharedChildrenData/completeSharedChildTodo-mönstret ovan, men
// generaliserat till VILKA exponerade medlemmar som helst (inte bara ett
// barn) och till FLERA konton samtidigt (findAcceptedConnectionFrom, en
// post per konto som exponerar till mig).
export async function getConnectionTodos(callerAccountId: string, callerMemberId: string | null) {
  await requireMember(callerMemberId, callerAccountId);
  const accountsExposingToMe = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: callerAccountId, status: "accepted" } }
  });

  const results = [];
  for (const account of accountsExposingToMe) {
    const conn = findAcceptedConnectionFrom(callerAccountId, account);
    if (!conn || !conn.dataScope.todos || conn.exposedMemberIds.length === 0) continue;
    const accountTodos = await getAllTodos(account.id);
    const exposedSet = new Set(conn.exposedMemberIds);
    // Familje-todos (assignedTo:null) inkluderas nu också (2026-08-01,
    // Zaidas önskemål om att kunna lägga till en ny uppgift "förinställd på
    // familjen" via en Familjeanslutning) — tidigare bara todos tilldelade
    // en EXPONERAD medlem specifikt. En familje-todo har ingen enskild
    // mottagare att pröva mot exposedSet, den hör naturligt hemma i samma
    // pool som cross-account-varianten (getCrossAccountFamilyTodos) redan
    // visar utan medlemsfiltrering.
    const todos = accountTodos.filter(
      (t) =>
        t.deletedAt === null &&
        t.recurrence.type === "none" &&
        (t.assignedTo === null || exposedSet.has(t.assignedTo))
    );
    results.push({ accountId: account.id, accountName: account.name, access: conn.access, todos });
  }
  return results;
}

// Lägg till en ny uppgift "förinställd på familjen" (2026-08-01, Zaidas
// önskemål: "precis som i min egen todo-vy... samma gäller inköpslistan,
// recept") — en minimal, kontobred familje-todo (assignedTo:null, samma
// koncept som ADR 2026-07-23s "Familjen"-tilldelning), skapad direkt i
// MÅLKONTOT istället för mitt eget. createdBy måste vara ett riktigt
// Member.id i målkontot (schemat kräver det, se Todo.ts) — för Mina
// familjekonton är det redan MIN egen medlemspost där; för en
// Familjeanslutning finns ingen sådan (jag är aldrig medlem där), så den
// första exponerade medlemmen används som en pragmatisk platshållare
// (samma val som redan görs för connection-mutationer på andra ställen).
function buildFamilyWideTodo(accountId: string, createdBy: string, title: string, visualValue: string | null) {
  return createTodo({
    id: `todo-${crypto.randomUUID()}`,
    accountId,
    title,
    createdBy,
    assignedTo: null,
    isShared: false,
    status: "pending",
    starValue: 0,
    visual: { type: "lucide-icon", value: visualValue || "⭐" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    visibleFrom: null,
    expiresAt: null,
    deletedAt: null,
    deletedBy: null,
    personalCategoryId: null,
    notes: null
  });
}

export async function createCrossAccountFamilyTodo(
  callerUserId: string,
  targetAccountId: string,
  title: string,
  visualValue: string | null
) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return buildFamilyWideTodo(targetAccountId, memberInTarget.id, title, visualValue);
}

export async function createConnectionTodo(
  targetAccountId: string,
  callerAccountId: string,
  callerMemberId: string,
  title: string,
  visualValue: string | null
) {
  await requireMember(callerMemberId, callerAccountId);
  const targetAccount = await AccountModel.findOne({ id: targetAccountId });
  if (!targetAccount) {
    throw new AppError(404, "Kontot hittades inte");
  }
  const conn = findAcceptedConnectionFrom(callerAccountId, targetAccount);
  if (!conn || !conn.dataScope.todos || conn.access !== "edit" || conn.exposedMemberIds.length === 0) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return buildFamilyWideTodo(targetAccountId, conn.exposedMemberIds[0], title, visualValue);
}

async function requireEditableConnectionTodo(targetAccountId: string, callerAccountId: string, callerMemberId: string) {
  await requireMember(callerMemberId, callerAccountId);
  const targetAccount = await AccountModel.findOne({ id: targetAccountId });
  if (!targetAccount) {
    throw new AppError(404, "Kontot hittades inte");
  }
  const conn = findAcceptedConnectionFrom(callerAccountId, targetAccount);
  if (!conn || !conn.dataScope.todos || conn.access !== "edit") {
    throw new AppError(403, "Åtkomst nekad");
  }
  return conn;
}

export async function completeConnectionTodo(
  targetAccountId: string,
  todoId: string,
  callerAccountId: string,
  callerMemberId: string,
  elapsedMs: number | null
) {
  const conn = await requireEditableConnectionTodo(targetAccountId, callerAccountId, callerMemberId);
  const todo = await TodoModel.findOne({ id: todoId, accountId: targetAccountId });
  if (!todo || !todo.assignedTo || !conn.exposedMemberIds.includes(todo.assignedTo)) {
    throw new AppError(404, "Todo hittades inte");
  }
  // Anropas i den ANDRA familjens konto, med en riktig medlem DÄR (samma
  // väg som completeCrossAccountFamilyTodo) — hittar min egen medlemspost
  // om jag råkar vara medlem där också, annars finns ingen sådan väg för en
  // ren FamilyConnection (jag är inte medlem där) och completeTodo måste
  // därför köras med den TILLDELADE medlemmens egen identitet, samma mönster
  // som completeSharedChildTodo redan etablerat för barn.
  await completeTodo(todoId, targetAccountId, todo.assignedTo, elapsedMs);
}

export async function approveConnectionTodo(
  targetAccountId: string,
  todoId: string,
  callerAccountId: string,
  callerMemberId: string
) {
  const conn = await requireEditableConnectionTodo(targetAccountId, callerAccountId, callerMemberId);
  const todo = await TodoModel.findOne({ id: todoId, accountId: targetAccountId });
  if (!todo || !todo.assignedTo || !conn.exposedMemberIds.includes(todo.assignedTo) || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  todo.status = "approved";
  todo.approvedBy = callerMemberId;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  if (todo.starValue) {
    await MemberModel.updateOne({ id: todo.assignedTo }, { $inc: { approvedStars: todo.starValue } });
    broadcastMembersChanged();
  }
  broadcastTodosChanged();
}

export async function rejectConnectionTodo(
  targetAccountId: string,
  todoId: string,
  callerAccountId: string,
  callerMemberId: string,
  reason: string | null
) {
  const conn = await requireEditableConnectionTodo(targetAccountId, callerAccountId, callerMemberId);
  const todo = await TodoModel.findOne({ id: todoId, accountId: targetAccountId });
  if (!todo || !todo.assignedTo || !conn.exposedMemberIds.includes(todo.assignedTo) || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  const encryptedReason = encryptNullable(targetAccountId, reason) ?? null;
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
  todo.rejectedBy = callerMemberId;
  todo.rejectedAt = new Date().toISOString();
  todo.rejectedReason = encryptedReason;
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
    notes: encryptNullable(input.accountId, input.notes) ?? null,
    subtasks: input.subtasks?.map((s) => ({ ...s, title: encryptField(input.accountId, s.title) }))
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

// Massradering i "Mina uppgifter" (2026-08-03, Zaidas önskemål): en uppgift
// som INTE är min egen — någon annan skapade den och tilldelade mig den —
// ska bara sluta vara tilldelad mig, inte raderas (familjens uppgifter ska
// bara gå att ta bort från Hem-vyns familjeflik, se getFamilyViewTodos).
// Egen, snäv självbetjänings-endpoint istället för att bredda canEditTodo
// (som kräver createdBy===mig eller canEditAnyTodos) — bara den som
// FAKTISKT är tilldelad todon just nu får ta bort sig själv, ingen generell
// redigeringsrätt krävs eller ges, samma "smal, självbetjänad kontroll"-
// mönster som toggleInProgress ovan.
export async function unassignSelf(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  await requireMember(memberId, accountId);
  if (todo.assignedTo !== memberId) {
    throw new AppError(403, "Åtkomst nekad");
  }
  todo.assignedTo = null;
  // Kategorin är alltid privat oavsett tilldelning (ADR-0019/getFamilyViewTodos)
  // — utan att nollställa den skulle uppgiften bli osynlig både i Mina
  // uppgifter (inte längre tilldelad mig) OCH i Hem-vyns familjeflik
  // (fortfarande "privat" via personalCategoryId) — tyst försvinna.
  todo.personalCategoryId = null;
  await todo.save();
  broadcastTodosChanged();
  return { ok: true };
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
  if (patch.subtasks !== undefined) {
    patch.subtasks = patch.subtasks.map((s) => ({ ...s, title: encryptField(accountId, s.title) }));
  }

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

// ADR-0025 (2026-07-23, Zaidas beslut): explicit, permanent tömning av
// papperskorgen — ett medvetet undantag från "aldrig hard delete"-regeln,
// scopat strikt till todos som redan gått igenom mjuk radering. Riktig
// deleteMany, ingen väg tillbaka.
export async function purgeTrash(accountId: string, memberId: string | null) {
  const member = await requireMember(memberId, accountId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, "canRestoreFromTrash")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  await TodoModel.deleteMany({ accountId, deletedAt: { $ne: null } });
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
  // Recept-integration (2026-07-25, ADR-0028) — ett tidsstyrt delmoment
  // (t.ex. "sätt in i ugnen, 25 min") startar sin nedräkning automatiskt
  // här, samma stund det bockas av. Klienten mäter/visar (samma princip
  // som ADR-0018), servern bara stämplar start-/nollställningstiden.
  if (subtask.timedMinutes != null) {
    subtask.timerStartedAt = subtask.done ? new Date().toISOString() : null;
  }
  todo.markModified("subtasks");
  await todo.save();
  broadcastTodosChanged();
  return { done: subtask.done, timerStartedAt: subtask.timerStartedAt ?? null };
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
