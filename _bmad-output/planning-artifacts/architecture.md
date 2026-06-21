# Architecture: Familje- och teamapp

## 1. Syfte

Detta dokument beskriver hur appen bor byggas tekniskt i forsta versionen. Fokus ar att gora datamodellen tydlig, behorighetsreglerna testbara och barnens beloningsbana mojlig att bygga utan specialfall overallt i koden.

## 2. Rekommenderad MVP-arkitektur

Forsta versionen bor byggas som en frontend-first app:

- React
- TypeScript
- Lucide-ikoner
- Lokal statehantering i komponenter eller en liten central store
- `localStorage` eller liknande enkel lagring for prototyp/MVP
- Senare backend nar datamodell och floden sitter

Varfor: appen har manga produktregler. Om vi borjar med en tung backend direkt blir det latt att fastna i teknik innan vi har testat om flodena kanns ratt.

Vad hander om vi inte gor sa: vi riskerar att bygga databas/API for tidigt och sedan behova andra dem nar UX-besluten for barnens bana, delning och roller blir tydligare.

Alternativ:

- Fullstack direkt med databas och autentisering. Bra senare, men tyngre nu.
- Enkel HTML/CSS/JS utan TypeScript. Snabbt, men riskabelt eftersom behorigheter och delning behover tydliga typer.

## 3. Huvudmoduler

Appen bor delas upp i dessa logiska delar:

- `members`: medlemmar, avatarer, barn/vuxen, dashboardtema
- `accounts`: familjekonto/arbetsplatskonto och medlemskap
- `roles`: roller och behorigheter
- `permissions`: funktioner som svarar pa "far medlemmen gora detta?"
- `calendars`: privata/delade kalendrar, import och export
- `shoppingLists`: privata/delade inkopslistor
- `todos`: todos, schema, status, tilldelning och soft delete
- `rewards`: onskningar, beloningar, stjarnor och beloningsbana
- `trash`: mjukraderad data och aterstallning
- `ui`: dashboard, startsida, barnvy och vuxenvy

## 4. Grundprinciper

### 4.1 Roll styr generell rattighet

Roller svarar pa vad medlemmen generellt far gora.

Exempel:

```ts
role.permissions.canCreateTodos
role.permissions.canApproveTodos
role.permissions.canExportCalendar
```

### 4.2 Resursdelning styr specifik atkomst

Kalender och inkopslista ska inte bara titta pa roll. De ska ocksa kontrollera om medlemmen ager resursen eller har fatt den delad.

Exempel:

```ts
sharedWith: [
  { memberId: "member-2", access: "view" },
  { memberId: "member-3", access: "edit" }
]
```

### 4.3 Soft delete i stallet for hard delete

Data ska inte tas bort direkt. Den ska markeras:

```ts
deletedAt: string | null
deletedBy: string | null
```

Vanliga vyer filtrerar bort raderad data. Papperskorgen visar den.

### 4.4 Barnens bana bygger pa todo-status

Barnets beloningsbana ska inte ha egen frikopplad sanning. Den ska raknas fran todos och beloningar.

Regel:

- `pending`: uppgift ar aktiv eller kommande.
- `done`: barnet har tryckt klart, uppgiftsbild visas pa banan.
- `approved`: foralder/admin har godkant, uppgiftsbild blir stjarnor.
- `rejected`: uppgiften gav inga stjarnor.
- `expired`: uppgiften klarades inte i tid.

## 5. Datatyper

### 5.1 Id-typ

Alla objekt bor anvanda string-id i appen:

```ts
type Id = string;
```

Exempel:

```ts
"member-1"
"todo-42"
"calendar-3"
```

Varfor: string-id fungerar bra bade i frontend och senare backend.

## 6. Medlem

```ts
type Member = {
  id: Id;
  accountId: Id;
  name: string;
  roleId: Id;
  isChild: boolean;
  avatarUrl: string | null;
  dashboardTheme: DashboardThemeId | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};
```

Viktigt:

- `isChild` styr barn-dashboard.
- `accountId` kopplar medlemmen till familjekonto eller arbetsplatskonto.
- `roleId` styr behorigheter.
- `dashboardTheme` styr barnets valda tema.
- `avatarUrl` anvands pa startsidan.

## 7. Roll och behorigheter

```ts
type Account = {
  id: Id;
  name: string;
  type: "family" | "workplace";
  createdBy: Id;
};
```

