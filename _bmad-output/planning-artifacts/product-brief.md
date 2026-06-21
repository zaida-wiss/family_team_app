# Product Brief: Familje- och teamapp

## Ide

En app for familjer, kontor och andra grupper dar medlemmar kan dela kalender, inkopslistor och todo-listor. Appen ska fungera bade for vardag i familjen och for enklare samarbete i team eller pa kontor.

## Malgrupper

- Familjer
- Barnfamiljer
- Kontor
- Mindre team
- Grupper som behover dela planering och ansvar

## Problem

Familjer och team har ofta information utspridd i flera appar: kalender i en app, inkop i en annan och uppgifter i en tredje. Det blir svart att se vem som ansvarar for vad, vad som ar privat, vad som ar delat och vilka personer som far se eller andra information.

For barn behovs dessutom ett tydligt och roligt satt att forsta sina uppgifter, samla beloningar och se sin progress utan att allt bygger pa mycket text.

## Mal

Appen ska ge en tydlig gemensam plats for:

- Medlemmar
- Startsida med kalender och klickbara medlemsbilder
- Roller och behorigheter
- Privata och delade kalendrar
- Privata och delade inkopslistor
- Personliga och gemensamma todos
- Aterkommande todos med schema
- Barnvanliga todo-listor med farger och symboler
- Stjarnor, onskningar och beloningsbana for barn
- Import och export av kalendrar
- Papperskorg med mjuk radering

## Medlemmar

Medlemmar ska skapas inne i appen. Appen ska inte ha namn hardkodade i forvag.

En anvandare ska kunna lagga till sa manga medlemmar som behovs, sa att appen fungerar for bade familjer och kontor.

Varje medlem ska kunna kopplas till en roll.

Nar ett konto skapas ska anvandaren valja om kontot ska anvandas for familj eller arbetsplats.

For familjer ska appen stodja ett familjekonto. Vuxna ska kunna ga in i installningar och skapa barnkonton i familjekontot.

Samtliga vuxna i samma familjekonto ska kunna godkanna barns uppgifter och fylla i/lagga upp uppgifter pa barnkontot, om deras roll tillater det.

For arbetsplats ska appen stodja ett arbetsplatskonto med medlemmar, roller, kalender, todos och inkopslistor. Barnkonton, stjarnor och beloningsbana ska inte vara standard i arbetsplatslage.

Startsidan ska visa runda bilder eller avatarer for medlemmarna. Bilderna ska kunna klickas for att oppna medlemmens personliga dashboard.

Medlemmens namn ska visas vid bilden, helst som bojd text i en bage runt den runda bilden. Om det blir for avancerat i forsta implementationen ska namnet visas tydligt under bilden.

## Roller och behorigheter

Admin ska kunna skapa roller inne i appen och kryssa i vad varje roll far se och gora.

Exempel pa roller:

- Admin
- Foralder
- Barn
- Medlem
- Gast
- Kollega

Roller ska kunna styra exempelvis:

- Se alla todos
- Se egna todos
- Skapa todos
- Markera tilldelade todos som klara
- Redigera todos
- Radera todos
- Se alla kalendrar
- Se egen kalender
- Redigera kalender
- Importera kalender
- Exportera kalender
- Se inkopslistor
- Redigera inkopslistor
- Hantera medlemmar
- Hantera roller
- Se papperskorg
- Aterstalla fran papperskorg
- Godkanna barns uppgifter
- Skapa barnkonto i familjekonto
- Hantera barns uppgifter

## Kalender

En medlem ska kunna ha en privat kalender i appen.

Vuxnas dashboard ska innehalla kalender, todo och inkopslistor som ar latta att vaxla mellan.

Vuxna ska kunna vaxla mellan fem olika dashboardteman genom att trycka lange pa bakgrunden.

Kalendrar ska kunna delas med andra medlemmar. Den som delar ska kunna valja om mottagaren:

- Kan se
- Kan redigera

En medlem ska kunna se sin egen kalender. Admin eller roller med ratt behorighet ska kunna se mer enligt rollens behorigheter.

Appen ska kunna importera kalendrar, i forsta hand via `.ics`-fil. Appen ska ocksa kunna exportera kalender till `.ics`, sa att anvandaren kan ta med sig sin kalender till andra kalenderappar.

## Inkopslistor

Inkopslistor ska kunna vara privata eller delade.

Precis som med kalendern ska agaren kunna dela en inkopslista med valfria medlemmar och valja atkomstniva:

- Kan se
- Kan redigera

