# PRD: Familjeapp

## 1. Syfte

Appen ska hjalpa familjer att samla planering, ansvar och vardagslogistik pa ett stalle. Den ska stodja privata och delade kalendrar, inkopslistor, todo-listor, roller, behorigheter och ett barnvanligt beloningssystem med stjarnor.

## 2. Produktmal

- Anvandare ska kunna skapa ett familjekonto och bjuda in familjemedlemmar via inbjudningslank.
- Admin ska kunna skapa roller och valja behorigheter med checkboxar.
- Medlemmar ska bara se och gora det deras roll och delningar tillater.
- Kalender, inkopslistor och todos ska stodja privat och delad anvandning.
- Barn ska kunna forsta och anvanda todo-listor genom tydliga farger, Lucide-ikoner och stjarnor.
- Foralder eller admin ska godkanna barns klara uppgifter innan stjarnor raknas mot beloning.
- Data ska kunna mjukraderas och aterstallas fran papperskorg.
- Startsidan ska visa kalender och klickbara bilder pa medlemmar.
- Barns personliga dashboard ska vara glad, visuell och enkel att forsta.
- Vuxna ska kunna skapa aterkommande todos med schema.
- Appen ska stodja familjekonto dar foraldrar kan bjuda in och hantera familjemedlemmar.
- Anvandaren ska kunna exportera sin data och ta bort sitt konto enligt GDPR.

## 3. Icke-mal for forsta versionen

- Ingen direkt synkning med Google Calendar eller Outlook.
- Ingen betalning eller prenumeration.
- Ingen extern inloggning via BankID, Google eller Microsoft.
- Ingen avancerad statistik.
- Ingen realtidschatt.
- Ingen automatisk konfliktlosning mellan importerade kalendrar.

## 4. Primara anvandarroller

### Foralder

Foralder kan skapa uppgifter, godkanna barns klara uppgifter och dela kalendrar eller listor. Foralder kan hantera barnkonton och bjuda in nya familjemedlemmar.

### Barn

Barn kan se sina egna uppgifter, markera uppgifter som klara och folja sin stjarnprogress mot beloningar.

### Gast

Gast kan ha begransad lasatkomst enligt roll.

## 5. Grundmodell

Systemet ska skilja mellan:

- Konto: den gemensamma ytan dar familjemedlemmar hor hemma. Alltid av typen `family`.
- Roll: vad medlemmen generellt far gora.
- Agarskap: vem som ager en resurs.
- Delning: vilka andra medlemmar som far se eller redigera en specifik resurs.
- Tilldelning: vem en todo ar riktad till.
- Skapare: vem som skapade en todo.

Detta ar viktigt eftersom samma person inte alltid ar bade agare, skapare och tilldelad.

## 6. Funktionella krav

### 6.1 Medlemmar

- FR-001: Foralder ska kunna bjuda in en ny familjemedlem via en inbjudningslank.
- FR-002: Appen ska stodja valfritt antal medlemmar.
- FR-003: Admin ska kunna tilldela en roll till varje medlem.
- FR-004: Medlemmar ska inte vara hardkodade i koden.
- FR-005: En medlem ska kunna ha barnlage/beloningar om rollen markeras som barnroll (`isChildRole: true`).
- FR-006: En medlem ska kunna ha en bild eller avatar som visas pa startsidan.
- FR-007: En medlem ska kunna klickas fran startsidan for att oppna medlemmens personliga dashboard.
- FR-008: Alla konton ar familjekonton. Kontotyp behovs inte valjas.
- FR-009: Foraldrar med ratt behorighet ska kunna bjuda in barnkonton via installningar.
- FR-010: Barnkonton ska kopplas till samma familjekonto.
- FR-011: Samtliga vuxna i samma familjekonto ska kunna godkanna barns uppgifter om rollen har `canApproveTodos`.
- FR-012: Samtliga vuxna i samma familjekonto ska kunna skapa och fylla i uppgifter pa barnkontot om rollen tillater det.
- FR-013: Nar ett konto skapas skapas automatiskt rollerna Foralder (`isChildRole: false`) och Barn (`isChildRole: true`).
- FR-014: Barnfunktioner som stjarnor, onskningar och beloningsbana aktiveras for medlemmar vars roll har `isChildRole: true`.