```ts
type PermissionKey =
  | "canManageMembers"
  | "canManageRoles"
  | "canSeeAllTodos"
  | "canSeeOwnTodos"
  | "canCreateTodos"
  | "canScheduleRecurringTodos"
  | "canCompleteAssignedTodos"
  | "canEditAnyTodos"
  | "canDeleteAnyTodos"
  | "canApproveTodos"
  | "canSeeAllCalendar"
  | "canSeeOwnCalendar"
  | "canCreateCalendar"
  | "canEditCalendar"
  | "canImportCalendar"
  | "canExportCalendar"
  | "canSeeShoppingLists"
  | "canCreateShoppingLists"
  | "canEditShoppingLists"
  | "canViewTrash"
  | "canRestoreFromTrash"
  | "canCreateChildAccounts"
  | "canManageChildTodos";

type Role = {
  id: Id;
  name: string;
  permissions: Record<PermissionKey, boolean>;
};
```

Familjekontoregler:

- Kontotyp valjs nar konto skapas.
- `family` aktiverar barnkonton, stjarnor, onskningar och beloningsbana.
- `workplace` aktiverar medlemmar, roller, kalender, todos och inkopslistor utan barnfunktioner som standard.
- Barnkonton skapas inne i ett `Account` med type `family`.
- Vuxna och barn delar samma `accountId`.
- Vuxna i samma familjekonto kan hantera barnkonton enligt rollens behorigheter.
- En vuxen ska inte kunna godkanna eller fylla i uppgifter pa ett barnkonto utanfor samma konto.

Ledande fraga nar du kodar detta senare: ska UI:t skapa checkboxar manuellt, eller ska det loopa igenom en lista med `PermissionKey`? Ratt svar for den har appen ar att loopa, annars blir rollpanelen jobbig att underhalla.

## 8. Delade resurser

Kalender och inkopslista ska dela samma atkomstmodell.

```ts
type AccessLevel = "view" | "edit";

type ResourceShare = {
  memberId: Id;
  access: AccessLevel;
};

type OwnedSharedResource = {
  ownerId: Id;
  sharedWith: ResourceShare[];
  deletedAt: string | null;
  deletedBy: Id | null;
};
```

Varfor: kalender och inkopslista ska bete sig likadant. Om vi hittar pa olika regler for varje del blir behorigheterna svara att lita pa.

## 9. Kalender

```ts
type Calendar = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  events: CalendarEvent[];
  importedSources: ImportedCalendarSource[];
};

type CalendarEvent = {
  id: Id;
  calendarId: Id;
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  createdBy: Id;
  deletedAt: string | null;
  deletedBy: Id | null;
};

type ImportedCalendarSource = {
  id: Id;
  type: "ics-file";
  name: string;
  importedAt: string;
};
```

Kalenderregler:

- Agare far alltid redigera sin egen kalender.
- Delad `view` far se men inte exportera.
- Delad `edit` kan exportera om rollen ocksa har `canExportCalendar`.
- Import skapar kopior av handelser i forsta versionen.

## 10. Inkopslista

```ts
type ShoppingList = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  icon: string | null;
  items: ShoppingItem[];
};

type ShoppingItem = {
  id: Id;
  title: string;
  createdBy: Id;
  done: boolean;
  deletedAt: string | null;
  deletedBy: Id | null;
};
```

## 11. Todo

```ts
type TodoStatus =
  | "pending"
  | "done"
  | "approved"
  | "rejected"
  | "expired";

type RecurrenceRule =
  | { type: "none" }
  | { type: "weekly"; daysOfWeek: Weekday[] }
  | { type: "interval"; every: number; unit: "day" | "week" };

type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type TodoVisual = {
  type: "lucide-icon" | "image";
  value: string;
};

type Todo = {
  id: Id;
  title: string;
  createdBy: Id;
  assignedTo: Id | null;
  isShared: boolean;
  status: TodoStatus;
  starValue: number;
  visual: TodoVisual;
  recurrence: RecurrenceRule;
  visibleFrom: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  approvedBy: Id | null;
  approvedAt: string | null;
  rejectedBy: Id | null;
  rejectedAt: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};
```

Viktiga regler:

