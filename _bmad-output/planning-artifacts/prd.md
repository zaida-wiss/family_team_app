# PRD: Familje- och teamapp

## 1. Syfte

Appen ska hjalpa familjer, kontor och mindre team att samla planering, ansvar och vardagslogistik pa ett stalle. Den ska stodja privata och delade kalendrar, inkopslistor, todo-listor, roller, behorigheter och ett barnvanligt beloningssystem med stjarnor.

## 2. Produktmal

- Anvandare ska kunna skapa medlemmar direkt i appen.
- Admin ska kunna skapa roller och valja behorigheter med checkboxar.
- Medlemmar ska bara se och gora det deras roll och delningar tillater.
- Kalender, inkopslistor och todos ska stodja privat och delad anvandning.
- Barn ska kunna forsta och anvanda todo-listor genom tydliga farger, Lucide-ikoner och stjarnor.
- Foralder eller admin ska godkanna barns klara uppgifter innan stjarnor raknas mot beloning.
- Data ska kunna mjukraderas och aterstallas fran papperskorg.
- Startsidan ska visa kalender och klickbara bilder pa medlemmar.
- Barns personliga dashboard ska vara glad, visuell och enkel att forsta.
- Vuxna ska kunna skapa aterkommande todos med schema.
- Nar konto skapas ska anvandaren valja om det ar ett familjekonto eller arbetsplatskonto.
- Appen ska stodja familjekonto dar vuxna kan skapa och hantera barnkonton.
- Appen ska stodja arbetsplatskonto utan barnfunktioner som standard.

## 3. Icke-mal for forsta versionen

- Ingen direkt synkning med Google Calendar eller Outlook.
- Ingen betalning eller prenumeration.
- Ingen extern inloggning via BankID, Google eller Microsoft.
- Ingen avancerad statistik.
- Ingen realtidschatt.
- Ingen automatisk konfliktlosning mellan importerade kalendrar.

## 4. Primara anvandarroller

### Admin

Admin kan hantera medlemmar, roller, behorigheter och data enligt rollens rattigheter.

### Foralder eller ansvarig vuxen

Foralder kan skapa uppgifter, godkanna barns klara uppgifter och dela kalendrar eller listor.

### Barn

Barn kan se sina egna uppgifter, markera uppgifter som klara och folja sin stjarnprogress mot beloningar.

### Medlem eller kollega

Medlem kan anvanda kalender, inkopslistor och todos enligt roll och delning.

### Gast

Gast kan ha begransad lasatkomst enligt roll.

## 5. Grundmodell

Systemet ska skilja mellan:

- Konto: den gemensamma ytan dar medlemmar hor hemma.
- Kontotyp: familj eller arbetsplats.
- Roll: vad medlemmen generellt far gora.
- Agarskap: vem som ager en resurs.
- Delning: vilka andra medlemmar som far se eller redigera en specifik resurs.
- Tilldelning: vem en todo ar riktad till.
- Skapare: vem som skapade en todo.

Detta ar viktigt eftersom samma person inte alltid ar bade agare, skapare och tilldelad.

## 6. Funktionella krav

### 6.1 Medlemmar

- FR-001: Admin ska kunna skapa en medlem genom att skriva ett namn i appen.
- FR-002: Appen ska stodja valfritt antal medlemmar.
- FR-003: Admin ska kunna tilldela en roll till varje medlem.
- FR-004: Medlemmar ska inte vara hardkodade i koden.
- FR-005: En medlem ska kunna ha barnlage/beloningar om rollen eller profilen markerar medlemmen som barn.
- FR-006: En medlem ska kunna ha en bild eller avatar som visas pa startsidan.
- FR-007: En medlem ska kunna klickas fran startsidan for att oppna medlemmens personliga dashboard.
- FR-008: Appen ska stodja familjekonto eller arbetsplatskonto som samlar medlemmar.
- FR-009: Vuxna med ratt behorighet ska kunna skapa barnkonton fran installningar.
- FR-010: Barnkonton ska kopplas till samma familjekonto.
- FR-011: Samtliga vuxna i samma familjekonto ska kunna godkanna barns uppgifter om rollen har `canApproveTodos`.
- FR-012: Samtliga vuxna i samma familjekonto ska kunna skapa och fylla i uppgifter pa barnkontot om rollen tillater det.
- FR-013: Vid konto-skapande ska anvandaren valja kontotyp: familj eller arbetsplats.
- FR-014: Familjekonto ska kunna ha vuxna och barn.
- FR-015: Arbetsplatskonto ska ha medlemmar men inte barnkonton som standard.
- FR-016: Barnfunktioner som stjarnor, onskningar och beloningsbana ska vara kopplade till familjelage.
- FR-017: Arbetsplatskonto ska fokusera pa roller, kalender, todos och inkopslistor.

