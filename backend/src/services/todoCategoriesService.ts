import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { TodoModel } from "../db/models/Todo.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";

// Kontobreda (2026-07-07, Zaidas beslut) — tidigare strikt privata per medlem.
// Nu: alla VUXNA i kontot ser och kan redigera/döpa om/radera/gömma varandras
// kategorier (barnen har ingen egen åtkomst till dessa vyer överhuvudtaget, så
// bara vuxna behöver kunna hantera dem). `memberId` behålls på varje kategori
// som skapar-metadata (vem som gjorde den), inte längre som en åtkomstspärr.
export async function requireAdultMember(memberId: string | null | undefined, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const role = await RoleModel.findOne({ id: member.roleId });
  if (role?.isChildRole) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

export async function getAllCategories(accountId: string) {
  return TodoCategoryModel.find(
    { accountId, deletedAt: null },
    { _id: 0, __v: 0 }
  ).sort({ createdAt: 1 });
}

export async function createCategory(accountId: string, memberId: string, name: string, isFamily = false) {
  await requireAdultMember(memberId, accountId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const category = await TodoCategoryModel.create({
    id: `todo-category-${crypto.randomUUID()}`,
    accountId,
    memberId,
    name: trimmed,
    createdAt: new Date().toISOString(),
    isFamily,
    deletedAt: null,
    deletedBy: null
  });
  return category.toObject();
}

// Duplicerad från todosService.ts:s identiska helper (medvetet, inte
// importerad — todosService.ts importerar redan FRÅN den här filen, ett
// tvärimport åt andra hållet hade blivit en cirkelimport).
async function isChildMemberId(memberId: string | null): Promise<boolean> {
  if (!memberId) return false;
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) return false;
  if (member.isChild) return true;
  const role = await RoleModel.findOne({ id: member.roleId });
  return role?.isChildRole === true;
}

async function findCategoryInAccount(id: string, accountId: string) {
  const category = await TodoCategoryModel.findOne({ id, accountId, deletedAt: null });
  if (!category) {
    throw new AppError(404, "Kategori hittades inte");
  }
  return category;
}

export async function renameCategory(id: string, accountId: string, memberId: string, name: string) {
  await requireAdultMember(memberId, accountId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const category = await findCategoryInAccount(id, accountId);
  category.name = trimmed;
  await category.save();
  return { ok: true };
}

// Gömd (2026-07-05) — skiljer sig från deleteCategory: kategorin syns inte i
// tråd-vyn men finns kvar oförändrad, kan visas igen via setCategoryHidden(false).
export async function setCategoryHidden(id: string, accountId: string, memberId: string, hidden: boolean) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.hidden = hidden;
  await category.save();
  return { ok: true };
}

// Dölj i familjens veckoöversikt (2026-08-30) — se shared/types.ts:s
// kommentar för skillnaden mot setCategoryHidden ovan.
export async function setCategoryExcludeFromWeekOverview(
  id: string, accountId: string, memberId: string, exclude: boolean
) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.excludeFromWeekOverview = exclude;
  await category.save();
  return { ok: true };
}

// Auto-samlingskategori (2026-08-06, Zaidas önskemål: "detsamma gäller i
// min egen todo-vy. Okategoriserade uppgifter skall skapa 'Mina
// uppgifter'" — samma mekanism som familjevyns samlingskategori, bara
// namngiven annorlunda) — en RIKTIG, sparad TodoCategory, inte bara ett
// tomt fält — går att byta namn på/gömma/radera som vilken annan kategori,
// men skapas automatiskt om den saknas när det finns okategoriserade
// uppgifter. Exporterad — används både av deleteCategory nedan OCH av
// todosService.ts:s createTodo/updateTodo (en uppgift som sparas utan
// personalCategoryId löser sig hit direkt, inte bara vid en
// kategoriradering).
//
// FAMILJE-samlingskategorin (isFamily:true) är EN delad per konto,
// namngiven efter kontots namn (Inställningar → Konto) — Hem-vyns
// familjekategorier visas redan kontobrett, ingen ägarfiltrering.
//
// PERSONLIGA samlingskategorin (isFamily:false) är däremot EN PER MEDLEM
// (scopead på memberId) — till skillnad från familjekategorier filtrerar
// ParentTodoThreadView.tsx:s kolumner personliga kategorier på
// `category.memberId === currentMember.id` (för att inte visa andra
// vuxnas tomma kategorier som klutter, se "myCategories" i
// ParentTodoThreadView.tsx). En delad, kontobred kategori hade alltså bara
// synts för den som råkade skapa den först — varje vuxen behöver sin EGEN.
//
// Namnet (2026-08-14, Zaidas beslut vid utökningen till "alltid en
// kategori", se CLAUDE.md-historiken) är numera kontots namn för BÅDA
// varianterna (t.ex. "Familjen Wiss Kolmodin") — tidigare hette den
// personliga varianten alltid bokstavligen "Mina uppgifter". Att en vuxen
// kan vara medlem i FLERA familjekonton (Mina familjekonton) gör
// kontonamnet nödvändigt för att skilja åt vilken familjs samlingskategori
// man tittar på, exakt samma skäl som familjevarianten redan hade.
export async function getOrCreateUncategorizedCollector(accountId: string, memberId: string, isFamily: boolean) {
  const existing = await TodoCategoryModel.findOne({
    accountId,
    ...(isFamily ? {} : { memberId }),
    isFamily,
    isUncategorizedCollector: true,
    deletedAt: null
  });
  if (existing) return existing;

  const account = await AccountModel.findOne({ id: accountId });
  const name = account?.name ?? "Familjen";
  const category = await TodoCategoryModel.create({
    id: `todo-category-${crypto.randomUUID()}`,
    accountId,
    memberId,
    name,
    createdAt: new Date().toISOString(),
    isFamily,
    isUncategorizedCollector: true,
    deletedAt: null,
    deletedBy: null
  });
  return category;
}

