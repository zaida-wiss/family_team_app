# Architecture: Familjeapp

## 1. Syfte

Detta dokument beskriver hur appen ar byggd tekniskt. Fokus ar tydlig datamodell, testbara behorighetsregler och en barnens beloningsbana som raknas fran data, inte sparas separat.

## 2. Arkitektur

Appen ar fullstack:

- **Frontend**: React + TypeScript (Vite), feature-baserad mappstruktur
- **Backend**: Express 4 + MongoDB Atlas via Mongoose
- **Delade typer**: `shared/types.ts` och `shared/schemas.ts` (Zod)
- **Auth**: JWT access-token (15 min) i Authorization-header + refresh-token (7 dagar) i HTTP-only cookie

## 3. Huvudmoduler

Appen ar uppdelad i dessa logiska delar:

- `members`: medlemmar, avatarer, barn/vuxen, dashboardtema
- `accounts`: familjekonto och medlemskap
- `roles`: roller och behorigheter
- `permissions`: funktioner som svarar pa "far medlemmen gora detta?"
- `calendars`: privata/delade kalendrar, import och export
- `shoppingLists`: privata/delade inkopslistor
- `todos`: todos, schema, status, tilldelning och soft delete
- `rewards`: onskningar, beloningar, stjarnor och beloningsbana
- `trash`: mjukraderad data och aterstallning
- `invitations`: inbjudningsflode

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

Alla objekt anvander string-id:

```ts
type Id = string;
```

Exempel:

```ts
"member-abc123"
"todo-def456"
"calendar-ghi789"
```

## 6. Konto och Medlem

```ts
type AccountType = "family";

type Account = {
  id: Id;
  name: string;
  type: AccountType;
  createdBy: Id;
  deletedAt: string | null;
};

type Member = {
  id: Id;
  accountId: Id;
  userId: Id | null;
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

- `isChild` styr barn-dashboard och ar alltid deriverat fran rollens `isChildRole`.
- `accountId` kopplar medlemmen till familjekontot.
- `userId` kopplar inloggad anvandare till sin profil (null for lokalt skapade testmedlemmar).
- `roleId` styr behorigheter.

## 7. Roll och behorigheter

```ts
type Role = {
  id: Id;
  name: string;
  isChildRole: boolean;
  permissions: Record<PermissionKey, boolean>;
};
```

`isChildRole: true` gor att inbjudna med den rollen automatiskt far barnfunktioner.

Nar ett konto skapas skapas alltid tva standardroller:
- `Foralder` (`isChildRole: false`) med fulla behorigheter
- `Barn` (`isChildRole: true`) med barnbehorigheter

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
```

## 8. Delade resurser

Kalender och inkopslista delar samma atkomstmodell.

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

## 9. Kalender

```ts
type Calendar = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  events: CalendarEvent[];
  importedSources: ImportedCalendarSource[];
};
```

Kalenderregler:

- Agare far alltid redigera sin egen kalender.
- Delad `view` far se men inte exportera.
- Delad `edit` kan exportera om rollen ocksa har `canExportCalendar`.

## 10. Inkopslista

```ts
type ShoppingList = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  icon: string | null;
  items: ShoppingItem[];
};
```

## 11. Todo

```ts
type TodoStatus = "pending" | "done" | "approved" | "rejected" | "expired";

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

type RewardPathProgress = {
  childId: Id;
  rewardId: Id;
  approvedStars: number;
  pendingTaskImages: Todo[];
  starsLeft: number;
  isUnlocked: boolean;
};
```

Banan raknas alltid fran todo-status. Ingen separat sanning sparas.

## 13. Dashboardtema

```ts
type DashboardThemeId =
  | "space" | "rainbow" | "ocean" | "forest" | "superhero" | "animal-park"
  | "clear" | "focus" | "warm" | "dark" | "nature";
```

- Langtryck oppnar temaval.
- Temat sparas pa `member.dashboardTheme`.
- Barn ser barnteman, vuxna ser vuxenteman.

## 14. Behorighetsfunktioner