Rollens behorigheter ska fortfarande styra om medlemmen generellt far anvanda inkopslistor.

## Todos

Todos ska kunna vara personliga eller gemensamma.

Vuxna ska kunna skapa todos som aterkommer enligt schema, till exempel veckovis eller med ett eget valt intervall.

Vissa medlemmar ska bara kunna se sina egna todos. En egen todo betyder en uppgift som ar tilldelad medlemmen.

Todos ska ha skillnad mellan:

- Vem som skapade uppgiften
- Vem uppgiften ar tilldelad

Den som ar tilldelad en todo ska inte automatiskt fa redigera eller radera den.

Regler:

- Den som skapade en todo far redigera den.
- Admin med ratt behorighet far redigera todos.
- Den som ar tilldelad far markera den som klar om rollen tillater det.
- Den som skapade en todo far radera den.
- Admin med ratt behorighet far radera todos.

## Barnlage, stjarnor och beloningar

Todo-listor ska kunna ha tydliga symboler och farger, sa att barn enkelt kan kanna igen dem.

Appen ska anvanda Lucide-ikoner for symboler. I datan sparas ikonens namn, till exempel `Sun`, `Home`, `BookOpen` eller `Trophy`.

Barn ska kunna onska sig saker eller beloningar.

Barnens dashboard ska vara glad, positiv och enkel att forsta. Den ska ge lust att trycka pa sina uppgifter och folja sin progress.

Barn och vuxna ska kunna andra tema pa sin egen dashboard genom att halla fingret lange pa dashboardens bakgrund.

Todo-uppgifter ska kunna ge olika manga stjarnor. En foralder eller admin ska godkanna uppgiften innan stjarnorna raknas.

Foralder eller admin ska ocksa godkanna barns onskningar innan de blir aktiva beloningar i appen.

Status for en todo kan exempelvis vara:

- Ej klar
- Klar men vantar pa godkannande
- Godkand
- Nekad

Godkanda stjarnor ska raknas mot beloningen.

Uppgifter som barnet markerat som klara men som vantar pa godkannande ska visas som uppgiftsbilder pa beloningsbanan, inte som stjarnor.

Beloningsbanan ska visa:

- Hur manga godkanda stjarnor barnet har
- Vilka uppgiftsbilder som vantar pa godkannande
- Hur manga godkanda stjarnor som saknas till beloningen
- Nar beloningen ar upplast

Endast godkanda stjarnor ska raknas mot beloningen.

Aktiva todos for barn ska kunna visas som tydliga bilder eller kort som ramlar ner i dashboarden vid installda tider. Barnet ska kunna trycka pa en todo-bild for att markera uppgiften som klar. Bilden placeras da pa beloningsbanan som vantande. Nar foralder eller admin godkanner uppgiften forvandlas bilden till en eller flera stjarnor pa samma plats pa banan. Hur manga stjarnor som visas beror pa uppgiftens stjarnvarde.

Foralder ska kunna stalla in hur lange en barns todo ar aktiv. Om uppgiften inte blir avklarad inom tiden ska den forsvinna fran barnets aktiva dashboard och markeras som missad eller utgangen.

## Mjuk radering och papperskorg

Appen ska anvanda mjuk radering.

Det betyder att data inte tas bort direkt. I stallet markeras den som raderad med exempelvis:

- `deletedAt`
- `deletedBy`

Vanliga vyer ska inte visa raderad data.

Papperskorgen ska visa raderad data. I forsta versionen ska en vanlig medlem bara se sina egna raderade saker, medan admin ska kunna se allas raderade saker.

Raderad data ska kunna aterstallas enligt behorighet.

## Forsta MVP

Forsta versionen bor fokusera pa:

1. Skapa medlemmar inne i appen
2. Skapa roller och kryssa i behorigheter
3. Tilldela roll till medlem
4. Skapa privata och delade kalendrar
5. Skapa privata och delade inkopslistor
6. Skapa todos med skapare, tilldelad medlem och status
7. Visa bara det medlemmen har ratt att se
8. Mjuk radering med enkel papperskorg
9. Barnvanliga todo-listor med Lucide-ikon och farg
10. Stjarnor pa todos med foraldragodkannande
11. Startsida med kalender och runda klickbara medlemsbilder
12. Barn-dashboard med beloningsbana och tema

## Senare funktioner

- Direkt synkning med Google Calendar eller Outlook
- Mer avancerade delningsnivaer
- Statistik over uppgifter och stjarnor
- Flera beloningsbanor per barn
- Notiser och paminnelser
