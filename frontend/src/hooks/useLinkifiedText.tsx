import { Fragment, useMemo, type ReactNode } from "react";

// Klickbara länkar i fri text (2026-08-09, Zaidas önskemål: "alla länkar i
// kalendrar, todo, listor skall bli klickbara länkar", sedan "gör det till
// en hook som används av hela projektet") — EN delad regel för hur en länk
// känns igen och öppnas, istället för en kopia per feature. Används av
// kalenderhändelsers anteckningar (vuxenvyn OCH barnens tidslinje), todos
// anteckningar och inköpslistors varutitlar.
//
// Rent textmönster, ingen HTML-parsning/sanitisering behövs — texten
// kommer alltid in som en vanlig sträng (redan säker, React escape:ar allt
// den renderar), aldrig `dangerouslySetInnerHTML`.
//
// 2026-08-09, uppföljning (Zaidas fynd: "länken i todos anteckningar
// blandad med text inte fungerar") — mönstret kände tidigare BARA igen
// länkar som redan bar http(s):// eller www. framför sig. En vardaglig
// svensk anteckning ("köp verktyg på biltema.se") skriver nästan aldrig ut
// det, så en sådan länk blev aldrig klickbar alls, oavsett om den stod
// ensam eller blandad med annan text. Tredje alternativet nedan fångar en
// BAR domän (ord.tld, t.ex. "biltema.se" eller "ikea.com/rea") — kräver
// minst två bokstäver/siffror per ledgren FÖRE toppdomänen och en
// toppdomän på 2–24 rena bokstäver, vilket i praktiken utesluter vanliga
// svenska förkortningar som råkar innehålla punkter ("t.ex.", "bl.a.",
// "m.m.", "kl. 14.30") — de har alltid minst en enbokstavsled. (?<!@)
// hindrar att domändelen av en e-postadress ("namn@exempel.se") av misstag
// blir en (missvisande) webblänk.
const URL_PATTERN =
  /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|(?<!@)\b(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.)+[a-zA-Z]{2,24}(?:\/[^\s<>]*)?)/gi;

// Skiljetecken som ofta råkar hamna direkt efter en inklistrad länk (en
// mening som avslutas med punkt, ett kommatecken innan nästa ord) hör inte
// till själva URL:en — klipps bort från länken, läggs tillbaka som vanlig
// text direkt efter.
const TRAILING_PUNCTUATION = /[.,!?;:)\]}"']+$/;

function splitTrailingPunctuation(raw: string): [string, string] {
  const match = raw.match(TRAILING_PUNCTUATION);
  if (!match) return [raw, ""];
  return [raw.slice(0, raw.length - match[0].length), match[0]];
}

// Klickbara telefonnummer (2026-08-10, Zaidas önskemål: "alla telefonnummer
// skall gå att ringa direkt... vid klick skall telefonen fråga vad jag vill
// göra" — precis det en vanlig `tel:`-länk redan ger gratis på en mobil,
// ingen egen "ring nu"-logik behövs). Kräver att sifferföljden BÖRJAR med
// en riktig svensk telefonprefix — ett bokstavligt "0" eller "+46" — direkt
// framför siffrorna, vilket redan utesluter de FLESTA sifferklumpar i
// löptext (ett ISO-datum "2026-08-10" börjar t.ex. med "2"). Ett datum kan
// dock fortfarande råka INNEHÅLLA en matchande delsekvens (den avslutande
// "-08-10" börjar med "0" direkt efter ett bindestreck) — det fångas av
// `isPlausiblePhoneNumber`s siffer-räkning nedan (en riktig svensk
// telefondel har alltid minst 7 siffror, ett sådant datumfragment bara 4).
//
// HELA matchningen ligger i EN enda fångstgrupp (inte bara prefixet) —
// annars tappar `String.prototype.split()` resten av siffrorna helt (bara
// den fångade delen hamnar i resultatarrayen), vilket kapar texten runt en
// AVVISAD matchning istället för att bara lämna den orörd.
const PHONE_PATTERN =
  /(?<![\w@.])((?:\+46[\s-]?|0)\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){1,4})(?![\w@.\d])/g;

