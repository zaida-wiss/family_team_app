// Klistra in flera varor på en gång i "Lägg till vara"-fältet (2026-08-09,
// Zaidas önskemål: "Jag ska kunna klistra in flera ingredienser i
// shoppinglistan bara de har ett radbryt, eller semikolon. Då betyder det
// att det är olika produkter som skall ha en egen rad i listan.") — en delad,
// ren funktion (inte en komponent) eftersom SJÄLVA inmatningsfältet ändå är
// duplicerat per yta (samma etablerade mönster som resten av appen), men
// själva uppdelningslogiken bör bara finnas på ett ställe.
//
// Delar på radbrytningar OCH semikolon (vilken kombination som helst av
// dem), trimmar varje del och tar bort tomma. Ett enda resultat (ingen
// separator hittad, eller bara en rad med tomrum runt) betyder att det INTE
// var en flerradsklistring — anroparen låter då den vanliga
// klistra-in-i-fältet-hanteringen ske som vanligt istället.
export function splitPastedShoppingItems(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