- `createdBy` avgor vem som far redigera/radera tillsammans med adminbehorighet.
- `assignedTo` avgor vem uppgiften ar till.
- `status: "done"` betyder att barnet har gjort den men vantar pa godkannande.
- `status: "approved"` betyder att stjarnor raknas.
- `expiresAt` styr nar uppgiften forsvinner fran barnets dashboard om den inte ar klar.

## 12. Beloningar och bana

```ts
type Reward = {
  id: Id;
  title: string;
  wishedBy: Id;
  starsNeeded: number;
  status: "suggested" | "active" | "unlocked" | "redeemed" | "rejected";
  approvedBy: Id | null;
  approvedAt: string | null;
  redeemedAt: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};
```

Beloningsbanan kan raknas fram:

```ts
type RewardPathProgress = {
  childId: Id;
  rewardId: Id;
  approvedStars: number;
  pendingTaskImages: Todo[];
  starsLeft: number;
  isUnlocked: boolean;
};
```

Kodexempel att skriva senare:

```ts
function getRewardPathProgress(
  child: Member,
  reward: Reward,
  todos: Todo[]
): RewardPathProgress {
  const childTodos = todos.filter((todo) => todo.assignedTo === child.id);

  const approvedStars = childTodos
    .filter((todo) => todo.status === "approved")
    .reduce((sum, todo) => sum + todo.starValue, 0);

  const pendingTaskImages = childTodos.filter((todo) => todo.status === "done");

  return {
    childId: child.id,
    rewardId: reward.id,
    approvedStars,
    pendingTaskImages,
    starsLeft: Math.max(reward.starsNeeded - approvedStars, 0),
    isUnlocked: approvedStars >= reward.starsNeeded
  };
}
```

Varfor vi raknar fram detta i en funktion: da slipper vi spara samma sanning pa flera stallen. Om en todo godkanns racker det att statusen andras, sedan raknas banan om.

Vad hander om vi sparar `approvedStars` manuellt pa barnet: det kan bli fel om en uppgift andras, nekas eller aterstalls. Raknad data ar tryggare an kopierad data.

## 13. Dashboardtema

```ts
type DashboardThemeId =
  | "space"
  | "rainbow"
  | "ocean"
  | "forest"
  | "superhero"
  | "animal-park"
  | "clear"
  | "focus"
  | "warm"
  | "dark"
  | "nature";

type DashboardTheme = {
  id: DashboardThemeId;
  name: string;
  audience: "child" | "adult";
  background: string;
  accentColor: string;
  pathStyle: string;
};
```

Tema byts genom langtryck pa dashboardbakgrunden.

Teknisk regel:

- Langtryck oppnar temaval.
- Temat sparas pa `member.dashboardTheme`.
- Temat paverkar bara medlemmens egen dashboard.
- Barn ska se barnteman.
- Vuxna ska se fem vuxenteman.

## 14. Behorighetsfunktioner

Behorigheter ska samlas i rena funktioner. UI:t ska inte sjalv hitta pa regler.

```ts
function getRoleForMember(member: Member, roles: Role[]): Role {
  const role = roles.find((role) => role.id === member.roleId);

  if (!role) {
    throw new Error("Member has no valid role");
  }

  return role;
}

function hasPermission(
  member: Member,
  roles: Role[],
  permission: PermissionKey
): boolean {
  return getRoleForMember(member, roles).permissions[permission] === true;
}
```

### 14.1 Resursatkomst

```ts
function getShareAccess(
  member: Member,
  resource: OwnedSharedResource
): AccessLevel | null {
  if (resource.ownerId === member.id) {
    return "edit";
  }

  return (
    resource.sharedWith.find((share) => share.memberId === member.id)?.access ??
    null
  );
}

function canViewResource(member: Member, resource: OwnedSharedResource): boolean {
  return getShareAccess(member, resource) !== null;
}

function canEditSharedResource(
  member: Member,
  resource: OwnedSharedResource
): boolean {
  return getShareAccess(member, resource) === "edit";
}
```

### 14.2 Todo-regler

```ts
function canEditTodo(member: Member, roles: Role[], todo: Todo): boolean {
  return (
    todo.createdBy === member.id ||
    hasPermission(member, roles, "canEditAnyTodos")
  );
}

function canDeleteTodo(member: Member, roles: Role[], todo: Todo): boolean {
  return (
    todo.createdBy === member.id ||
    hasPermission(member, roles, "canDeleteAnyTodos")
  );
}

function canCompleteTodo(member: Member, roles: Role[], todo: Todo): boolean {
  return (
    todo.assignedTo === member.id &&
    hasPermission(member, roles, "canCompleteAssignedTodos")
  );
}
```