### 6.2 Roller och behorigheter

- FR-018: Admin ska kunna skapa egna roller.
- FR-019: Admin ska kunna namnge roller.
- FR-020: Admin ska kunna kryssa i behorigheter for varje roll.
- FR-021: Admin ska kunna tilldela en roll till en medlem.
- FR-022: Appen ska anvanda rollens behorigheter nar den avgor vad medlemmen far se och gora.
- FR-023: Appen ska ha minst en adminroll som kan hantera roller och medlemmar.

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

- FR-024: Startsidan ska visa kalendern som primar vy.
- FR-025: Startsidan ska visa klickbara bilder eller avatarer for familjemedlemmar/medlemmar.
- FR-026: Klick pa en medlemsbild ska oppna medlemmens personliga dashboard.
- FR-027: Dashboard for barn ska ha tydligt barnlage med beloningsbana, stjarnor och dagens uppgifter.
- FR-028: Dashboard for vuxna ska fokusera pa kalender, egna todos, inkopslistor, delade listor och uppgiftsscheman.
- FR-029: Vuxnas dashboard ska ha tydlig vaxling mellan kalender, todo och inkopslistor.
- FR-030: Vuxnas dashboard ska behalla samma kontext nar anvandaren vaxlar mellan kalender, todo och inkopslistor.
- FR-031: Vuxna ska kunna vaxla mellan fem olika teman pa sin egen dashboard.
- FR-032: Vuxna ska kunna oppna temaval genom att trycka lange pa dashboardens bakgrund.
- FR-033: Vuxnas teman ska vara tydliga, lugna och praktiska.
- FR-034: Medlemsbilder pa startsidan ska vara runda.
- FR-035: Medlemsnamn ska visas vid bilden, helst som bojd text i en bage runt den runda bilden.
- FR-036: Om bojd text inte ingar i forsta implementationen ska namnet visas tydligt under bilden.

### 6.4 Kalender

- FR-037: En medlem ska kunna ha en privat kalender.
- FR-038: En medlem ska kunna skapa flera kalendrar om rollen tillater det.
- FR-039: En kalender ska ha en agare.
- FR-040: Agaren ska kunna dela kalendern med valfria medlemmar.
- FR-041: Vid delning ska agaren kunna valja `view` eller `edit`.
- FR-042: En medlem med `view` ska kunna se kalendern men inte andra den.
- FR-043: En medlem med `edit` ska kunna redigera kalendern om rollen ocksa tillater kalenderredigering.
- FR-044: En medlem ska kunna se sin egen kalender enligt behorighet.
- FR-045: Admin eller roll med ratt behorighet ska kunna se fler kalendrar.
- FR-046: Appen ska kunna importera kalender via `.ics`-fil i forsta versionen.
- FR-047: Appen ska kunna exportera kalender till `.ics`.
- FR-048: Export ska bara tillatas om medlemmen har exportbehorighet och antingen ager kalendern eller har `edit`-atkomst till en delad kalender.
- FR-049: En medlem med endast `view`-atkomst till en delad kalender ska inte kunna exportera den.
- FR-050: Agaren ska alltid kunna redigera sin egen kalender.

### 6.5 Inkopslistor

- FR-051: En medlem ska kunna skapa privata inkopslistor om rollen tillater det.
- FR-052: En inkopslista ska ha en agare.
- FR-053: Agaren ska kunna dela inkopslistan med valfria medlemmar.
- FR-054: Vid delning ska agaren kunna valja `view` eller `edit`.
- FR-055: En medlem med `view` ska kunna se listan men inte andra den.
- FR-056: En medlem med `edit` ska kunna andra listan om rollen ocksa tillater det.
- FR-057: Agaren ska alltid kunna redigera sin egen inkopslista.
- FR-058: Inkopsposter ska kunna laggas till, bockas av och mjukraderas enligt behorighet.

