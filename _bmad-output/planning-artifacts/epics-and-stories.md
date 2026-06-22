# Epics and Stories: Familjeapp

## 1. Syfte

Detta dokument bryter ner PRD, UX och arkitektur till byggbara delar. Varje story ska vara tillrackligt liten for att kunna implementeras, testas och visas.

## Testdata-krav (galler alla stories)

Varje story bor ha minst:

- En ny testfil eller ett nytt testfall.
- Minst en aktiv beloning finns.
- Minst en privat kalender finns.
- Minst en delad inkopslista finns.
- Minst tre todos finns med olika statusar.

## Epic 1: Projektgrund och datamodell

Mal: Fa appen att starta och definiera de centrala typerna.

### Story 1.1: Initiera React-app med TypeScript

Som utvecklare vill jag ha en React-app med TypeScript sa att koden kan typkontrolleras fran borjan.

Acceptanskriterier:

- React + TypeScript-app kan startas lokalt.
- Inga kompileringsfel.
- Inga oanvanda beroenden.

### Story 1.2: Definiera centrala typer

Som utvecklare vill jag ha en central typfil sa att alla moduler delar samma datastrukturer.

Acceptanskriterier:

- `Account`, `Member`, `Role`, `Todo`, `Calendar`, `ShoppingList`, `Reward` ar definierade.
- `AccountType = "family"`.
- Alla typer exporteras fran en central plats.
- Inga duplikat av samma typ i olika filer.

### Story 1.3: Skapa testdata

Som utvecklare vill jag ha realistisk testdata sa att appen kan koras utan att allt maste konfigureras manuellt.

Acceptanskriterier:

- Minst en familj med tre medlemmar.
- Minst en privat kalender finns.
- Minst en delad inkopslista finns.
- Minst tre todos finns med olika statusar.
- Minst en aktiv beloning finns.

## Epic 2: Roller och behorigheter

Mal: Bygga reglerna som styr vad varje medlem far se och gora.

### Story 2.1: Implementera behorighetsfunktioner

Som utvecklare vill jag samla behorighetsregler i rena funktioner sa att UI:t inte hittar pa egna regler.

Acceptanskriterier:

- `getRoleForMember` finns.
- `hasPermission` finns.
- Saknad roll hanteras tydligt.
- Funktionerna har enkla tester eller exempel.

Varfor:

Om behorighet sprids i komponenter blir appen svar att lita pa.

### Story 2.2: Implementera resursatkomst for delade resurser

Som medlem vill jag bara se och redigera resurser jag ager eller har fatt delade.

Acceptanskriterier:

- `getShareAccess` finns.
- `canViewResource` finns.
- `canEditSharedResource` finns.
- Agare far `edit`.
- Delad `view` ger bara lasatkomst.
- Delad `edit` ger redigeringsatkomst.

### Story 2.3: Bygg roll-editor med checkboxar

Som admin vill jag skapa roller och kryssa i behorigheter sa att varje roll kan anpassas efter familjen.

Acceptanskriterier:

- Admin kan skriva rollnamn.
- Admin kan markera om rollen ar en barnroll (`isChildRole`).
- Behorigheter visas som checkboxar.
- Checkboxar skapas fran en central lista, inte hardkodas en och en.
- Rollen kan sparas i lokal state.
- Rollen kan tilldelas en medlem.

Ledande fraga:

Varfor loopar vi over en behorighetslista i stallet for att skriva varje checkbox manuellt? For att appen ska kunna vaxa utan att rollpanelen maste skrivas om.

## Epic 3: Medlemmar och startsida

Mal: Bygga den gemensamma forstasidan med kalender och klickbara medlemmar.

### Story 3.1: Skapa medlemshantering

Som admin vill jag kunna skapa medlemmar inne i appen sa att namn inte ar hardkodade.

Acceptanskriterier:

- Admin kan skriva namn.
- Admin kan valja roll (inkl. barnroll via `isChildRole` pa rollen).
- Admin kan valja eller lagga till avatar/bild.
- Medlemmen visas i medlemslistan.

### Story 3.1b: Skapa barnkonto fran installningar

Som vuxen vill jag kunna ga till installningar och skapa konto at mina barn i familjekontot.

Acceptanskriterier:

- Vuxen med `canCreateChildAccounts` kan oppna installningar.
- Vuxen kan skapa barnkonto.
- Barnkonto kopplas till samma familjekonto.
- Vuxen kan valja namn, avatar, roll och starttema.
- Barnkontot visas pa startsidan.

### Story 3.1c: Lata vuxna i familjekonto hantera barnuppgifter

Som vuxen i familjekontot vill jag kunna fylla i och godkanna uppgifter pa barnkontot.

Acceptanskriterier:

- Vuxna i samma familjekonto kan skapa uppgifter at barn om rollen tillater det.
- Vuxna i samma familjekonto kan godkanna barns klara uppgifter om rollen har `canApproveTodos`.
- Vuxna utanfor familjekontot kan inte hantera barnkontot.
- Reglerna kontrolleras av behorighetsfunktioner, inte bara UI.

### Story 3.2: Bygg startsida med kalender som huvudvy

Som anvandare vill jag se kalendern direkt nar appen oppnas sa att jag snabbt forstar vad som hander.

Acceptanskriterier:

- Startsidan visar kalenderoversikt.
- Dagens och kommande handelser visas.
- Kalendern ar den visuellt primara delen.
- Raderade handelser visas inte.

### Story 3.3: Visa runda klickbara medlemsbilder

Som anvandare vill jag klicka pa en medlemsbild for att komma till personens dashboard.

Acceptanskriterier:

- Medlemsbilder visas runda.
- Namn visas vid varje bild.
- Om bagtext ar byggd visas namnet bojt runt bilden.
- Om bagtext inte ar byggd visas namnet tydligt under bilden.
- Klick pa bilden oppnar ratt dashboard.

## Epic 4: Dashboard for vuxna

Mal: Ge vuxna kontroll over kalender, todos, listor och godkannanden.

### Story 4.1: Bygg vuxen-dashboard

Som vuxen vill jag se min kalender, mina todos och delade resurser pa ett stalle.

Acceptanskriterier:

- Vuxen-dashboard har tydlig vaxling mellan kalender, todo och inkopslistor.
- Kalender, todo och inkopslistor kan visas utan att lamna dashboarden.
- Egen kalender visas.
- Delade kalendrar visas om atkomst finns.
- Egna todos visas.
- Delade inkopslistor visas.
- Handlingar visas bara om behorighet finns.

### Story 4.2: Byt vuxentema med langtryck

Som vuxen vill jag kunna byta mellan fem dashboardteman genom att trycka lange pa bakgrunden.

Acceptanskriterier:

- Langtryck pa vuxen-dashboardens bakgrund oppnar temaval.
- Fem vuxenteman visas.
- Vuxna teman ar lugna och praktiska.
- Valet sparas pa medlemmens profil.
- Temat paverkar bara medlemmens egen dashboard.

### Story 4.3: Visa godkannandeko for barns todos

Som foralder vill jag se uppgifter barn markerat som klara sa att jag kan godkanna eller neka dem.

Acceptanskriterier:

- Uppgifter med status `done` visas i ko.
- Foralder ser barnets namn.
- Foralder ser uppgiftens titel och stjarnvarde.
- Foralder kan godkanna.
- Foralder kan neka.
- Godkannande satter status `approved`.
- Nekande satter status `rejected`.

## Epic 5: Todos och scheman

Mal: Bygga uppgiftssystemet for vuxna, barn och gemensamma uppgifter.

### Story 5.1: Skapa todo

Som vuxen/admin vill jag skapa en todo och tilldela den till en medlem eller gora den gemensam.