### 14.3 Barnkonto-regler

```ts
function isSameAccount(member: Member, otherMember: Member): boolean {
  return member.accountId === otherMember.accountId;
}

function canManageChildAccount(
  adult: Member,
  child: Member,
  roles: Role[]
): boolean {
  return (
    child.isChild &&
    isSameAccount(adult, child) &&
    hasPermission(adult, roles, "canManageChildTodos")
  );
}

function canCreateChildAccount(member: Member, roles: Role[]): boolean {
  return hasPermission(member, roles, "canCreateChildAccounts");
}
```

### 14.4 Kalenderexport

```ts
function canExportCalendar(
  member: Member,
  roles: Role[],
  calendar: Calendar
): boolean {
  if (!hasPermission(member, roles, "canExportCalendar")) {
    return false;
  }

  return getShareAccess(member, calendar) === "edit";
}
```

Varfor: `view` betyder titta. Om vi later `view` exportera kan en delad kalender lamna appen utan att agaren gett redigerings- eller exportliknande kontroll.

## 15. Selectors

Appen bor ha selectors som filtrerar data for aktuell medlem.

```ts
function getVisibleTodos(member: Member, roles: Role[], todos: Todo[]): Todo[] {
  const activeTodos = todos.filter((todo) => todo.deletedAt === null);

  if (hasPermission(member, roles, "canSeeAllTodos")) {
    return activeTodos;
  }

  if (hasPermission(member, roles, "canSeeOwnTodos")) {
    return activeTodos.filter((todo) => {
      return todo.assignedTo === member.id || todo.isShared === true;
    });
  }

  return [];
}
```

Ledande fraga nar vi kodar: ska komponenten filtrera sina todos sjalv? Helst nej. Komponenten ska fraga en selector. Da blir reglerna testbara.

## 16. Aterkommande todos

For MVP kan aterkommande todos hanteras genom att skapa nya todo-instanser fran en regel.

```ts
type TodoTemplate = {
  id: Id;
  title: string;
  createdBy: Id;
  assignedTo: Id | null;
  isShared: boolean;
  starValue: number;
  visual: TodoVisual;
  recurrence: RecurrenceRule;
  activeWindowMinutes: number | null;
};
```

En schemagenerator kan skapa dagens faktiska todos:

```ts
function createTodoFromTemplate(
  template: TodoTemplate,
  visibleFrom: string
): Todo {
  return {
    id: crypto.randomUUID(),
    title: template.title,
    createdBy: template.createdBy,
    assignedTo: template.assignedTo,
    isShared: template.isShared,
    status: "pending",
    starValue: template.starValue,
    visual: template.visual,
    recurrence: template.recurrence,
    visibleFrom,
    expiresAt: null,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  };
}
```

Forsta versionen kan skapa dagens todos nar appen oppnas. Senare kan backend eller en schemalagd process gora detta.

## 17. Soft delete och papperskorg

```ts
type TrashItemType =
  | "calendar"
  | "calendarEvent"
  | "shoppingList"
  | "shoppingItem"
  | "todo"
  | "reward";

type TrashItem = {
  id: Id;
  type: TrashItemType;
  title: string;
  ownerId: Id;
  deletedAt: string;
  deletedBy: Id;
};
```

Trash-vyn ska byggas fran raderade objekt. Den ska inte vara en separat databaslista i MVP.

Varfor: om vi sparar papperskorgen separat kan den hamna ur synk. Om vi raknar fram den fran `deletedAt` vet vi att den stammer.

## 18. Komponentstruktur

Forslag pa komponenter:

- `AppShell`
- `HomeDashboard`
- `FamilyCalendarOverview`
- `MemberAvatarButton`
- `CurvedMemberName`
- `AdultDashboard`
- `ChildDashboard`
- `RewardPath`
- `RewardPathStep`
- `FallingTodoImage`
- `ThemePicker`
- `RoleEditor`
- `PermissionCheckboxGrid`
- `CalendarList`
- `CalendarImportExport`
- `ShoppingListView`
- `TodoScheduler`
- `ApprovalQueue`
- `TrashView`

