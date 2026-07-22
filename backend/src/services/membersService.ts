import bcrypt from "bcryptjs";
import crypto from "crypto";
import { MemberModel } from "../db/models/Member.js";
import { UserModel, setChildCredentialsSchema } from "../db/models/User.js";
import { AppError } from "../utils/errors.js";
import { CreateMemberBodySchema, MemberPatchSchema } from "../../../shared/schemas.js";
import { getAllRoles } from "./rolesService.js";
import { canManageChildAccount, hasPermission } from "../../../shared/permissions.js";

export async function getAllMembers(accountId: string) {
  return MemberModel.find({ accountId }, { _id: 0, __v: 0 });
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
  "todoThreadRange",
  "calendarFilterSettings"
]);

// dashboardTheme/childTimelineSettings sätts antingen av medlemmen själv
// (temaväljaren i headern, alltid currentMember.id) ELLER av en förälder med
// canManageChildTodos som öppnar temaväljaren/tidslinje-inställningarna från
// ETT BARNS dashboard/ChildSettings.tsx (samma canManageChildAccount-mönster
// som redan styr complete/approve/reject på ett barns todos, ADR-0016) —
// aldrig av en obesläktad admin på en annan vuxens vägnar.
const CHILD_MANAGEABLE_FIELDS = new Set(["dashboardTheme", "childTimelineSettings"]);

export async function updateMember(id: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const patch = MemberPatchSchema.parse(data);
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }

  const fields = Object.keys(patch);
  const isOwnNavState = callerMemberId === id && fields.every((f) => SELF_NAV_FIELDS.has(f));
  const isOwnTheme = callerMemberId === id && fields.every((f) => f === "dashboardTheme");

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
