import { describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { linkifyText } from "../src/hooks/useLinkifiedText";

// Klickbara länkar i fri text (2026-08-09, Zaidas önskemål: "alla länkar i
// kalendrar, todo, listor skall bli klickbara länkar", "gör det till en
// hook som används av hela projektet") — testar den delade, rena
// linkifyText-funktionen direkt (renderToStaticMarkup, inget behov av
// testing-library bara för att verifiera markup-strukturen). createElement
// istället för JSX — filen körs som .ts, inte .tsx (vite.config.ts:s
// vitest.test.include matchar bara tests/**/*.test.ts).
function render(text: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, linkifyText(text)));
}

describe("linkifyText", () => {
  it("text utan länk renderas oförändrad", () => {
    expect(render("Bara vanlig text.")).toBe("Bara vanlig text.");
  });

  it("en https-länk blir en klickbar a-tagg med rel/target", () => {
    const html = render("Se https://exempel.se/recept för mer info");
    expect(html).toContain('href="https://exempel.se/recept"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">https://exempel.se/recept</a>");
    expect(html).toContain("Se ");
    expect(html).toContain(" för mer info");
  });

  it("en www.-länk får https:// tillagt i href men visar den ursprungliga texten", () => {
    const html = render("www.ikea.se/produkt");
    expect(html).toContain('href="https://www.ikea.se/produkt"');
    expect(html).toContain(">www.ikea.se/produkt</a>");
  });

  it("skiljetecken direkt efter en länk hör inte till själva URL:en", () => {
    const html = render("Källa: https://exempel.se/a, och https://exempel.se/b.");
    expect(html).toContain('href="https://exempel.se/a"');
    expect(html).toContain(">https://exempel.se/a</a>,");
    expect(html).toContain('href="https://exempel.se/b"');
    expect(html).toContain(">https://exempel.se/b</a>.");
  });

  it("flera länkar i samma text blir varsin egen länk", () => {
    const html = render("https://a.se och https://b.se");
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });

  it("null/undefined ger tom sträng vid rendering (samma som tidigare {text && ...}-mönster)", () => {
    expect(render("")).toBe("");
  });

  // 2026-08-09, uppföljning (Zaidas fynd: "länken i todos anteckningar
  // blandad med text inte fungerar") — en bar domän utan http(s):///www.
  it("en bar domän blandad med text blir en klickbar länk", () => {
    const html = render("Köp verktyg på biltema.se imorgon");
    expect(html).toContain('href="https://biltema.se"');
    expect(html).toContain(">biltema.se</a>");
    expect(html).toContain("Köp verktyg på ");
    expect(html).toContain(" imorgon");
  });

  it("en bar domän med path blandad med text blir en klickbar länk", () => {
    const html = render("Boka på biltema.se/rea innan det tar slut.");
    expect(html).toContain('href="https://biltema.se/rea"');
    expect(html).toContain(">biltema.se/rea</a>");
  });

  it("vanliga svenska förkortningar med punkter blir INTE felaktigt länkade", () => {
    expect(render("Vi ses kl. 14.30, t.ex. imorgon, bl.a. hemma")).toBe(
      "Vi ses kl. 14.30, t.ex. imorgon, bl.a. hemma"
    );
  });

  // 2026-08-10, Zaidas önskemål: "även mail och adresser skall vara call to
  // action" — domändelen av en e-postadress ska INTE bli en missvisande
  // WEBBLÄNK (oförändrat, se URL_PATTERN:s (?<!@)), men HELA adressen ska
  // bli en riktig mailto:-länk istället.
  it("en e-postadress blir en mailto:-länk, inte en missvisande webblänk", () => {
    const html = render("Skriv till mig@exempel.se om det");
    expect(html).toContain('href="mailto:mig@exempel.se"');
    expect(html).toContain(">mig@exempel.se</a>");
    expect(html).not.toContain('href="https://exempel.se"');
    expect(html).toContain("Skriv till ");
    expect(html).toContain(" om det");
  });

  it("skiljetecken direkt efter en e-postadress hör inte till själva adressen", () => {
    const html = render("Mejla mig@exempel.se, tack.");
    expect(html).toContain('href="mailto:mig@exempel.se"');
    expect(html).toContain(">mig@exempel.se</a>,");
  });

  it("flera e-postadresser i samma text blir varsin egen mailto:-länk", () => {
    const html = render("mamma@exempel.se eller pappa@exempel.se");
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });

  it("webblänk, e-post OCH telefonnummer i samma text blir tre olika klickbara länkar", () => {
    const html = render("Se biltema.se, mejla mig@exempel.se eller ring 070-123 45 67");
    expect(html).toContain('href="https://biltema.se"');
    expect(html).toContain('href="mailto:mig@exempel.se"');
    expect(html).toContain('href="tel:0701234567"');
    expect((html.match(/<a /g) ?? []).length).toBe(3);
  });

  // 2026-08-10, Zaidas önskemål: "alla telefonnummer skall gå att ringa
  // direkt... vid klick skall telefonen fråga vad jag vill göra" — en
  // vanlig tel:-länk ger den native "vad vill du göra"-menyn gratis.
  it("ett mobilnummer med bindestreck/mellanslag blir en tel:-länk", () => {
    const html = render("Ring 070-123 45 67 vid frågor");
    expect(html).toContain('href="tel:0701234567"');
    expect(html).toContain(">070-123 45 67</a>");
    expect(html).toContain("Ring ");
    expect(html).toContain(" vid frågor");
  });

  it("ett riktnummer+lokalnummer (kortare format) blir en tel:-länk", () => {
    const html = render("Kontakta 08-123 456 78 imorgon");
    expect(html).toContain('href="tel:0812345678"');
  });

  it("ett internationellt +46-nummer blir en tel:-länk", () => {
    const html = render("Från utlandet: +46 70 123 45 67");
    expect(html).toContain('href="tel:+46701234567"');
  });

  it("flera telefonnummer i samma text blir varsin egen länk", () => {
    const html = render("Mamma 070-111 11 11, pappa 070-222 22 22");
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });

  it("webblänk OCH telefonnummer i samma text blir varsin klickbar länk", () => {
    const html = render("Boka på biltema.se eller ring 070-123 45 67");
    expect(html).toContain('href="https://biltema.se"');
    expect(html).toContain('href="tel:0701234567"');
    expect((html.match(/<a /g) ?? []).length).toBe(2);
  });

  it("ett ISO-datum blir INTE av misstag ett telefonnummer (börjar inte med 0/+46)", () => {
    expect(render("Boka tid 2026-08-10 innan det är fullt")).toBe(
      "Boka tid 2026-08-10 innan det är fullt"
    );
  });

  it("ett 10-siffrigt personnummer utan sekelsiffror blir INTE en tel:-länk", () => {
    // Ett barn fött 2005 (051231-1234) börjar med 0, exakt som ett riktigt
    // telefonnummer — men saknar den extra separator ett telefonnummer
    // nästan alltid har, vilket särskiljer formerna åt.
    expect(render("Personnummer: 051231-1234")).toBe("Personnummer: 051231-1234");
  });

  it("en för kort sifferklump blir INTE en tel:-länk", () => {
    expect(render("Rum 0-12 på plan 2")).toBe("Rum 0-12 på plan 2");
  });
});
