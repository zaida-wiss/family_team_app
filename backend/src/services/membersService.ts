import bcrypt from "bcryptjs";
import crypto from "crypto";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { UserModel, setChildCredentialsSchema } from "../db/models/User.js";
import { AppError } from "../utils/errors.js";
import { CreateMemberBodySchema, MemberPatchSchema } from "../../../shared/schemas.js";
import { getAllRoles } from "./rolesService.js";
import { canManageChildAccount, hasPermission } from "../../../shared/permissions.js";
import { findAcceptedConnectionFrom } from "./familyConnectionsService.js";

function toMemberSummary(m: { id: string; name: string; avatarUrl?: string | null; color?: string | null; isChild?: boolean }) {
  return { id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null, color: m.color ?? null, isChild: !!m.isChild };
}

// 2026-08-10: kontonivå-avatar cascadar hit — en medlem utan egen
// avatarUrl (null, ingen per-familj-override satt) visar istället sin
// User.avatarUrl om en sådan finns. En redan explicit satt Member.avatarUrl
// har alltid företräde, opåverkad. .lean() krävs inte för korrekthet här
// (bara plain-object-fälten läses/skrivs) men är billigare än fulla
// Mongoose-dokument för en ren läs-operation.
async function resolveAvatars<T extends { avatarUrl: string | null; userId?: string | null }>(
  members: T[]
): Promise<T[]> {
  const userIds = [...new Set(members.filter((m) => m.avatarUrl === null && m.userId).map((m) => m.userId as string))];
  if (userIds.length === 0) {
    return members;
  }

  const users = await UserModel.find({ id: { $in: userIds } }, { id: 1, avatarUrl: 1, _id: 0 }).lean();
  const avatarByUserId = new Map(users.map((u) => [u.id, u.avatarUrl ?? null]));

  return members.map((m) =>
    m.avatarUrl === null && m.userId && avatarByUserId.get(m.userId)
      ? { ...m, avatarUrl: avatarByUserId.get(m.userId) ?? null }
      : m
  );
}

export async function getAllMembers(accountId: string) {
  const memberDocs = await MemberModel.find({ accountId }, { _id: 0, __v: 0 }).lean();
  return resolveAvatars(memberDocs);
}

// Mina familjekonton (2026-07-25, Zaidas önskemål: "du skall se vilka
// familjer du är med i") — alla riktiga medlemskap (Member-poster med samma
// userId) den inloggade användaren har, oavsett vilket konto man just nu
// befinner sig i. Skiljer sig från ADR-0024/dela-barn (en delnings-GRANT
// från någon annan person) — det här är egna, fullvärdiga medlemskap, samma
// lista som redan visas vid inloggning (AccountPicker.tsx) om man har fler
// än ett konto.
export async function getMyMemberships(userId: string) {
  const memberDocs = await MemberModel.find({ userId, deletedAt: null });
  const accountIds = [...new Set(memberDocs.map((m) => m.accountId).filter((id): id is string => !!id))];
  // deletedAt:null tillagt 2026-07-30 (Zaidas fynd: "jag trycker på Bekräfta
  // radering, men den försvinner inte") — deleteAccount/deleteMyCreatedAccount
  // (ADR-0007, den redan befintliga två-stegs GDPR-raderingen) rör ALDRIG
  // Member-dokumenten, bara sätter Account.deletedAt — så min egen
  // medlemspost i det raderade kontot ligger kvar (helt avsiktligt, det är
  // så mjuk radering fungerar). Utan detta filter fortsatte ett precis
  // raderat konto synas i "Mina familjekonton" som om ingenting hänt.
  const accounts = await AccountModel.find({ id: { $in: accountIds }, deletedAt: null });
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const createdByAccountId = new Map(accounts.map((a) => [a.id, a.createdBy]));
  // memberCount tillagd 2026-07-29 (radera/överlåt/gå ur familj) — behövs
  // för att avgöra om jag är den SISTA medlemmen (får då inte gå ur, se
  // leaveAccount nedan).
  const memberCounts = await MemberModel.aggregate<{ _id: string; count: number }>([
    { $match: { accountId: { $in: accountIds }, deletedAt: null } },
    { $group: { _id: "$accountId", count: { $sum: 1 } } }
  ]);
  const memberCountByAccountId = new Map(memberCounts.map((row) => [row._id, row.count]));
  return memberDocs
    .filter((m) => m.accountId && accountNameById.has(m.accountId))
    .map((m) => ({
      accountId: m.accountId as string,
      accountName: accountNameById.get(m.accountId as string) ?? "Okänt konto",
      memberId: m.id,
      isCreator: createdByAccountId.get(m.accountId as string) === m.id,
      memberCount: memberCountByAccountId.get(m.accountId as string) ?? 1
    }));
}

