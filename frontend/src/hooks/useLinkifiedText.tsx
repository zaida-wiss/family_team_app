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
const URL_PATTERN = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;

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

export function linkifyText(text: string): ReactNode[] {
  // text.split() med en enda fångstgrupp lägger matchningarna på UDDA
  // index i den returnerade arrayen — vanlig text hamnar på jämna index.
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 !== 1 || !part) return <Fragment key={i}>{part}</Fragment>;
    const [url, trailing] = splitTrailingPunctuation(part);
    const href = url.startsWith("http") ? url : `https://${url}`;
    return (
      <Fragment key={i}>
        {/* stopPropagation (2026-08-09) — en länk kan sitta inuti en
            klickbar rad (t.ex. en inköpslistas <label>, som annars skulle
            bocka av/på varan samtidigt som länken öppnas i en ny flik). */}
        <a href={href} onClick={(e) => e.stopPropagation()} rel="noopener noreferrer" target="_blank">
          {url}
        </a>
        {trailing}
      </Fragment>
    );
  });
}

// text kan vara null/undefined (samma valfria anteckningsfält som redan
// tillåter det överallt) — returnerar då null, precis som anroparens
// tidigare `{text && <p>{text}</p>}`-mönster redan förutsatte.
export function useLinkifiedText(text: string | null | undefined): ReactNode {
  return useMemo(() => (text ? linkifyText(text) : null), [text]);
}