### 6.6 Todos

- FR-059: En todo ska ha titel.
- FR-060: En todo ska ha `createdBy`.
- FR-061: En todo ska kunna ha `assignedTo`.
- FR-062: En todo ska kunna vara gemensam.
- FR-063: En medlem med `canSeeOwnTodos` ska bara se egna todos och eventuella gemensamma todos som rollen tillater.
- FR-064: En medlem med `canSeeAllTodos` ska kunna se alla aktiva todos.
- FR-065: Den som skapade en todo ska kunna redigera den.
- FR-066: Admin med `canEditAnyTodos` ska kunna redigera todos.
- FR-067: Den som ar tilldelad en todo ska inte automatiskt fa redigera texten.
- FR-068: Den som ar tilldelad en todo ska kunna markera den som klar om rollen har `canCompleteAssignedTodos`.
- FR-069: Den som skapade en todo ska kunna mjukradera den.
- FR-070: Admin med `canDeleteAnyTodos` ska kunna mjukradera todos.
- FR-071: Gemensamma todos ska kunna ge stjarnor.
- FR-072: Vuxna med ratt behorighet ska kunna skapa aterkommande todos.
- FR-073: Aterkommande todos ska kunna ha intervall, till exempel veckovis eller efter ett eget valt schema.
- FR-074: En todo ska kunna ha ett tidsfonster eller en deadline.
- FR-075: Foralder eller skapare ska kunna stalla in nar en barns todo visas.
- FR-076: Foralder eller skapare ska kunna stalla in nar en barns todo forsvinner om den inte blir avklarad.
- FR-077: En barns todo som inte klaras inom tidsfonstret ska forsvinna fran barnets aktiva dashboard och markeras som missad eller utgangen.

Todo-statusar:

- `pending`: uppgiften ar inte klar.
- `done`: tilldelad medlem har markerat den som klar.
- `approved`: foralder/admin har godkant uppgiften.
- `rejected`: foralder/admin har nekat uppgiften.

### 6.7 Barnlage, stjarnor och beloningar

- FR-078: Todo-listor ska kunna ha en Lucide-ikon.
- FR-079: Todo-listor ska kunna ha en farg.
- FR-080: Appen ska spara ikon som namn, till exempel `Sun`, `Home`, `BookOpen` eller `Trophy`.
- FR-081: En todo ska kunna ha ett stjarnvarde.
- FR-082: Barn ska kunna markera tilldelade uppgifter som klara.
- FR-083: Foralder eller admin med `canApproveTodos` ska kunna godkanna eller neka klara uppgifter.
- FR-084: Stjarnor ska bara raknas mot beloning nar uppgiften ar `approved`.
- FR-085: Uppgifter med status `done` ska visas som vantande uppgiftsbilder pa barnets beloningsbana.
- FR-086: Vantande uppgiftsbilder ska behalla sin plats pa banan tills uppgiften godkanns eller nekas.
- FR-087: Barn ska kunna skapa onskningar eller beloningsforslag.
- FR-088: Foralder eller admin ska godkanna onskningar innan de blir aktiva beloningar.
- FR-089: En beloning ska ha ett antal stjarnor som krav.
- FR-090: Beloningsbanan ska visa godkanda stjarnor, vantande uppgiftsbilder och kvarvarande godkanda stjarnor till beloning.
- FR-091: En beloning ska bara bli upplast nar godkanda stjarnor nar kravet.
- FR-092: Barnens dashboard ska visa en rolig bana dar stjarnor visuellt flyttar barnet narmare malet.
- FR-093: Barnens dashboard ska visa hur manga stjarnor som ar kvar till malet.
- FR-094: Barnens aktiva todos ska kunna visas som visuella kort eller bilder som ramlar ner i dashboarden vid installda tider.
- FR-095: Barn ska kunna trycka pa en todo-bild for att markera uppgiften som klar.
- FR-096: Nar barnet markerar en uppgift som klar ska uppgiftsbilden placeras pa beloningsbanan som vantande.
- FR-097: Nar foralder eller admin godkanner uppgiften ska uppgiftsbilden forvandlas till en eller flera stjarnor men behalla sin plats pa beloningsbanan.
- FR-098: Om foralder eller admin nekar uppgiften ska uppgiftsbilden tas bort fran aktiv progress enligt UX-regler.
- FR-099: UI:t ska tydligt skilja mellan vantande uppgiftsbilder och godkanda stjarnor.
- FR-100: Barn ska kunna andra tema pa sin egen dashboard.
- FR-101: Barn ska kunna oppna temaval genom att halla fingret lange pa dashboardens bakgrund.
- FR-102: Temavalet ska vara enkelt, visuellt och barnvanligt.
- FR-103: Ett barns tema ska bara paverka barnets egen dashboard.
- FR-104: Temaandringar ska sparas per medlem, inte globalt for hela appen.