## 19. Barnens interaktioner

### 19.1 Todo ramlar ner

Teknisk ide:

- Todo med `visibleFrom <= now` och `status: "pending"` visas som `FallingTodoImage`.
- Animationen ar UI-state, inte affarsdata.
- Nar barnet trycker pa bilden blir todo `done`.
- Bilden flyttas till `RewardPath` som vantande uppgiftsbild.

### 19.2 Godkannande

Foralder/admin godkanner i `ApprovalQueue`.

Vid godkannande:

```ts
todo.status = "approved";
todo.approvedBy = parent.id;
todo.approvedAt = new Date().toISOString();
```

UI:t visar samma plats pa banan, men byter uppgiftsbilden mot stjarnor.

Vid nekande:

```ts
todo.status = "rejected";
todo.rejectedBy = parent.id;
todo.rejectedAt = new Date().toISOString();
```

UI:t tar bort bilden fran progress eller visar den kort som nekad.

## 20. Import och export av kalender

Forsta version:

- Importera `.ics`-fil.
- Tolka handelser.
- Lagg kopior i vald kalender.
- Exportera kalender till `.ics`.

Viktigt:

- Importerade handelser ska fa `createdBy`.
- Importerade handelser ska hora till en specifik kalender.
- Export ska ga igenom `canExportCalendar`.

## 21. Teststrategi

Det viktigaste att testa forst:

- `hasPermission`
- `canViewResource`
- `canEditSharedResource`
- `canExportCalendar`
- `canEditTodo`
- `canDeleteTodo`
- `canCompleteTodo`
- `getVisibleTodos`
- `getRewardPathProgress`
- soft delete och papperskorgsfilter

Varfor: om behorighetsfunktionerna ar fel blir hela appen opalitlig, aven om UI:t ser bra ut.

## 22. Aktuell implementation 2026-06-09

Prototypen ar byggd som en frontend-first app enligt denna arkitektur:

- React + TypeScript
- Vite
- Lucide-ikoner
- `localStorage` via `useLocalStorageState`
- Centrala typer i `src/types.ts`
- Behorighetsfunktioner i `src/permissions.ts`
- Selector-logik i `src/selectors.ts`
- Teman i `src/themes.ts`

Nuvarande huvudkomponenter:

- `App.tsx`: ager just nu all top-level state for konto, medlemmar, roller, todos, kalendrar och inkopslistor.
- `AccountSettings.tsx`: konto- och medlemshantering, barnkonto, avatar och radera egen data.
- `RoleEditor.tsx`: roller och behorighetscheckboxar.
- `CalendarPanel.tsx`: kalender, delning, import och export.
- `ShoppingListsPanel.tsx`: inkopslistor, delning och poster.
- `TodoCreator.tsx`: skapande av todos med tilldelning, stjarnor, ikon och schema-data.
- `TrashView.tsx`: papperskorg och aterstallning.
- `ThemePicker.tsx`: langtrycksbaserat temaval.
- `MemberAvatar.tsx`: rund avatar med bild eller ikon och bagtext.

## 23. Arkitekturbeslut framover

### 23.1 Testa regler innan mer featurebygge

Nasta tekniska steg bor vara tester for behorighets- och selectorlogik.

Varfor: appen har nu privat data, delade resurser och barnfloden. Fel i permissions kan leda till att fel medlem ser eller redigerar fel data.

Vad hander om vi inte gor detta: vi kan bygga mer UI ovanpa regler som inte ar bevisade, och da blir senare buggar svarare att hitta.

### 23.2 Dela upp `App.tsx` nar fler stories byggs

`App.tsx` ar acceptabel i prototypstadiet, men bor delas upp nar nasta storre feature byggs.

Bra nasta uppdelning:

- `useMembersState`
- `useCalendarState`
- `useShoppingListState`
- `useTodoState`
- `useTrashActions`

Alternativ: infora reducer eller liten store. Det ar bra senare, men forst bor permissions testas.

### 23.3 LocalStorage ar prototyp-lagring

`localStorage` ar bra for att lara och testa floden. Det ar inte slutarkitektur for en app som ska anvandas av flera riktiga personer samtidigt.

Senare backend behover:

- autentisering
- konto- och medlemskapstabeller
- serverbaserade permissions
- fil-/bildlagring for avatarer
- kalenderimport/export pa server eller validerad klient