Acceptanskriterier:

- Todo har titel.
- Todo har `createdBy`.
- Todo kan ha `assignedTo`.
- Todo kan vara gemensam.
- Todo kan ha stjarnvarde.
- Todo kan ha visuell ikon/bild.

### Story 5.2: Implementera todo-regler

Som system vill jag avgora vem som far redigera, radera och markera en todo som klar.

Acceptanskriterier:

- Skapare kan redigera todo.
- Admin med `canEditAnyTodos` kan redigera todo.
- Tilldelad medlem kan inte redigera text automatiskt.
- Tilldelad medlem kan markera klar om rollen tillater det.
- Skapare kan mjukradera todo.
- Admin med `canDeleteAnyTodos` kan mjukradera todo.

### Story 5.3: Skapa aterkommande todo

Som vuxen vill jag kunna skapa uppgifter som aterkommer veckovis eller enligt valt intervall.

Acceptanskriterier:

- Anvandaren kan valja engangsuppgift.
- Anvandaren kan valja veckovis uppgift.
- Anvandaren kan valja eget intervall.
- Uppgiften kan ha starttid.
- Uppgiften kan ha tidsfonster eller sluttid.
- Appen kan skapa dagens uppgifter fran schema.

### Story 5.4: Hantera utgangna barns todos

Som foralder vill jag kunna stalla in att en barns uppgift forsvinner om den inte blir gjord i tid.

Acceptanskriterier:

- Todo kan ha `visibleFrom`.
- Todo kan ha `expiresAt`.
- Om tiden passerar och status ar `pending` blir uppgiften `expired`.
- `expired` visas inte som aktiv uppgift pa barnets dashboard.
- `expired` ger inga stjarnor.

## Epic 6: Barn-dashboard och beloningsbana

Mal: Bygga barnens glada och tydliga dashboard.

### Story 6.1: Bygg grund for barn-dashboard

Som barn vill jag se en enkel och glad dashboard sa att jag snabbt forstar vad jag kan gora.

Acceptanskriterier:

- Barnets namn visas.
- Barnets avatar visas.
- Barnets tema styr utseendet.
- Aktiva todos visas visuellt.
- Beloningsbana visas.
- Stjarnor kvar till beloning visas.

### Story 6.2: Visa beloningsbana

Som barn vill jag se en bana mot min beloning sa att jag forstar hur nara jag ar.

Acceptanskriterier:

- Godkanda todos visas som stjarnor.
- `done`-todos visas som uppgiftsbilder pa banan.
- Uppgiftsbilder pa banan raknas inte som godkanda stjarnor.
- Stjarnor kvar raknas bara fran `approved`.
- Beloningen visas vid slutet av banan.

### Story 6.3: Tryck pa todo-bild for att markera klar

Som barn vill jag trycka pa en uppgiftsbild nar jag ar klar sa att den hamnar pa banan.

Acceptanskriterier:

- Aktiv todo visas som bild/kort.
- Barn kan trycka pa bilden.
- Todo-status blir `done`.
- Bilden flyttas till beloningsbanan.
- Bilden blir inte stjarna innan foralder godkanner.

### Story 6.4: Forvandla godkand uppgiftsbild till stjarna

Som barn vill jag se att en godkand uppgift blir stjarnor pa samma plats pa banan.

Acceptanskriterier:

- Nar todo blir `approved` ersatts uppgiftsbilden med stjarnor.
- Antal stjarnor motsvarar `starValue`.
- Stjarnorna behaller uppgiftens plats pa banan.
- Banan uppdaterar antal stjarnor kvar.

### Story 6.5: Hantera nekad uppgift pa banan

Som barn vill jag forsta lugnt att en uppgift inte gav stjarnor om den nekas.

Acceptanskriterier:

- Nar todo blir `rejected` forvandlas den inte till stjarna.
- Uppgiftsbilden tas bort fran progress eller visas kort som nekad.
- Barnet far tydlig men lugn feedback.

