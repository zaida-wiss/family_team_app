// @vitest-environment jsdom
import axe from "axe-core";
import { describe, expect, it } from "vitest";

async function check(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;
  const results = await axe.run(document.body);
  return results.violations;
}

describe("Icon-buttons har aria-label", () => {
  it("synlig text — ingen aria-label krävs", async () => {
    const v = await check(`<button type="button">Spara</button>`);
    expect(v).toHaveLength(0);
  });

  it("bara ikon utan label — button-name violation", async () => {
    const v = await check(`<button type="button"><svg></svg></button>`);
    expect(v.some((x) => x.id === "button-name")).toBe(true);
  });

  it("bara ikon med aria-label — ok", async () => {
    const v = await check(
      `<button type="button" aria-label="Stäng"><svg aria-hidden="true"></svg></button>`
    );
    expect(v).toHaveLength(0);
  });
});

describe("Formulär har kopplade labels", () => {
  it("input kopplad via for/id", async () => {
    const v = await check(`
      <form>
        <label for="email">E-post</label>
        <input id="email" type="email" />
        <button type="submit">Logga in</button>
      </form>
    `);
    expect(v).toHaveLength(0);
  });

  it("input via aria-label", async () => {
    const v = await check(`<input type="text" aria-label="Sök" />`);
    expect(v).toHaveLength(0);
  });

  it("input utan label — label violation", async () => {
    const v = await check(`<input type="text" />`);
    expect(v.some((x) => x.id === "label")).toBe(true);
  });

  it("select utan label — select-name violation", async () => {
    const v = await check(`
      <select><option value="a">A</option></select>
    `);
    expect(v.some((x) => x.id === "select-name")).toBe(true);
  });
});

describe("Bilder har alt-text", () => {
  it("dekorativ bild med tom alt", async () => {
    const v = await check(`<img src="avatar.png" alt="" />`);
    expect(v).toHaveLength(0);
  });

  it("meningsfull bild saknar alt — image-alt violation", async () => {
    const v = await check(`<img src="avatar.png" />`);
    expect(v.some((x) => x.id === "image-alt")).toBe(true);
  });
});

describe("Landmarks och dialog", () => {
  it("h1 + innehåll i main ger inga fel", async () => {
    const v = await check(`
      <h1>Familjens dashboard</h1>
      <p>Innehåll</p>
    `);
    expect(v).toHaveLength(0);
  });

  it("dialog med role, aria-modal och aria-labelledby", async () => {
    const v = await check(`
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">Bekräfta</h2>
        <button type="button">Ok</button>
        <button type="button">Avbryt</button>
      </div>
    `);
    expect(v).toHaveLength(0);
  });
});