### 6.2 Roller och behorigheter

- FR-015: Admin ska kunna skapa egna roller.
- FR-016: Admin ska kunna namnge roller.
- FR-017: Admin ska kunna kryssa i behorigheter for varje roll.
- FR-018: Admin ska kunna tilldela en roll till en medlem.
- FR-019: Appen ska anvanda rollens behorigheter nar den avgor vad medlemmen far se och gora.
- FR-020: Appen ska ha minst en adminroll som kan hantera roller och medlemmar.

Exempel pa behorigheter:

- `canManageMembers`
- `canManageRoles`
- `canSeeAllTodos`
- `canSeeOwnTodos`
- `canCreateTodos`
- `canScheduleRecurringTodos`
- `canCompleteAssignedTodos`
- `canEditAnyTodos`
- `canDeleteAnyTodos`
- `canApproveTodos`
- `canSeeAllCalendar`
- `canSeeOwnCalendar`
- `canCreateCalendar`
- `canEditCalendar`
- `canImportCalendar`
- `canExportCalendar`
- `canSeeShoppingLists`
- `canCreateShoppingLists`
- `canEditShoppingLists`
- `canViewTrash`
- `canRestoreFromTrash`
- `canCreateChildAccounts`
- `canManageChildTodos`

### 6.3 Startsida och dashboards

- FR-021: Startsidan ska visa kalendern som primar vy.
- FR-022: Startsidan ska visa klickbara bilder eller avatarer for familjemedlemmar.
- FR-023: Klick pa en medlemsbild ska oppna medlemmens personliga dashboard.
- FR-024: Dashboard for barn ska ha tydligt barnlage med beloningsbana, stjarnor och dagens uppgifter.
- FR-025: Dashboard for vuxna ska fokusera pa kalender, egna todos, inkopslistor, delade listor och uppgiftsscheman.
- FR-026: Vuxnas dashboard ska ha tydlig vaxling mellan kalender, todo och inkopslistor.
- FR-027: Vuxnas dashboard ska behalla samma kontext nar anvandaren vaxlar.
- FR-028: Vuxna ska kunna vaxla mellan fem olika teman pa sin egen dashboard.
- FR-029: Vuxna ska kunna oppna temaval genom att trycka lange pa dashboardens bakgrund.
- FR-030: Medlemsbilder pa startsidan ska vara runda.
- FR-031: Medlemsnamn ska visas vid bilden, helst som bojd text i en bage runt den runda bilden.

### 6.4 Kalender

- FR-032: En medlem ska kunna ha en privat kalender.
- FR-033: En kalender ska ha en agare.
- FR-034: Agaren ska kunna dela kalendern med valfria medlemmar.
- FR-035: Vid delning ska agaren kunna valja `view` eller `edit`.
- FR-036: En medlem med `view` ska kunna se kalendern men inte andra den.
- FR-037: En medlem med `edit` ska kunna redigera kalendern om rollen ocksa tillater kalenderredigering.
- FR-038: Appen ska kunna importera kalender via `.ics`-fil.
- FR-039: Appen ska kunna exportera kalender till `.ics`.
- FR-040: Export ska bara tillatas om medlemmen har exportbehorighet och antingen ager kalendern eller har `edit`-atkomst.

### 6.5 Inkopslistor

- FR-041: En medlem ska kunna skapa privata inkopslistor om rollen tillater det.
- FR-042: En inkopslista ska ha en agare.
- FR-043: Agaren ska kunna dela inkopslistan med valfria medlemmar.
- FR-044: Vid delning ska agaren kunna valja `view` eller `edit`.
- FR-045: Inkopsposter ska kunna laggas till, bockas av och mjukraderas enligt behorighet.

### 6.6 Todos

- FR-046: En todo ska ha titel, `createdBy` och kunna ha `assignedTo`.
- FR-047: En todo ska kunna vara gemensam.
- FR-048: En medlem med `canSeeOwnTodos` ska bara se egna todos och eventuella gemensamma todos.
- FR-049: En medlem med `canSeeAllTodos` ska kunna se alla aktiva todos.
- FR-050: Den som skapade en todo ska kunna redigera den.
- FR-051: Den som ar tilldelad en todo ska inte automatiskt fa redigera texten.
- FR-052: Den som ar tilldelad en todo ska kunna markera den som klar om rollen har `canCompleteAssignedTodos`.
- FR-053: Vuxna med ratt behorighet ska kunna skapa aterkommande todos.
- FR-054: En todo ska kunna ha ett tidsfonster eller en deadline.
- FR-055: En barns todo som inte klaras inom tidsfonstret ska forsvinna fran barnets aktiva dashboard och markeras som `expired`.