### Story 6.6: Lagg till fallande todo-bilder

Som barn vill jag att uppgifter kommer in roligt pa dashboarden sa att jag far lust att trycka pa dem.

Acceptanskriterier:

- Aktiva todos kan visas som fallande eller mjukt inkommande bilder.
- Animationen paverkar inte affarsdata.
- Bilden ar stor nog att trycka pa.
- Animationen respekterar `visibleFrom` och `expiresAt`.

## Epic 7: Barnens teman och onskningar

Mal: Ge barnen egen kontroll over kanslan i sin dashboard och mojlighet att onska beloningar.

### Story 7.1: Byt barntema med langtryck

Som barn vill jag kunna halla fingret lange pa bakgrunden for att byta tema.

Acceptanskriterier:

- Langtryck pa barn-dashboardens bakgrund oppnar temaval.
- Barnet kan valja tema visuellt.
- Valet sparas pa barnets profil.
- Temat paverkar bara barnets egen dashboard.
- Det finns fallback-knapp om langtryck ar svart att upptacka.

### Story 7.2: Skapa onskning

Som barn vill jag kunna onska en beloning sa att vuxna kan godkanna den.

Acceptanskriterier:

- Barn kan skriva namn pa onskning.
- Onskningen far status `suggested`.
- Foralder/admin kan se onskningen.
- Onskningen blir inte aktiv innan godkannande.

### Story 7.3: Godkann eller neka onskning

Som foralder vill jag godkanna barns onskningar innan de blir aktiva beloningar.

Acceptanskriterier:

- Foralder/admin kan godkanna onskning.
- Foralder/admin kan neka onskning.
- Godkand onskning blir aktiv beloning.
- Aktiv beloning har `starsNeeded`.

## Epic 8: Kalender

Mal: Bygga privata och delade kalendrar med import/export.

### Story 8.1: Skapa kalender

Som medlem vill jag skapa en egen kalender.

Acceptanskriterier:

- Kalender har namn.
- Kalender har agare.
- Kalender kan ha farg.
- Agare kan alltid redigera kalendern.

### Story 8.2: Dela kalender

Som agare vill jag dela kalender med andra och valja om de far se eller redigera.

Acceptanskriterier:

- Agare kan valja medlem.
- Agare kan valja `view`.
- Agare kan valja `edit`.
- Delad `view` kan inte redigera.
- Delad `edit` kan redigera om rollen tillater det.

### Story 8.3: Importera ICS

Som medlem vill jag importera en `.ics`-fil till min kalender.

Acceptanskriterier:

- Anvandaren kan valja `.ics`-fil.
- Appen kan lasa handelser.
- Handelser laggs i vald kalender.
- Importerade handelser har `createdBy`.
- Importerade handelser ar kopior i MVP.

### Story 8.4: Exportera ICS

Som medlem vill jag exportera kalender om jag ager den eller har tillracklig atkomst.

Acceptanskriterier:

- Agare kan exportera sin kalender om rollen tillater export.
- Delad `edit` kan exportera om rollen tillater export.
- Delad `view` kan inte exportera.
- Export skapar `.ics`-innehall.

## Epic 9: Inkopslistor

Mal: Bygga privata och delade inkopslistor.

### Story 9.1: Skapa inkopslista

Som medlem vill jag skapa en inkopslista.

Acceptanskriterier:

- Lista har namn.
- Lista har agare.
- Lista kan ha farg och ikon.
- Agare kan alltid redigera sin lista.

### Story 9.2: Dela inkopslista

Som agare vill jag dela inkopslistan med `view` eller `edit`.

Acceptanskriterier:

- Agare kan valja medlem.
- Agare kan valja `view`.
- Agare kan valja `edit`.
- `view` kan bara titta.
- `edit` kan andra om rollen tillater det.

