import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { AccountModel } from "../db/models/Account.js";
import { TodoModel } from "../db/models/Todo.js";
import { CalendarModel } from "../db/models/Calendar.js";
import { RewardModel } from "../db/models/Reward.js";
import { PurchasedRewardModel } from "../db/models/PurchasedReward.js";
import { TimedTaskModel } from "../db/models/TimedTask.js";
import { AppError } from "../utils/errors.js";
import { getAllRoles } from "./rolesService.js";
import { canManageChildShares } from "../../../shared/permissions.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import { writeAuditLog } from "./auditLogService.js";
import { broadcastMembersChanged } from "../realtime/memberEvents.js";
import { broadcastTodosChanged } from "../realtime/todoEvents.js";
import type { CalendarEvent } from "../../../shared/types.js";

// Överför ett barn PERMANENT till en annan familjs konto (2026-07-27, Zaidas
// önskemål: "jag ska även kunna... överföra dem till andra familjer"). Skiljer
// sig helt från childSharesService.ts:s delning (ADR-0024, revocerbar
// åtkomst-GRANT) — detta är en oåterkallelig flytt av själva medlemskapet:
// barnets accountId ändras, och all data KOPPLAD TILL BARNET flyttar med
// (Zaidas uttryckliga val: "allt flyttar med"). Samma behörighetsgräns som
// delning (canManageChildShares — caller måste vara i barnets EGET konto med
// canManageMembers), plus samma "hitta mottagaren via e-post"-uppslag
// (childSharesService.lookupShareCandidate, återanvänds oförändrad).
//
// KRITISKT att komma ihåg vid framtida ändringar här: Todo/CalendarEvent/
// Reward-titlar (och todos rejectedReason/notes) är fält-krypterade (ADR-0014)
// med en nyckel DETERMINISTISKT härledd från accountId (fieldEncryption.ts).
// Att bara byta accountId på ett dokument UTAN att dekryptera-och-återkryptera
// dess textfält gör dem PERMANENT oläsbara (fel nyckel, GCM-autentiseringen
// underkänns) — varje flyttad post måste därför uttryckligen räkna om sina
// krypterade fält mot MÅL-kontots nyckel, inte bara skriva över accountId.

function reencryptField(sourceAccountId: string, targetAccountId: string, value: string): string {
  return encryptField(targetAccountId, decryptField(sourceAccountId, value));
}

function reencryptNullable(sourceAccountId: string, targetAccountId: string, value: string | null): string | null {
  return encryptNullable(targetAccountId, decryptNullable(sourceAccountId, value)) ?? null;
}