Todo-statusar:

- `pending`: uppgiften ar inte klar.
- `done`: tilldelad medlem har markerat den som klar.
- `approved`: foralder/admin har godkant uppgiften.
- `rejected`: foralder/admin har nekat uppgiften.
- `expired`: uppgiften klarades inte i tid.

### 6.7 Barnlage, stjarnor och beloningar

- FR-056: Todo-listor ska kunna ha en Lucide-ikon och en farg.
- FR-057: En todo ska kunna ha ett stjarnvarde.
- FR-058: Barn ska kunna markera tilldelade uppgifter som klara.
- FR-059: Foralder eller admin med `canApproveTodos` ska kunna godkanna eller neka klara uppgifter.
- FR-060: Stjarnor ska bara raknas mot beloning nar uppgiften ar `approved`.
- FR-061: Uppgifter med status `done` ska visas som vantande uppgiftsbilder pa barnets beloningsbana.
- FR-062: Barn ska kunna skapa onskningar eller beloningsforslag.
- FR-063: Foralder eller admin ska godkanna onskningar innan de blir aktiva beloningar.
- FR-064: En beloning ska ha ett antal stjarnor som krav.
- FR-065: En beloning ska bara bli upplast nar godkanda stjarnor nar kravet.
- FR-066: Barnens aktiva todos ska kunna visas som visuella kort som ramlar ner i dashboarden vid installda tider.

### 6.8 GDPR

- FR-067: Anvandaren ska kunna ladda ner all sin data i JSON-format (GDPR Art. 20).
- FR-068: Anvandaren ska kunna ta bort sitt familjekonto (GDPR Art. 17).
- FR-069: Kontoborttagning ska vara mjuk och data raderas definititivt inom 30 dagar.
- FR-070: Appen ska tydligt informera om konsekvenserna av kontoborttagning innan bekraftelse.

### 6.9 Delning och atkomst

- FR-071: Kalender och inkopslista ska anvanda samma delningsmodell.
- FR-072: Atkomstnivaer ar `view` och `edit`.
- FR-073: Agare ska alltid kunna se och redigera sin egen resurs.
- FR-074: Redigering av delade resurser ska krava bade resursatkomst och rollbehorighet.

### 6.10 Mjuk radering och papperskorg

- FR-075: Appen ska anvanda mjuk radering for kalendrar, inkopslistor och todos.
- FR-076: Mjuk radering ska satta `deletedAt` och `deletedBy`.
- FR-077: Vanliga vyer ska filtrera bort raderad data.
- FR-078: Papperskorgen ska visa raderad data.
- FR-079: En vanlig medlem ska bara se sina egna raderade saker.
- FR-080: Admin med ratt behorighet ska kunna se allas raderade saker.
- FR-081: Raderad data ska kunna aterstallas enligt behorighet.

## 7. Dataforslag

### 7.1 Konto

```js
{
  id: "account-1",
  name: "Familjen Solbacken",
  type: "family",
  createdBy: "member-1",
  deletedAt: null
}
```

### 7.2 Medlem

```js
{
  id: "member-1",
  accountId: "account-1",
  userId: "user-1",
  name: "Anna",
  roleId: "role-foralder",
  isChild: false,
  avatarUrl: null,
  dashboardTheme: "focus",
  deletedAt: null,
  deletedBy: null
}
```

### 7.3 Roll

```js
{
  id: "role-foralder",
  name: "Foralder",
  isChildRole: false,
  permissions: {
    canManageMembers: true,
    canManageRoles: true,
    canApproveTodos: true
  }
}
```

### 7.4 Todo

```js
{
  id: "todo-1",
  title: "Badda sangen",
  createdBy: "member-1",
  assignedTo: "member-2",
  status: "pending",
  starValue: 2,
  visual: { type: "lucide-icon", value: "Bed" },
  recurrence: { type: "weekly", daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
  visibleFrom: "2026-06-22T07:00:00",
  expiresAt: "2026-06-22T09:00:00",
  approvedBy: null,
  approvedAt: null,
  deletedAt: null,
  deletedBy: null
}
```