// Ett riktigt telefonnummer skrivs nästan alltid med minst en separator för
// läsbarhet ("070-123 45 67") och landar i praktiken alltid på 7–12 rena
// siffror oavsett format (svenskt riktnummer+lokalnummer, mobilnummer,
// eller +46-variant). Detta filtrerar bort matchningar som råkat plocka upp
// för korta/långa sifferklumpar.
//
// Ett tioSIFFRIGT personnummer utan sekelsiffror ("051231-1234", ett barn
// fött 2005) matchar tyvärr samma PHONE_PATTERN eftersom det också börjar
// med "0" — men skiljer sig alltid från ett riktigt telefonnummer genom att
// vara EXAKT sex siffror + ETT bindestreck + fyra siffror, utan någon
// ytterligare separator (ett telefonnummer har så gott som alltid minst en
// till, för läsbarhetens skull). Den formen exkluderas explicit.
function isPlausiblePhoneNumber(raw: string): boolean {
  if (/^\d{6}-\d{4}$/.test(raw)) return false;
  const digitCount = raw.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 12;
}

function linkifyPhoneNumbers(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(PHONE_PATTERN);
  return parts.map((part, j) => {
    const key = `${keyPrefix}-${j}`;
    if (j % 2 !== 1 || !part || !isPlausiblePhoneNumber(part)) {
      return <Fragment key={key}>{part}</Fragment>;
    }
    const digits = part.replace(/[^\d+]/g, "");
    return (
      // stopPropagation (samma skäl som webblänkarna nedan) — ett
      // telefonnummer kan sitta inuti en klickbar rad.
      <a
        className="linkified-link"
        href={`tel:${digits}`}
        key={key}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    );
  });
}

// Klickbara e-postadresser (2026-08-10, Zaidas önskemål: "även mail och
// adresser skall vara call to action") — samma "en mailto:-länk ger enhetens
// egen 'vad vill du göra'-hantering gratis"-princip som telefonnummer ovan.
// Ett förenklat men brett mönster (samma "täcker verkliga adresser utan att
// bli ett helt eget e-postvalideringsbibliotek"-avvägning som URL_PATTERN
// redan representerar för webbadresser) — kräver minst en punkt i
// domändelen (utesluter t.ex. "namn@dator" i en teknisk anteckning).
const EMAIL_PATTERN =
  /([a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)/g;

function linkifyEmails(text: string, keyPrefix: string): ReactNode[] {
  // text.split() med en enda fångstgrupp lägger matchningarna på UDDA
  // index — vanlig text (skickas vidare till telefonnummer-igenkänningen)
  // hamnar på jämna index. Körs FÖRE PHONE_PATTERN så att en adress som
  // "kontakt2026@foretag.se" aldrig hinner tolkas fel av den senare passen.
  const parts = text.split(EMAIL_PATTERN);
  return parts.flatMap((part, j): ReactNode[] => {
    const key = `${keyPrefix}-${j}`;
    if (j % 2 !== 1 || !part) return linkifyPhoneNumbers(part ?? "", key);
    const [email, trailing] = splitTrailingPunctuation(part);
    return [
      <Fragment key={key}>
        {/* stopPropagation (samma skäl som webblänkarna nedan) — en
            e-postadress kan sitta inuti en klickbar rad. */}
        <a className="linkified-link" href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
          {email}
        </a>
        {trailing}
      </Fragment>,
    ];
  });
}

export function linkifyText(text: string): ReactNode[] {
  // text.split() med en enda fångstgrupp lägger matchningarna på UDDA
  // index i den returnerade arrayen — vanlig text hamnar på jämna index.
  const parts = text.split(URL_PATTERN);
  return parts.flatMap((part, i): ReactNode[] => {
    if (i % 2 !== 1 || !part) return linkifyEmails(part ?? "", `t${i}`);
    const [url, trailing] = splitTrailingPunctuation(part);
    const href = url.startsWith("http") ? url : `https://${url}`;
    return [
      <Fragment key={i}>
        {/* stopPropagation (2026-08-09) — en länk kan sitta inuti en
            klickbar rad (t.ex. en inköpslistas <label>, som annars skulle
            bocka av/på varan samtidigt som länken öppnas i en ny flik). */}
        <a
          className="linkified-link"
          href={href}
          onClick={(e) => e.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          {url}
        </a>
        {trailing}
      </Fragment>,
    ];
  });
}

// text kan vara null/undefined (samma valfria anteckningsfält som redan
// tillåter det överallt) — returnerar då null, precis som anroparens
// tidigare `{text && <p>{text}</p>}`-mönster redan förutsatte.
export function useLinkifiedText(text: string | null | undefined): ReactNode {
  return useMemo(() => (text ? linkifyText(text) : null), [text]);
}
