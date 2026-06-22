# UX: Familjeapp

## 1. Designprinciper

- **Enkelt och tydligt**: Appen ska fungera for bade vuxna och barn.
- **Barnperspektiv forst for barn**: Barn ska forstå vad de ska gora utan att lasa mycket text.
- **Visuell progression**: Beloningsbanan ska kanna rolig och motiverande, inte som ett krav.
- **Minsta motstand for vuxna**: Kalender, todos och inkopslistor ska vara snabbt tillgangliga.
- **Trygg radering**: Mjuk radering och tydliga varningar gor att misstag kan attas.

## 2. Inloggning och registrering

### 2.1 Foersta start

Nar appen oppnas forsta gangen visas ett enkelt val:

- Logga in pa befintligt konto
- Skapa nytt konto

Nar ett nytt konto skapas skapas det alltid som ett familjekonto. Ingen kontotyp behovs valjas.

### 2.2 Inbjudningsflode

Foralder kan skicka en inbjudningslank fran installningar. Mottagaren klickar pa lanken och:

1. Registrerar ett nytt anvandarkonto, eller
2. Loggar in pa ett befintligt anvandarkonto.

Mottagaren lar till i familjekontot med den roll som foraldren valt.

## 3. Startsida

### 3.1 Kalender som primar vy

Startsidan visar kalenderoversikten.

Dagens datum ar tydligt markerat. Kommande handelser visas pa ett enkelt och oversiktligt satt.

### 3.2 Runda klickbara medlemsbilder

Under eller ovanfor kalendern visas runda bilder eller avatarer for varje familjemedlem.

- Bilderna ar klickbara.
- Klick pa en bild oppnar den personens personliga dashboard.
- Namn ska visas vid bilden.
- Om bagtext ar tillganglig visas namnet som bojd text runt bilden.
- Om bagtext inte ar byggd visas namnet tydligt under bilden.

## 4. Installningar

### 4.1 Installningar for familjekonto

Installningssidan har foljande sektioner:

**Kontonamn**
- Redigera familjekontots namn.

**Familjemedlemmar**
- Lista pa alla aktiva familjemedlemmar.
- Admin kan skapa ett nytt barnkonto.
- Admin kan bjuda in en vuxen via inbjudningslank.
- Admin kan radera en medlem (mjuk radering).
- Varje rad visar namn, roll och avatar.
- Admin kan andra en medlems avatar.

**Roller och behorigheter**
- Admin kan skapa egna roller.
- Admin kan namnge roller.
- Admin kan kryssa i vilka behorigheter rollen har.
- Admin kan tilldela roll till en medlem.
- Rollnamn ar fria textfaltet.
- Barnroller (`isChildRole: true`) ger automatiskt tillgang till barnfunktioner.

**Papperskorg**
- Admin kan se allas raderade saker.
- Vanlig anvandare ser bara sina egna.
- Varje rad visar typ, namn, raderat av och tid.
- Aterstallningsknapp finns per rad.

**GDPR och kontoborttagning** (synlig for admin)

Langst ned pa installningssidan visas en tydlig GDPR-sektion:

- `GDPR · Artikel 17 & 20`
- Rubrik: "Ta bort familjekonto"
- Knapp for att ladda ner all kontodata som JSON (GDPR Art. 20 – ratten till dataportabilitet).
- Knapp "Ta bort konto..." oppnar ett utokningsflode.
- Utokningsflode visar:
  - En lista pa vad som hander (alla familjemedlemmar forlorar atkomst, all data raderas, 30 dagars karenstid, atgarden kan inte angras).
  - En kryssruta dar anvandaren bekraftar att de forstar.
  - Knapp "Bekrafta radering" (inaktiv tills kryssrutan ar checkad).
  - Knapp "Avbryt".

## 5. Vuxnas dashboard

Vuxnas dashboard fokuserar pa overblick och snabb tillgang till resurser.

### 5.1 Flikar

Tre flikar:

1. **Kalender** – visa och skapa handelser i egna och delade kalendrar.
2. **Todos** – personliga och gemensamma todos, med mojlighet att godkanna barns klara uppgifter.
3. **Inkopslistor** – privata och delade listor.

### 5.2 Teman for vuxna

Fem lugna och praktiska teman:

- Clear
- Focus
- Warm
- Dark
- Nature

Vuxna oppnar temaval genom att halla fingret lange pa dashboardens bakgrund. Valet sparas pa sin profil.

### 5.3 Godkannandeko

Om vuxen har behorighet `canApproveTodos` visas en sektion med barns todos som vantar pa godkannande.

- Barnets namn och uppgiftens titel visas.
- Uppgiftens stjarnvarde visas.
- Vuxen kan godkanna eller neka.

## 6. Barns dashboard

### 6.1 Enkelt och gladjefyllt

Barns dashboard ska vara enkel, positiv och inbjudande.

- Barnets avatar och namn visas tydligt.
- Barnteman styr helhetskansklan.
- Aktiva todos visas som tydliga visuella kort.

### 6.2 Teman for barn

Sex glada barnteman:

- Space (standard)
- Rainbow
- Ocean
- Forest
- Superhero
- Animal Park

Barn oppnar temaval genom att halla fingret lange pa dashboardens bakgrund.

### 6.3 Aktiva todos

Aktiva todos visas som bilder eller kort.

- Barnet trycker pa kortet nar uppgiften ar klar.
- Kortet forflyttas till beloningsbanan och visas som vantande.
- Vantande uppgifter blir stjarnor forst nar foralder godkanner.

### 6.4 Beloningsbana

Beloningsbanan visar barnets progress mot en aktiv beloning.

Banan visar:

- Stjarnor for godkanda uppgifter.
- Uppgiftsbilder for uppgifter som vantar pa godkannande.
- Hur manga stjarnor som kvarstår.
- Beloning vid slutet av banan.

Regler:

- Bara godkanda uppgifter ger stjarnor.
- Vantande uppgifter visas som bilder, inte som stjarnor.
- Nar foralder godkanner en uppgift forvandlas bilden till stjarnor pa samma plats pa banan.
- Nar tillrackligt manga stjarnor samlas upp visas beloningen som upplast.

## 7. UX for barn – onskningar

Barn ska kunna onska en beloning.

- Onskning far status `suggested`.
- Foralder/admin ser onskningen och kan godkanna eller neka.
- En godkand onskning blir en aktiv beloning med ett antal stjarnor som krav.

## 8. Soft delete och papperskorg

Nar nagot raderas visas inte data i aktiva vyer.

Papperskorgen visar:

- Raderat objekt.
- Raderat av.
- Tidpunkt.

Aterstallning tar bort `deletedAt` och `deletedBy` och objektet syns igen i vanliga vyer.

## 9. Felhantering och feedback

- Laddar: visa ett enkelt laddningsindikator.
- API-fel: visa en tydlig banner overst pa sidan med kortfattat meddelande.
- Formvalidering: visa fel direkt under det relevanta faltet.
- Tomma tillstand: visa ett vanlighetsfullt meddelande i stallet for tom lista.