// Se vilka som ingår i ett av mina egna konton (2026-07-29, Zaidas önskemål:
// "se vilka som ingår i den") — gated på att anroparen faktiskt HAR ett eget,
// levande medlemskap i det kontot (userId-uppslag, samma mönster som
// childTransferService.ts/getCrossAccountFamilyTodos — inte via req.accountId/
// x-member-id, eftersom det här kontot inte nödvändigtvis är det just nu
// AKTIVA kontot).
export async function getMembersOfMyAccount(userId: string, accountId: string) {
  const caller = await MemberModel.findOne({ userId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Du är inte medlem i det kontot");
  }
  const members = await MemberModel.find({ accountId, deletedAt: null });
  return members.map(toMemberSummary);
}

// Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "om jag väljer en
// familj, då vill jag att endast den familjens kalenderhändelser, todos och
// medlemmar visas, men möjlighet att välja samtliga familjer") — samma
// hidden-loop som getCrossAccountCalendars/getCrossAccountFamilyTodos, men
// GRUPPERAT per källfamilj (inte en flat sammanslagning som kalendern) —
// Hem behöver familjens NAMN för filtrets etikett.
export async function getCrossAccountMembers(callerUserId: string, currentAccountId: string, currentMemberId: string) {
  const currentMember = await MemberModel.findOne({ id: currentMemberId, accountId: currentAccountId });
  const hidden = new Set(currentMember?.hiddenCrossAccountIds ?? []);
  const memberDocs = await MemberModel.find({ userId: callerUserId, deletedAt: null });
  const results = [];
  for (const m of memberDocs) {
    if (!m.accountId || m.accountId === currentAccountId || hidden.has(m.accountId)) continue;
    // deletedAt:null (2026-08-09, Zaidas fynd: ett raderat konto — "Wiss
    // -släkten" — fortsatte synas som en valbar familj i Hem-vyns
    // "Visa familj"-filter, trots att getMyMemberships redan filtrerade
    // bort det ur "Mina familjekonton"-inställningssidan sedan 2026-07-30.
    // deleteAccount rör aldrig Member-dokumenten (mjuk radering, ADR-0007),
    // så min egen medlemspost i det raderade kontot ligger kvar avsiktligt
    // — det är kontot som måste filtreras bort.
    const account = await AccountModel.findOne({ id: m.accountId, deletedAt: null });
    // type:"personal" exkluderat (2026-08-10, ADR-0033) — Hem-vyns
    // familjefilter handlar om FAMILJER man är med i, inte ens eget
    // personliga konto (som redan ÄR "jag", inget att filtrera till).
    if (!account || account.type === "personal") continue;
    const members = await MemberModel.find({ accountId: m.accountId, deletedAt: null });
    results.push({ accountId: m.accountId, accountName: account.name, members: members.map(toMemberSummary) });
  }
  return results;
}

// Samma familjefilter, fast för Familjeanslutningar (mirror av
// getConnectionTodos/getConnectionCalendars) — bara de SPECIFIKT exponerade
// medlemmarna, oavsett vilka av dataScope.todos/recipes/shoppingLists/
// calendars som är på (exposedMemberIds ÄR redan den avsedda avgränsningen
// för vem som syns, samma resonemang som ConnectionTodosThreads.tsx redan
// visar accountName utan en egen "members"-scope-flagga).
export async function getConnectionMembers(callerAccountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId: callerAccountId, deletedAt: null });
  if (!caller) throw new AppError(403, "Åtkomst nekad");
  const accountsExposingToMe = await AccountModel.find({
    deletedAt: null,
    familyConnections: { $elemMatch: { otherAccountId: callerAccountId, status: "accepted" } }
  });
  const results = [];
  for (const account of accountsExposingToMe) {
    const conn = findAcceptedConnectionFrom(callerAccountId, account);
    if (!conn || conn.exposedMemberIds.length === 0) continue;
    const members = await MemberModel.find({
      accountId: account.id,
      id: { $in: conn.exposedMemberIds },
      deletedAt: null
    });
    results.push({ accountId: account.id, accountName: account.name, members: members.map(toMemberSummary) });
  }
  return results;
}