### 6.8 Delning och atkomst

- FR-105: Kalender och inkopslista ska anvanda samma delningsmodell.
- FR-106: Delning ska innehalla medlem och atkomstniva.
- FR-107: Atkomstnivaer i forsta versionen ska vara `view` och `edit`.
- FR-108: Agare ska alltid kunna se sin egen resurs.
- FR-109: Agare ska alltid kunna redigera sin egen kalender eller inkopslista.
- FR-110: Redigering av delade resurser ska krava bade resursatkomst och rollbehorighet.

Exempel pa delning:

```js
sharedWith: [
  { memberId: 2, access: "view" },
  { memberId: 3, access: "edit" }
]
```

### 6.9 Mjuk radering och papperskorg

- FR-111: Appen ska anvanda mjuk radering for kalendrar, inkopslistor och todos.
- FR-112: Mjuk radering ska satta `deletedAt`.
- FR-113: Mjuk radering ska satta `deletedBy`.
- FR-114: Vanliga vyer ska filtrera bort raderad data.
- FR-115: Papperskorgen ska visa raderad data.
- FR-116: En vanlig medlem ska bara se sina egna raderade saker.
- FR-117: Admin med ratt behorighet ska kunna se allas raderade saker i papperskorgen redan i MVP.
- FR-118: Agare ska kunna aterstalla sin egen raderade data om rollen tillater papperskorg.
- FR-119: Admin med `canRestoreFromTrash` ska kunna aterstalla enligt behorighet.

## 7. Dataforslag

### 7.1 Medlem

```js
{
  id: 1,
  name: "Sam",
  roleId: 2,
  isChild: true,
  avatarUrl: "/avatars/sam.png",
  dashboardTheme: "space"
}
```

### 7.2 Roll

```js
{
  id: 1,
  name: "Foralder",
  permissions: {
    canManageMembers: true,
    canManageRoles: true,
    canApproveTodos: true
  }
}
```

### 7.3 Kalender

```js
{
  id: 1,
  name: "Privat kalender",
  ownerId: 1,
  sharedWith: [
    { memberId: 2, access: "view" }
  ],
  events: [],
  deletedAt: undefined,
  deletedBy: undefined
}
```

### 7.4 Inkopslista

```js
{
  id: 1,
  name: "Helgens inkop",
  ownerId: 1,
  sharedWith: [
    { memberId: 2, access: "edit" }
  ],
  items: [],
  deletedAt: undefined,
  deletedBy: undefined
}
```

### 7.5 Todo

```js
{
  id: 1,
  title: "Badda sangen",
  createdBy: 1,
  assignedTo: 2,
  status: "pending",
  starValue: 2,
  visual: {
    type: "image",
    value: "bed"
  },
  recurrence: {
    type: "weekly",
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"]
  },
  visibleFrom: "2026-06-10T07:00:00",
  expiresAt: "2026-06-10T09:00:00",
  approvedBy: null,
  approvedAt: null,
  deletedAt: undefined,
  deletedBy: undefined
}
```

### 7.6 Beloning

```js
{
  id: 1,
  title: "Bio med popcorn",
  wishedBy: 2,
  starsNeeded: 20,
  approvedByAdmin: true,
  redeemed: false
}
```

## 8. MVP

MVP ska innehalla:

1. Skapa medlemmar.
2. Skapa roller.
3. Kryssa i behorigheter for roller.
4. Tilldela roll till medlem.
5. Skapa kalender.
6. Dela kalender med `view` eller `edit`.
7. Importera `.ics`-fil till kalender.
8. Exportera kalender till `.ics`.
9. Skapa inkopslista.
10. Dela inkopslista med `view` eller `edit`.
11. Skapa todos.
12. Tilldela todos till medlem.
13. Visa todos utifran roll och tilldelning.
14. Markera todo som klar.
15. Godkanna eller neka barns klara todos.
16. Rakna godkanda stjarnor och vantande uppgiftsbilder separat.
17. Visa beloningsbana.
18. Mjukradera data.
19. Visa egen papperskorg for vanliga medlemmar och allas papperskorg for admin.
20. Aterstalla raderad data enligt behorighet.

