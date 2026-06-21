# UX: Familje- och teamapp

## 1. UX-mal

Appen ska kannas tydlig for vuxna och rolig for barn. Den ska oppna pa en gemensam oversikt, men snabbt lata anvandaren ga in pa en persons egen dashboard.

Designen ska stodja tva olika arbetssatt:

- Vuxna vill planera, skapa schema och hantera ansvar.
- Barn ska snabbt forsta vad de kan gora nu och hur det for dem narmare en beloning.

## 2. Forsta skarmen: kalender och medlemmar

Innan forsta skarmen visas for ett nytt konto ska anvandaren valja kontotyp:

- Familj
- Arbetsplats

Valet styr vilka standardfunktioner som visas. Familj visar stod for barnkonton och beloningsbana. Arbetsplats visar medlemmar, roller, kalender, todo och inkopslistor utan barnfunktioner som standard.

Startsidan ska visa kalendern som huvudvy. Kalendern ska ge en snabb bild av dagens och veckans handelser.

Pa samma skarm ska medlemmarna visas som runda bilder eller avatarer. Varje bild ska vara klickbar och leda till medlemmens personliga dashboard.

Medlemsnamn ska visas vid bilden. Onskad losning ar bojd text i en bage runt den runda bilden. Om det blir for avancerat i forsta implementationen ska namnet visas tydligt under bilden.

Varfor: startsidan blir bade gemensam och personlig. Kalendern svarar pa "vad hander?", medan medlemsbilderna svarar pa "vem galler det?".

## 3. Medlemskort pa startsidan

Varje medlemskort ska innehalla:

- Rund bild eller avatar
- Namn
- Tydlig rollkansla, till exempel barn eller vuxen
- Visuell indikator om medlemmen har viktiga saker idag

Interaktion:

- Klick pa bilden oppnar personens dashboard.
- Hover/fokus pa desktop ska visa att bilden ar klickbar.
- Touch pa mobil ska vara stor nog for barn att traffa enkelt.

## 4. Personlig dashboard for vuxna

Vuxnas dashboard ska fokusera pa kontroll och planering.

Den ska visa:

- Egen kalender
- Delade kalendrar som personen far se
- Egna todos
- Todos personen skapat at andra
- Inkoplistor personen ager eller har fatt delade
- Verktyg for att skapa aterkommande todos
- Uppgifter som vantar pa godkannande om personen far godkanna barns todos

Vuxnas dashboard ska ha tydlig vaxling mellan:

- Kalender
- Todo
- Inkopslistor

Vaxlingen kan byggas som flikar, segmenterad kontroll eller tydliga navigationsknappar. Rekommenderad MVP-losning ar flikar eftersom det ar enkelt att forsta och snabbt att bygga.

Vuxna ska kunna byta mellan fem dashboardteman genom langtryck pa bakgrunden.

Vuxenteman ska vara lugna och praktiska. Forslag:

- Klar
- Fokus
- Varm
- Mork
- Natur

## 4.1 Installningar for konto

Kontoinstallningar ska visa om kontot ar familj eller arbetsplats.

I familjelage ska installningar innehalla barnkonton och vuxna.

I arbetsplatslage ska installningar innehalla medlemmar, roller och arbetsplatsinstallningar.

## 4.2 Installningar for familjekonto

Vuxna med ratt behorighet ska kunna ga till installningar for familjekontot.

Installningar ska innehalla:

- Skapa barnkonto
- Valja barnets namn
- Valja barnets avatar/bild
- Valja roll for barnet
- Valja starttema for barnets dashboard
- Hantera vilka vuxna som finns i familjekontot

Samtliga vuxna i samma familjekonto ska kunna:

- Skapa uppgifter at barn om rollen tillater det
- Fylla i/lagga upp uppgifter pa barnkontot
- Godkanna eller neka klara uppgifter om rollen har godkannandebehorighet

Varfor: barnkontot ska inte vara beroende av en enda vuxen. I en familj behover flera vuxna kunna hjalpas at.

Vuxna ska kunna skapa todos med schema:

- Engangsuppgift
- Veckovis uppgift
- Eget valt intervall
- Starttid
- Sluttid eller tidsfonster
- Stjarnvarde om uppgiften riktas till barn
- Om uppgiften ska forsvinna om den inte ar klar i tid

## 5. Personlig dashboard for barn

Barnens dashboard ska vara glad, positiv och enkel att forsta. Den ska inte kannas som en vuxenlista med mycket text.

Den ska visa:

- Barnets namn och bild
- Barnets valda tema
- Beloningsbana
- Godkanda stjarnor
- Vantande uppgiftsbilder
- Hur manga godkanda stjarnor som saknas till beloningen
- Aktiva todos som visuella kort eller bilder
- Onskningar och beloningar som ar godkanda

Barnets dashboard ska prioritera handling:

- Vad kan jag gora nu?
- Vad far jag for det?
- Hur nara ar jag min beloning?

## 6. Beloningsbana

Beloningsbanan ska visuellt visa hur barnet ror sig mot malet.

Regler:

- Godkanda stjarnor raknas mot beloningen.
- Uppgifter som ar klara men inte godkanda visas som uppgiftsbilder pa banan.
- Vantande uppgiftsbilder ska inte minska antalet stjarnor kvar till malet.
- Nar uppgiften godkanns forvandlas uppgiftsbilden till en eller flera stjarnor pa samma plats.
- Nar barnet nar kravet med godkanda stjarnor ska beloningen visas som upplast.

Visuell ide:

- En bana med steg, rutor eller stationer.
- Godkanda steg lyser tydligt.
- Vantande steg visar uppgiftsbilden.
- Tomma steg visar vad som ar kvar.
- Beloningen visas vid slutet av banan.