// Gå ur en familj jag är medlem i, men inte har skapat (2026-07-29, Zaidas
// önskemål: "gå ur familjen"). Mjuk radering av MIN EGEN Member-post —
// self-service, kräver ingen canManageMembers-behörighet (jag rör bara min
// egen post). Två spärrar: den som SKAPADE kontot måste överlåta det först
// (annars blir kontot ägarlöst), och den SISTA kvarvarande medlemmen får
// inte gå ur (skulle lämna kontot helt utan medlemmar) — radera familjen
// istället i det fallet.
export async function leaveAccount(userId: string, accountId: string) {
  const caller = await MemberModel.findOne({ userId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Du är inte medlem i det kontot");
  }
  const account = await AccountModel.findOne({ id: accountId });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }
  if (account.createdBy === caller.id) {
    throw new AppError(400, "Du skapade den här familjen — överlåt den till någon annan innan du kan gå ur");
  }
  const remainingCount = await MemberModel.countDocuments({ accountId, deletedAt: null });
  if (remainingCount <= 1) {
    throw new AppError(400, "Du är den sista medlemmen i familjen — radera familjen istället");
  }
  caller.deletedAt = new Date().toISOString();
  caller.deletedBy = caller.id;
  await caller.save();
}

async function requireManager(accountId: string, memberId: string | null) {
  const caller = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canManageMembers")) {
    throw new AppError(403, "Åtkomst nekad");
  }
}

// Säkerhetsfynd 2026-07-22 (samma klass som ADR-0009/ADR-0016/timedTasks/
// shoppingService): createMember/updateMember/deleteMember/restoreMember
// saknade all server-side behörighetskontroll — vilken inloggad medlem som
// helst i kontot (inklusive ett inloggat BARN, se barn-inloggningen samma
// dag) kunde skapa nya medlemmar eller ändra/radera/återställa VILKEN ANNAN
// MEDLEM SOM HELST, oavsett canManageMembers. Klienten (AccountSettings.tsx)
// gömde bara knapparna, inget skydd mot ett direkt API-anrop.
export async function createMember(accountId: string, callerMemberId: string | null, data: unknown) {
  await requireManager(accountId, callerMemberId);
  const patch = CreateMemberBodySchema.parse(data);
  const member = new MemberModel({
    id: `member-${crypto.randomUUID()}`,
    accountId,
    userId: null,
    ...patch,
    spentStars: 0,
    approvedStars: 0,
    deletedAt: null,
    deletedBy: null
  });
  await member.save();
  return { id: member.id };
}

// MemberPatchSchema blandar identitetsfält (name/roleId/avatarUrl/color/
// spentStars) med rena nav-/UI-inställningar (lastActivePanel/calendarView/
// todoViewMode/todoThreadOrder/todoThreadRange/calendarFilterSettings) som
// VARJE medlem — inklusive barn — måste kunna sätta för SIG SJÄLVA hela
// tiden, utan canManageMembers (annars slås den vanliga self-service-
// navigeringen sönder). roleId är MEDVETET INTE självbetjänat trots att man
// tekniskt "äger sig själv" — annars kunde en medlem självutnämna sig till en
// mer priviligierad roll (samma risk ADR-0009 en gång fixade).
const SELF_NAV_FIELDS = new Set([
  "lastActivePanel",
  "lastSelectedDashboardMemberId",
  "calendarView",
  "todoViewMode",
  "todoThreadOrder",
  "todoBubbleOrder",
  "recurringTemplateOrder",
  "taskTemplateOrder",
  "familyThreadOrder",
  "todoThreadRange",
  "todoThreadGap",
  "todoBubbleSize",
  "shoppingShowCompletedDefault",
  "calendarFilterSettings",
  // Mina familjekonton (2026-07-25) — vilka av mina EGNA andra medlemskap
  // som ska döljas i cross-account-vyer, se todosService.ts:s
  // getCrossAccountFamilyTodos.
  "hiddenCrossAccountIds",
  // Hem-vyns familjefilter (2026-07-31) — senast valda familj i "Visa
  // familj"-väljaren, se MemberOverview.tsx.
  "homeSelectedFamilyId",
  // Todos-panelens Barn-tråd, av som standard (2026-07-31) — se
  // ParentTodoThreadView.tsx.
  "showChildTodosInOwnView"
]);

// dashboardTheme/childTimelineSettings sätts antingen av medlemmen själv
// (temaväljaren i headern, alltid currentMember.id) ELLER av en förälder med
// canManageChildTodos som öppnar temaväljaren/tidslinje-inställningarna från
// ETT BARNS dashboard/ChildSettings.tsx (samma canManageChildAccount-mönster
// som redan styr complete/approve/reject på ett barns todos, ADR-0016) —
// aldrig av en obesläktad admin på en annan vuxens vägnar.
const CHILD_MANAGEABLE_FIELDS = new Set(["dashboardTheme", "darkMode", "textSize", "childTimelineSettings"]);
// darkMode (2026-07-23) är en oberoende på/av-växel ovanpå dashboardTheme
// (se ThemePicker.tsx) — samma självbetjänings-/förälder-styr-barnets-tema-
// resonemang som dashboardTheme redan har, se kommentaren ovan. textSize
// (2026-07-25) samma mönster igen, men gäller ALLA medlemmar (inte bara
// vuxenteman som darkMode) — läsbarhet är inte kopplad till temats liv/färg.
const SELF_THEME_FIELDS = new Set(["dashboardTheme", "darkMode", "textSize"]);

