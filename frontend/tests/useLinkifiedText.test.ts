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
    expect(html).toContain('<a href="https://exempel.se/recept"');
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

  it("domändelen av en e-postadress blir INTE en (missvisande) webblänk", () => {
    expect(render("Skriv till mig@exempel.se om det")).toBe("Skriv till mig@exempel.se om det");
  });
});