## 7. Todo-bilder for barn

Barns aktiva todos ska kunna visas som tydliga bilder eller kort som ramlar ner i dashboarden vid installda tider pa vag mot beloningsbanan.

Interaktion:

- En todo visas nar dess starttid eller tidsfonster borjar.
- Todo-bilden ramlar eller glider ner i barnets dashboard.
- Barnet trycker pa todo-bilden nar uppgiften ar klar.
- Todo-bilden placeras pa beloningsbanan som vantande uppgift.
- Antal stjarnor beror pa uppgiftens stjarnvarde.
- Foralder/admin godkanner senare.
- Efter godkannande forvandlas uppgiftsbilden till en eller flera tydliga godkanda stjarnor.
- Stjarnorna behaller uppgiftsbildens plats pa beloningsbanan.

Om uppgiften inte blir klar i tid:

- Den forsvinner fran barnets aktiva dashboard.
- Den markeras som missad eller utgangen.
- Den ska inte ge vantande uppgiftsbild eller godkanda stjarnor.

Varfor: barnet far en konkret och rolig koppling mellan handling och beloning. Uppgiften blir inte bara text, utan nagot man kan trycka pa, placera pa banan och senare se forvandlas till stjarnor.

## 8. Tema for dashboards

Barn och vuxna ska kunna byta tema pa sin egen dashboard.

Primar interaktion:

- Anvandaren haller fingret lange pa dashboardens bakgrund.
- Ett temaval oppnas.
- Anvandaren valjer tema visuellt.
- Temat sparas pa medlemmens profil/dashboard.

Tema ska bara paverka medlemmens egen dashboard.

Exempel pa barnteman:

- Rymd
- Regnbage
- Djurpark
- Hav
- Superhjalte
- Skog

Exempel pa vuxenteman:

- Klar
- Fokus
- Varm
- Mork
- Natur

Tillganglighet och fallback:

- Pa desktop ska langt musklick kunna oppna samma temaval.
- Om langtryck ar svart att upptacka kan en liten tema-knapp anvandas som kompletterande vag.

## 9. Foralderns godkannandeflode

Foralder/admin ska ha en tydlig vy for uppgifter som barn markerat som klara.

Vyn ska visa:

- Barnets namn
- Uppgiftens titel
- Stjarnvarde
- Nar barnet markerade uppgiften som klar
- Val: godkann eller neka

Vid godkannande:

- Uppgiften far status `approved`.
- Stjarnorna blir godkanda.
- Barnets beloningsbana uppdateras.

Vid nekande:

- Uppgiften far status `rejected`.
- Inga stjarnor delas ut.
- Uppgiftsbilden ska inte forvandlas till stjarnor.
- Uppgiftsbilden ska tas bort fran progressbanan eller visas kort som nekad innan den forsvinner.
- Barnet kan se att uppgiften inte gav stjarnor pa ett lugnt och tydligt satt.

## 10. Onskningar och beloningar

Barn ska kunna skapa onskningar.

Foralder/admin maste godkanna onskningen innan den blir en aktiv beloning.

Beloningskort ska visa:

- Beloningens namn
- Stjarnor som kravs
- Barnets godkanda stjarnor
- Stjarnor kvar
- Status: forslag, aktiv, upplast eller inlost

## 11. Kalenderflode

Kalendern ska kunna vara:

- Privat
- Delad med `Kan se`
- Delad med `Kan redigera`

Kalenderimport:

- Anvandaren valjer en `.ics`-fil.
- Appen visar vilka handelser som hittades.
- Anvandaren bekraftar import till vald kalender.

Kalenderexport:

- Agare kan exportera sin kalender.
- Person med `edit`-atkomst och exportbehorighet kan exportera delad kalender.
- Person med endast `view`-atkomst kan inte exportera delad kalender.

## 12. Inkopslisteflode

Inkopslistor ska folja samma delningsmodell som kalender.

En inkopslista kan:

- Vara privat
- Delas med `Kan se`
- Delas med `Kan redigera`

Vyn ska tydligt visa om anvandaren bara kan titta eller ocksa redigera.

## 13. Papperskorg

Papperskorgen ska visa mjukraderad data.

Vanlig medlem:

- Ser bara sina egna raderade saker.

Admin:

- Kan se allas raderade saker i MVP.

Varje rad i papperskorgen ska visa:

- Typ av data
- Namn/titel
- Agare/skapare
- Raderad av
- Raderad tid
- Aterstall om behorighet finns

## 14. Viktiga UX-regler

- Barnvyer ska vara mer visuella an texttunga.
- Vuxenvyer ska vara tydliga, effektiva och strukturerade.
- Behoringheter ska aldrig gommas bakom bara design; UI:t ska visa ratt handlingar for ratt person.
- Radering ska alltid kannas trygg eftersom data hamnar i papperskorg.
- Delning ska alltid visa skillnaden mellan `Kan se` och `Kan redigera`.
- Vantande uppgiftsbilder ska inte kunna forvaxlas med godkanda stjarnor.

## 15. Oppna UX-val

1. Ska barnens todo-bilder bokstavligen falla/ramla ner pa skarmen, eller racker det att de glider in mjukt?
2. Ska medlemsnamn i bage runt bilden vara krav i MVP, eller far text under bilden vara forsta version?
3. Vilka 4-6 teman ska finnas i forsta versionen?
4. Ska foralder kunna stanga av barnets mojlighet att byta tema?
5. Vad ska handa visuellt om foralder nekar en uppgift som redan ligger som bild pa banan?