export async function updateMember(id: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const patch = MemberPatchSchema.parse(data);
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }

  const fields = Object.keys(patch);
  const isOwnNavState = callerMemberId === id && fields.every((f) => SELF_NAV_FIELDS.has(f));
  const isOwnTheme = callerMemberId === id && fields.every((f) => SELF_THEME_FIELDS.has(f));

  if (!isOwnNavState && !isOwnTheme) {
    const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
    if (!caller) {
      throw new AppError(403, "Åtkomst nekad");
    }
    const roles = await getAllRoles(accountId);
    const isChildManagedByCaller =
      fields.every((f) => CHILD_MANAGEABLE_FIELDS.has(f)) && canManageChildAccount(caller, member, roles);
    if (!isChildManagedByCaller && !hasPermission(caller, roles, "canManageMembers")) {
      throw new AppError(403, "Åtkomst nekad");
    }
  }

  Object.assign(member, patch);
  await member.save();
}

export async function deleteMember(id: string, accountId: string, memberId: string | null) {
  await requireManager(accountId, memberId);
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = new Date().toISOString();
  member.deletedBy = memberId;
  await member.save();
}

export async function restoreMember(id: string, accountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canRestoreFromTrash")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = null;
  member.deletedBy = null;
  await member.save();
}

// ADR-0025 (2026-07-23, Zaidas beslut): explicit, permanent tömning av
// papperskorgen — ett medvetet undantag från "aldrig hard delete"-regeln,
// scopat strikt till dokument som redan gått igenom mjuk radering. Samma
// canRestoreFromTrash-behörighet som redan gate:ar Återställ-knappen, ingen
// ny behörighetsnivå. Riktig deleteMany, ingen väg tillbaka.
export async function purgeTrash(accountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canRestoreFromTrash")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  await MemberModel.deleteMany({ accountId, deletedAt: { $ne: null } });
}

// Barn-inloggning (2026-07-22) — en förälder sätter/ändrar ett barns
// användarnamn+lösenord. Skapar barnets User första gången (Member.userId
// är null tills dess, precis som idag), uppdaterar samma User vid ändring.
// username är bara unikt INOM familjen (kontrolleras här, inte i databasen —
// User.username har inget unikt index eftersom det inte är globalt unikt),
// se authService.ts:s childLogin för hur inloggningen sedan hittar rätt
// familj via förälderns e-post.
export async function setChildCredentials(
  accountId: string,
  callerMemberId: string | null,
  childMemberId: string,
  data: unknown
) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canManageMembers")) {
    throw new AppError(403, "Åtkomst nekad");
  }

  const child = await MemberModel.findOne({ id: childMemberId, accountId, deletedAt: null });
  if (!child || !child.isChild) {
    throw new AppError(404, "Barnet hittades inte");
  }

  const { username, password } = setChildCredentialsSchema.parse(data);
  const normalizedUsername = username.toLowerCase();

  const siblingChildren = await MemberModel.find({
    accountId,
    isChild: true,
    deletedAt: null,
    id: { $ne: childMemberId }
  });
  const siblingUserIds = siblingChildren
    .map((m) => m.userId)
    .filter((id): id is string => id !== null);
  if (siblingUserIds.length > 0) {
    const clash = await UserModel.findOne({ id: { $in: siblingUserIds }, username: normalizedUsername });
    if (clash) {
      throw new AppError(409, "Användarnamnet är redan taget av ett annat barn i familjen");
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (child.userId) {
    const existingUser = await UserModel.findOne({ id: child.userId });
    if (!existingUser) {
      throw new AppError(404, "Användaren hittades inte");
    }
    existingUser.username = normalizedUsername;
    existingUser.passwordHash = passwordHash;
    existingUser.tokenVersion += 1; // Loggar ut alla befintliga sessioner vid lösenordsbyte
    await existingUser.save();
    return { id: existingUser.id, username: normalizedUsername };
  }

  const newUser = new UserModel({
    id: `user-${crypto.randomUUID()}`,
    email: null,
    username: normalizedUsername,
    passwordHash,
    name: child.name,
    createdAt: new Date().toISOString(),
    tokenVersion: 0
  });
  await newUser.save();
  child.userId = newUser.id;
  await child.save();
  return { id: newUser.id, username: normalizedUsername };
}