async function requireMember(memberId: string | null, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

// Steg 1 — samma slags uppslag som childSharesService.lookupShareCandidate,
// men en egen kopia hade dubblerat identisk logik i onödan. Frontend
// återanvänder membersApi.lookupShareCandidate rakt av för överförings-
// flödet också (samma "sök en vuxen via e-post"-formulär).

export async function transferChild(
  childId: string,
  sourceAccountId: string,
  callerMemberId: string | null,
  targetMemberId: string,
  targetAccountId: string
) {
  const caller = await requireMember(callerMemberId, sourceAccountId);
  const child = await MemberModel.findOne({ id: childId, accountId: sourceAccountId, deletedAt: null, isChild: true });
  if (!child) {
    throw new AppError(404, "Barnet hittades inte");
  }
  const roles = await getAllRoles(sourceAccountId);
  if (!canManageChildShares(caller, child, roles)) {
    throw new AppError(403, "Åtkomst nekad");
  }
  if (targetAccountId === sourceAccountId) {
    throw new AppError(400, "Barnet tillhör redan det kontot");
  }

  const targetMember = await MemberModel.findOne({ id: targetMemberId, accountId: targetAccountId, deletedAt: null, isChild: false });
  if (!targetMember) {
    throw new AppError(404, "Mottagaren hittades inte");
  }
  const targetAccount = await AccountModel.findOne({ id: targetAccountId });
  if (!targetAccount) {
    throw new AppError(404, "Målkontot hittades inte");
  }
  const targetChildRole = await RoleModel.findOne({ accountId: targetAccountId, isChildRole: true });
  if (!targetChildRole) {
    throw new AppError(500, "Målkontot saknar en barnroll — kan inte slutföra överföringen");
  }

  // Barnets egen medlemspost — accountId+roleId byts till målkontots. Allt
  // annat på Member-dokumentet (namn, avatar, tema, stjärnor, delningar via
  // childSharedWith, nav-inställningar) flyttar automatiskt med eftersom det
  // redan ligger PÅ dokumentet, ingen separat hantering behövs.
  child.accountId = targetAccountId;
  child.roleId = targetChildRole.id;
  await child.save();

  // Todos — assignedTo ELLER createdBy (en självskapad+självtilldelad uppgift
  // är ovanligt för ett barn, men strukturellt möjligt) pekar på barnet.
  const todos = await TodoModel.find({ accountId: sourceAccountId, $or: [{ assignedTo: childId }, { createdBy: childId }] });
  for (const todo of todos) {
    todo.accountId = targetAccountId;
    todo.title = reencryptField(sourceAccountId, targetAccountId, todo.title);
    todo.rejectedReason = reencryptNullable(sourceAccountId, targetAccountId, todo.rejectedReason ?? null);
    todo.notes = reencryptNullable(sourceAccountId, targetAccountId, todo.notes ?? null);
    await todo.save();
  }

  // Kalendrar barnet ÄGER (inte kalendrar barnet bara delats in i, de hör
  // fortfarande till sin ursprungliga ägare i det gamla kontot). Subscriptions/
  // calDavConnections (externa integrationers krypterade hemligheter) strippas
  // MEDVETET vid en överföring istället för att återkrypteras — en extern ICS-
  // prenumeration eller ett Apple-CalDAV-konto tillhör den person som satte
  // upp den, inte något som rimligen "följer med" ett barn till en annan
  // familj, och att bara flytta dem obehandlade hade lämnat permanent oläsbar
  // krypterad data kvar i dokumentet.
  const calendars = await CalendarModel.find({ accountId: sourceAccountId, ownerId: childId });
  for (const calendar of calendars) {
    calendar.accountId = targetAccountId;
    // event är typad som ren CalendarEvent men är i praktiken ett Mongoose-
    // subdokument — ett rått spread missar fälten (samma fälla som
    // calendarsService.ts:s updateEvent redan dokumenterat löste, 2026-07-15).
    calendar.events = calendar.events.map((event) => {
      const plain = (event as unknown as { toObject(): CalendarEvent }).toObject();
      return {
        ...plain,
        title: reencryptField(sourceAccountId, targetAccountId, plain.title),
        notes: reencryptNullable(sourceAccountId, targetAccountId, plain.notes)
      };
    });
    calendar.subscriptions = [];
    calendar.calDavConnections = [];
    await calendar.save();
  }

  // Önskningar (Reward.wishedBy) — titel krypterad, samma mönster som todos.
  const rewards = await RewardModel.find({ accountId: sourceAccountId, wishedBy: childId });
  for (const reward of rewards) {
    reward.accountId = targetAccountId;
    reward.title = reencryptField(sourceAccountId, targetAccountId, reward.title);
    await reward.save();
  }

  // Köpta belöningar — itemTitle/itemSymbol är INTE krypterade (en ögonblicks-
  // kopia av köptillfället, redan klartext i modellen), bara accountId behöver
  // uppdateras.
  await PurchasedRewardModel.updateMany({ accountId: sourceAccountId, memberId: childId }, { $set: { accountId: targetAccountId } });

  // Tidtagna uppgifter — TimedAttempt saknar helt eget accountId-fält (nås
  // alltid via timedTaskId, se timedTasksService.ts:s getAttemptsForTask) så
  // de "flyttar med" automatiskt utan egen uppdatering här.
  await TimedTaskModel.updateMany({ accountId: sourceAccountId, assignedTo: childId }, { $set: { accountId: targetAccountId } });

  // Revisionsloggen flyttas MEDVETET INTE — varje post beskriver en händelse
  // som skedde i käll-kontot (vem godkände, vem köpte åt vem), och refererar
  // medlems-id:n som bara är meningsfulla DÄR. En ny post skrivs i BÅDA
  // kontona som markerar själva överföringen istället för att låtsas att den
  // gamla historiken hörde hemma i det nya kontot.
  await writeAuditLog(sourceAccountId, "child_transferred", callerMemberId, `${child.name} överfördes till ${targetAccount.name}`);
  await writeAuditLog(targetAccountId, "child_transferred", callerMemberId, `${child.name} togs emot från ett annat konto`);

  broadcastMembersChanged();
  broadcastTodosChanged();

  return { ok: true };
}