### 7.5 Beloning

```js
{
  id: "reward-1",
  title: "Bio med popcorn",
  wishedBy: "member-2",
  starsNeeded: 20,
  status: "active",
  approvedBy: "member-1",
  approvedAt: "2026-06-01T10:00:00",
  redeemedAt: null,
  deletedAt: null,
  deletedBy: null
}
```

## 8. MVP

MVP ska innehalla:

1. Skapa familjekonto och bjud in medlemmar.
2. Skapa roller med checkboxar for behorigheter.
3. Tilldela roll till medlem.
4. Skapa kalender och dela med `view` eller `edit`.
5. Importera `.ics`-fil till kalender.
6. Exportera kalender till `.ics`.
7. Skapa inkopslista och dela med `view` eller `edit`.
8. Skapa todos med tilldelning och status.
9. Godkanna eller neka barns klara todos.
10. Rakna godkanda stjarnor och vantande uppgiftsbilder separat.
11. Visa beloningsbana.
12. Mjukradera data.
13. Visa papperskorg.
14. Aterstalla raderad data.
15. Ladda ner data (GDPR Art. 20).
16. Ta bort konto (GDPR Art. 17).

## 9. UX-krav

- UI:t ska vara tydligt nog for bade vuxna och barn.
- Startsidan ska kombinera kalender med runda klickbara medlemsbilder.
- Vuxnas dashboard ska ha enkel vaxling mellan kalender, todo och inkopslistor.
- Vuxna ska kunna byta mellan fem dashboardteman genom langtryck pa bakgrunden.
- Todo-listor for barn ska vara fargglada och anvanda Lucide-ikoner.
- Barn ska kunna byta dashboardtema genom langtryck pa bakgrunden.
- Vantande uppgifter ska visas som uppgiftsbilder pa banan tills foralder/admin godkanner dem.
- Godkanda uppgifter ska forvandlas till stjarnor pa samma plats pa banan.
- Adminfloden ska anvanda checkboxar for behorigheter.
- Raderingsfloden ska tydligt informera om GDPR och vad som hander med data.

## 10. Beslutade regler

1. Agaren ska alltid kunna redigera sin egen kalender och inkopslista.
2. Barn kan skapa onskningar, men foralder eller admin maste godkanna dem innan de blir aktiva beloningar.
3. Delade kalendrar med endast `view`-atkomst ska inte kunna exporteras.
4. Gemensamma todos ska kunna ge stjarnor.
5. Admin ska kunna se allas papperskorg i MVP.
6. Appen ar uteslutande for familjer. Arbetsplats- eller teamstod finns inte.
7. `isChildRole: true` pa rollen avgor om en inbjuden person far barnfunktioner, inte en manuell kryssruta.

## 11. Implementationslage 2026-06-22

Den aktuella implementationen ar fullstack: React + TypeScript (Vite) i frontend, Express 4 + MongoDB Atlas (Mongoose) i backend.

### Implementerat

- Familjekonto skapas automatiskt med rollerna Foralder och Barn.
- Inloggning, registrering, refresh och utloggning med JWT (access-token + refresh-cookie).
- Inbjudningsflode: admin skickar inbjudningslank, mottagaren registrerar sig eller loggar in och far automatiskt en session.
- `isChildRole` pa rollen avgr om en inbjuden person far barnfunktioner.
- Medlemmar kan bjudas in, skapas och mjukraderas.
- Roller kan skapas med behorighetscheckboxar.
- Kalender kan skapas, delas, importeras och exporteras.
- Inkopslistor kan skapas, delas och redigeras.
- Todos kan skapas, tilldelas och godkannas.
- Barn-dashboard med beloningsbana.
- Mjuk radering och papperskorg.
- Exportera all data (GDPR Art. 20).
- Ta bort konto med GDPR-information (GDPR Art. 17).

### Kvar i MVP

- UI for barns onskningar och foraldragodkannande av onskningar.
- Tydligare feedback nar barnets uppgift nekas (Story 6.5).
- Animation for fallande todo-bilder (Story 6.6).
