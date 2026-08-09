type Props = {
  location: string;
};

// Öppna en plats i kartor (2026-08-10, Zaidas önskemål: "även mail och
// adresser skall vara call to action", samma princip som telefonnummer/
// webbadresser i useLinkifiedText.tsx) — CalendarEvent.location är det ENDA
// strukturerade adress-/platsfältet i hela datamodellen (ingen fritext-
// adressigenkänning byggd — till skillnad från telefon/e-post har en
// svensk adress inget tillräckligt pålitligt, igenkännbart format för en
// regex utan en hög risk för fel- eller missade träffar). En vanlig Google
// Maps-sökningslänk fungerar universellt (öppnar webbläsaren på desktop,
// och både iOS Safari och Android Chrome erbjuder att öppna länken i en
// installerad kart-app) — ingen plattformsspecifik geo:-URI-hantering
// behövs, samma "låt enheten fråga vad du vill göra"-princip som tel:-
// länkarna redan bygger på.
export function LocationLink({ location }: Props) {
  return (
    <a
      className="linkified-link"
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
      onClick={(e) => e.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
    >
      {location}
    </a>
  );
}