// Zaidas önskemål 2026-08-06: "om en kategori raderas... alla som var i den
// kategorin nu få ett tomt fält i kategori-kolumnen, dessa okategoriserade
// uppgifter skall sedan samlas upp i en samlingskategori" — tidigare rörde
// deleteCategory bara kategorin själv, todos som pekade på den (via
// personalCategoryId) blev tysta, trasiga referenser (osynliga i tråd-vyn,
// utan varken varning eller väg tillbaka). Nu flyttas de till den riktiga
// samlingskategorin ovan (get-or-create) — men bara om det FAKTISKT fanns
// uppgifter kvar (annars inget att samla) och bara om det INTE är
// samlingskategorin SJÄLV som raderas (då nollställs dess uppgifter
// istället — nästa kategoriradering av samma typ med kvarvarande
// uppgifter skapar en ny åt dem).
//
// En FAMILJEKATEGORI har EN delad samlingskategori för hela kontot — ett
// enda updateMany räcker. En PERSONLIG kategori kan däremot ha uppgifter
// SKAPADE av flera olika vuxna (kategorier är kontobreda sedan ADR-0019,
// vem som helst kan lägga en uppgift i vilken kategori som helst) — var och
// en har sin EGEN "Mina uppgifter" (se getOrCreateUncategorizedCollector
// ovan, samma createdBy-baserade tillhörighet som resolvePersonalCategoryId
// i todosService.ts redan använder vid skapande). Ett barn-tilldelat
// personligt-kategoriserat todo (ett teoretiskt men möjligt fall — Barn-
// tråden bryr sig aldrig om personalCategoryId) nollställs istället, samma
// "aldrig peka på ett barns kategori"-princip.
export async function deleteCategory(id: string, accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.deletedAt = new Date().toISOString();
  category.deletedBy = memberId;
  await category.save();

  const affected = await TodoModel.find(
    { accountId, personalCategoryId: id, deletedAt: null },
    { _id: 0, id: 1, assignedTo: 1, createdBy: 1 }
  );
  if (affected.length === 0) {
    return { ok: true, uncategorizedCount: 0 };
  }

  if (category.isUncategorizedCollector) {
    // Samlingskategorin raderas själv — nollställ, omdirigera aldrig till
    // sig själv. Nästa kategoriradering av samma typ skapar en ny.
    await TodoModel.updateMany(
      { accountId, personalCategoryId: id, deletedAt: null },
      { $set: { personalCategoryId: null } }
    );
  } else if (category.isFamily) {
    const collector = await getOrCreateUncategorizedCollector(accountId, memberId, true);
    await TodoModel.updateMany(
      { accountId, personalCategoryId: id, deletedAt: null },
      { $set: { personalCategoryId: collector.id } }
    );
  } else {
    const collectorsByCreator = new Map<string, string>();
    for (const todo of affected) {
      if (await isChildMemberId(todo.assignedTo)) {
        await TodoModel.updateOne({ id: todo.id }, { $set: { personalCategoryId: null } });
        continue;
      }
      const creatorId = todo.createdBy ?? memberId;
      if (!collectorsByCreator.has(creatorId)) {
        const collector = await getOrCreateUncategorizedCollector(accountId, creatorId, false);
        collectorsByCreator.set(creatorId, collector.id);
      }
      await TodoModel.updateOne({ id: todo.id }, { $set: { personalCategoryId: collectorsByCreator.get(creatorId) } });
    }
  }
  return { ok: true, uncategorizedCount: affected.length };
}