### Story 9.3: Hantera inkopsposter

Som medlem med ratt atkomst vill jag lagga till och bocka av varor.

Acceptanskriterier:

- Medlem med redigeringsatkomst kan lagga till vara.
- Medlem med redigeringsatkomst kan bocka av vara.
- Medlem utan redigeringsatkomst kan bara se.
- Varor kan mjukraderas.

## Epic 10: Papperskorg och soft delete

Mal: Gora radering trygg och aterstallningsbar.

### Story 10.1: Implementera soft delete

Som system vill jag markera data som raderad i stallet for att ta bort den direkt.

Acceptanskriterier:

- Objekt far `deletedAt`.
- Objekt far `deletedBy`.
- Vanliga vyer filtrerar bort raderad data.
- Soft delete fungerar for todo, kalender, kalenderhandelse, inkopslista och inkopspost.

### Story 10.2: Visa papperskorg

Som medlem vill jag se mina raderade saker sa att jag kan aterstalla vid misstag.

Acceptanskriterier:

- Vanlig medlem ser egna raderade saker.
- Admin kan se allas raderade saker.
- Varje rad visar typ, titel, agare, raderad av och tid.

### Story 10.3: Aterstall raderad data

Som medlem med ratt behorighet vill jag aterstalla raderad data.

Acceptanskriterier:

- Agare kan aterstalla egen data om rollen tillater det.
- Admin med `canRestoreFromTrash` kan aterstalla enligt behorighet.
- Aterstallning tar bort `deletedAt` och `deletedBy`.
- Aterstalld data syns igen i vanliga vyer.

## Epic 11: Test och kvalitet

Mal: Sakerstalla att reglerna fungerar innan appen vaxer.

### Story 11.1: Testa behorighetsfunktioner

Som utvecklare vill jag testa behorighetsregler sa att privat data inte visas fel.

Acceptanskriterier:

- Test for `hasPermission`.
- Test for `canViewResource`.
- Test for `canEditSharedResource`.
- Test for `canExportCalendar`.
- Test for `canEditTodo`.
- Test for `canDeleteTodo`.
- Test for `canCompleteTodo`.

### Story 11.2: Testa beloningsbana

Som utvecklare vill jag testa beloningsbanan sa att uppgiftsbilder och stjarnor raknas ratt.

Acceptanskriterier:

- `pending` raknas inte.
- `done` visas som vantande uppgiftsbild.
- `approved` raknas som stjarnor.
- `rejected` raknas inte.
- `expired` raknas inte.
- `starsLeft` baseras bara pa godkanda stjarnor.

### Story 11.3: Testa soft delete och papperskorg

Som utvecklare vill jag testa radering och aterstallning sa att data inte forsvinner av misstag.

Acceptanskriterier:

- Soft delete satter `deletedAt` och `deletedBy`.
- Vanliga selectors filtrerar bort raderad data.
- Papperskorg visar ratt data for vanlig medlem.
- Papperskorg visar all data for admin.
- Aterstallning gor data aktiv igen.

## Rekommenderad sprintordning

1. Epic 1: Projektgrund och datamodell
2. Epic 2: Roller och behorigheter
3. Epic 3: Medlemmar och startsida
4. Epic 5: Todos och scheman
5. Epic 6: Barn-dashboard och beloningsbana
6. Epic 4: Dashboard for vuxna
7. Epic 7: Barnens teman och onskningar
8. Epic 8: Kalender
9. Epic 9: Inkopslistor
10. Epic 10: Papperskorg och soft delete
11. Epic 11: Test och kvalitet

## Implementationstatus 2026-06-22

Den aktuella implementationen ar fullstack: React + TypeScript (Vite) i frontend, Express 4 + MongoDB Atlas (Mongoose) i backend.

### Done i prototyp