```ts
function hasPermission(member: Member, roles: Role[], permission: PermissionKey): boolean {
  const role = roles.find((r) => r.id === member.roleId);
  return role?.permissions[permission] === true;
}
```

Returnerar `false` gracefully om roll saknas, kastar inte undantag.

### 14.1 Todo-regler

```ts
function canEditTodo(member, roles, todo): boolean {
  return todo.createdBy === member.id || hasPermission(member, roles, "canEditAnyTodos");
}

function canDeleteTodo(member, roles, todo): boolean {
  return todo.createdBy === member.id || hasPermission(member, roles, "canDeleteAnyTodos");
}

function canCompleteTodo(member, roles, todo): boolean {
  return todo.assignedTo === member.id && hasPermission(member, roles, "canCompleteAssignedTodos");
}
```

### 14.2 Barnkonto-regler

```ts
function canManageChildAccount(adult, child, roles): boolean {
  return child.isChild && adult.accountId === child.accountId && hasPermission(adult, roles, "canManageChildTodos");
}
```

## 15. Selectors

```ts
function getVisibleTodos(member, roles, todos): Todo[] {
  const activeTodos = todos.filter((t) => t.deletedAt === null);
  if (hasPermission(member, roles, "canSeeAllTodos")) return activeTodos;
  if (hasPermission(member, roles, "canSeeOwnTodos")) {
    return activeTodos.filter((t) => t.assignedTo === member.id || t.isShared);
  }
  return [];
}
```

## 16. Backend-struktur

```
backend/src/
  controllers/    # Logik per domän
  db/models/      # Mongoose-modeller
  db/seed.ts      # Testdata
  middleware/     # auth (JWT-verifiering)
  routes/         # Tunna router-filer
  utils/          # validate.ts, tokens.ts
```

Varje route-fil ar ca 8 rader. All logik lever i controllers.

## 17. Frontend-struktur

```
frontend/src/
  App.tsx                  # 4 rader – renderar AppRouter
  AppRouter.tsx            # Routing-switch + Shell
  api.ts                   # Alla API-anrop
  components/              # Delade UI-atomer (ThemePicker, MemberAvatar)
  features/                # Feature-mappar med hook + komponent
    accounts/
    adults/
    auth/
    calendars/
    children/
    invitations/
    layout/
    members/
    rewards/
    roles/
    shopping/
    todos/
    trash/
  hooks/                   # Kompositionshooks (useShellState, useAppNavigation)
  utils/                   # Delade utilities (permissions.ts)
```

## 18. Teststrategi

Det viktigaste att testa:

- `hasPermission`
- `canViewResource`, `canEditSharedResource`
- `canExportCalendar`
- `canEditTodo`, `canDeleteTodo`, `canCompleteTodo`
- `getVisibleTodos`
- `getRewardPathProgress`
- Soft delete och papperskorgsfilter

## 19. Aktuell implementation 2026-06-22

### Genomfort

- Fullstack med React + TypeScript (Vite) och Express 4 + MongoDB Atlas.
- JWT-autentisering med access-token och refresh-cookie.
- Inbjudningsflode: admin skickar inbjudningslank, mottagaren loggar in/registrerar sig.
- Familjekonto skapas alltid med Foralder- och Barnroller.
- `isChildRole` pa rollen styr barnfunktioner automatiskt.
- Controllers-mapp separerar logik fran routes.
- `utils/permissions.ts` ar delad utility for bade features och hooks.
- GDPR Art. 20 (dataexport) och Art. 17 (kontoborttagning) implementerat.
- Tester for behorigheter, beloningsbana och soft delete kors med `npm test`.

### Arkitekturprinciper nu

- `App.tsx`: 4 rader, renderar bara `<AppRouter />`.
- `AppRouter.tsx`: routing-switch + `Shell`-komponent.
- `hooks/useShellState.ts`: samlar all shell-state och bygger prop-objekt utan att importera komponenter.
- `hooks/useAppNavigation.ts`: ager all routing-logik, returnerar typsäkert screen-objekt.
- Features importerar inte fran varandra uppat i lagerstacken.