## 9. UX-krav

- UI:t ska vara tydligt nog for bade vuxna och barn.
- Startsidan ska kombinera kalender med runda klickbara medlemsbilder.
- Medlemsnamn ska helst visas som bojd text runt den runda bilden, annars tydligt under bilden.
- Vuxnas dashboard ska ha enkel vaxling mellan kalender, todo och inkopslistor.
- Vuxna ska kunna byta mellan fem dashboardteman genom langtryck pa bakgrunden.
- Todo-listor for barn ska vara fargglada och anvanda Lucide-ikoner.
- Barn ska kunna byta dashboardtema genom langtryck pa bakgrunden.
- Vantande uppgifter ska visas som uppgiftsbilder pa banan tills foralder/admin godkanner dem.
- Godkanda uppgifter ska forvandlas till stjarnor pa samma plats pa banan.
- Adminfloden ska anvanda checkboxar for behorigheter.
- Delningsfloden ska tydligt visa `Kan se` och `Kan redigera`.
- Raderingsfloden ska tydligt visa att datan hamnar i papperskorg.

## 10. Beslutade regler

1. Agaren ska alltid kunna redigera sin egen kalender och inkopslista.
2. Barn kan skapa onskningar, men foralder eller admin maste godkanna dem innan de blir aktiva beloningar.
3. Delade kalendrar med endast `view`-atkomst ska inte kunna exporteras.
4. Gemensamma todos ska kunna ge stjarnor.
5. Admin ska kunna se allas papperskorg redan i MVP.

## 11. Nasta BMAD-steg

Efter denna PRD bor nasta steg vara:

1. UX-dokument for huvudskarmar och anvandarfloden.
2. Arkitektur for datamodell, frontend, lagring och behorighetskontroller.
3. Epics och stories for stegvis implementation.

## 12. Implementationslage 2026-06-09

Den aktuella prototypen har redan implementerat stora delar av MVP i frontend med React, TypeScript och `localStorage`.

### Implementerat

- Konto kan vara `family` eller `workplace`.
- Medlemmar kan skapas inne i appen.
- Barnkonton kan skapas i familjelage.
- Medlemmar kan fa egen avatar/bild.
- Runda klickbara medlemsbilder oppnar personliga dashboards.
- Medlemsnamn visas som bojd text runt avatar i startsidans medlemsvy.
- Roller kan skapas.
- Behorigheter kan kryssas i per roll.
- Roller kan tilldelas medlemmar.
- Vuxen-dashboard har flikar for kalender, todo och inkop.
- Dashboardtema kan bytas med langtryck for vuxna och barn.
- Kalender kan skapas, delas, importeras och exporteras.
- Inkopslistor kan skapas, delas, redigeras och mjukraderas.
- Todos kan skapas, tilldelas och markeras klara.
- Barns klara todos kan godkannas eller nekas av vuxen med ratt behorighet.
- Barn-dashboard visar aktiva todos, beloningsbana, vantande uppgiftsbilder och godkanda stjarnor.
- Pending-todos med passerat `expiresAt` blir `expired`.
- Anvandare kan radera egen data i mjukt lage.
- Papperskorg visar och aterstaller medlemmar, kalendrar, todos och inkopslistor.

### Kvar i MVP

- UI for barns onskningar och foraldragodkannande av onskningar.
- Tydligare feedback nar barnets uppgift nekas.
- Animation for fallande eller mjukt inkommande todo-bilder.

### Nasta prioritet

Nasta prioritet enligt BMAD ar att fylla nasta tydliga glapp i barnupplevelsen: nekade uppgifter finns i datan men barnet far annu ingen tydlig och lugn feedback. Nasta story bor vara Story 6.5:

- visa nekad uppgift pa ett lugnt satt
- se till att nekad uppgift inte blir stjarna
- ta bort eller tona bort vantande uppgiftsbild fran banan
- testa att `rejected` inte paverkar progress