- Story 1.1: React + TypeScript-app finns och kan byggas.
- Story 1.2: Centrala typer finns i `shared/types.ts` (delade mellan frontend och backend).
- Story 1.3: Testdata finns i `backend/src/db/seed.ts`.
- Story 2.1: Grundfunktioner for roller och behorigheter finns i `frontend/src/utils/permissions.ts`.
- Story 2.2: Resursatkomst for agda/delade resurser finns.
- Story 2.3: Roll-editor med checkboxar finns, inklusive `isChildRole`.
- Story 3.1: Medlemmar kan skapas inne i appen.
- Story 3.1b: Barnkonto kan skapas fran installningar i familjekonto.
- Story 3.2: Startsida visar kalenderoversikt.
- Story 3.3: Runda klickbara medlemsbilder finns med bagtext.
- Story 4.1: Vuxen-dashboard har flikar for kalender, todo och inkop.
- Story 4.2: Vuxentema kan bytas med langtryck.
- Story 4.3: Godkannandeko for barns klara todos finns.
- Story 5.1: Todo kan skapas och tilldelas.
- Story 5.2: Todo-regler ar implementerade i UI for redigering och mjuk radering.
- Story 5.3: Aterkommande todos kan skapa dagens forekomst utan dubbletter.
- Story 5.4: `expiresAt` kan gora pending-todos expired.
- Story 6.1: Grund for barn-dashboard finns.
- Story 6.2: Beloningsbana visar godkanda stjarnor och vantande uppgifter.
- Story 6.3: Barn kan trycka pa uppgift for att markera klar.
- Story 7.1: Barntema kan bytas med langtryck.
- Story 8.1: Kalender kan skapas.
- Story 8.2: Kalender kan delas med `view` eller `edit`.
- Story 8.3: `.ics` kan importeras.
- Story 8.4: Kalender kan exporteras till `.ics`.
- Story 9.1: Inkopslista kan skapas.
- Story 9.2: Inkopslista kan delas med `view` eller `edit`.
- Story 9.3: Inkopsposter kan laggas till och bockas av.
- Story 10.1: Soft delete finns for flera datatyper.
- Story 10.2: Papperskorg visar raderade medlemmar, kalendrar, todos och inkopslistor.
- Story 10.3: Raderade medlemmar, kalendrar, todos och inkopslistor kan aterstallas.
- Story 11.1: Tester for behorighetsfunktioner finns och kan koras med `npm test`.
- Story 11.2: Tester for beloningsbanan finns och kan koras med `npm test`.
- Story 11.3: Tester for soft delete och papperskorg finns och kan koras med `npm test`.

### Delvis gjort

- Story 6.4: Godkanda uppgifter blir stjarnor i progress, men flera stjarnor per uppgift visas inte som separata steg pa banan.
- Story 6.5: Nekade uppgifter tas bort fran progress, men barnet far ingen sarskild lugn feedback.
- Story 6.6: Aktiva todo-kort finns, men fallande/mjukt inkommande animation ar inte byggd.
- Story 7.2: Datamodell for rewards finns, men barn kan inte skapa egna onskningar i UI.
- Story 7.3: Godkann/nekande av onskningar saknas i UI.

### Viktig teknisk skuld

- Kalenderimporten parse:ar bara enkla `.ics`-fall i MVP.
- Bilddata som data-URL kan bli tungt om manga stora bilder laddas upp.

## Nasta BMAD-story att bygga

Nasta rekommenderade story ar Story 6.5: Hantera nekad uppgift pa banan.

Det betyder:

- Visa lugn feedback nar en uppgift nekas.
- Se till att nekad uppgift inte blir stjarna.
- Ta bort eller tona bort vantande uppgiftsbild fran banan.
- Testa att `rejected` inte paverkar barnets progress.

Varfor:

Nekade uppgifter finns i datan och raknas inte som stjarnor, men barnets UI ger annu ingen tydlig och lugn forklaring. Det ar nasta viktiga glapp i barnupplevelsen.
