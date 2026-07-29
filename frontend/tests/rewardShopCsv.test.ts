import { describe, expect, it } from "vitest";
import {
  buildRewardShopTemplateCsv,
  parseRewardShopCsv,
  resolveRewardCategoryIds,
  rewardShopItemsToCsv
} from "../src/features/rewards/rewardShopCsv";
import type { RewardShopItem, TodoCategory } from "@shared/types";

function item(overrides: Partial<RewardShopItem> = {}): RewardShopItem {
  return {
    id: "reward-1",
    title: "Extra godis",
    symbol: "🍬",
    starCost: 10,
    timerMinutes: null,
    availability: null,
    requiredCategories: [],
    createdBy: "mem-1",
    deletedAt: null,
    ...overrides
  };
}

function category(id: string, name: string): TodoCategory {
  return { id, accountId: "acc-1", memberId: "mem-1", name, hidden: false, createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null };
}

describe("buildRewardShopTemplateCsv", () => {
  it("innehåller rätt rubriker", () => {
    const csv = buildRewardShopTemplateCsv();
    expect(csv.split("\n")[0]).toBe("Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id");
  });
});

describe("rewardShopItemsToCsv", () => {
  it("exporterar en vara med kategorinamn, hoppar över raderade", () => {
    const categories = [category("cat-1", "Hälsa"), category("cat-2", "Trivsel")];
    const items = [
      item({ id: "r1", requiredCategories: ["cat-1", "cat-2"] }),
      item({ id: "r2", deletedAt: "2026-01-01T00:00:00.000Z" })
    ];
    const csv = rewardShopItemsToCsv(items, categories);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Extra godis,🍬,10,,\"Hälsa, Trivsel\",r1");
  });
});

describe("parseRewardShopCsv", () => {
  it("tolkar en giltig rad", () => {
    const csv = "Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id\r\nBio,🎬,50,90,Hälsa,r1\r\n";
    const { rows, errors } = parseRewardShopCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ id: "r1", title: "Bio", symbol: "🎬", starCost: 50, timerMinutes: 90, categoryNames: ["Hälsa"] }]);
  });

  it("hoppar över en rad utan titel", () => {
    const csv = "Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id\r\n,🎬,50,,,\r\n";
    const { rows, errors } = parseRewardShopCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("en cell med vanlig text istället för en emoji faller tillbaka på null, inte texten", () => {
    const csv = "Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id\r\nBio,bio,50,,,\r\n";
    const [row] = parseRewardShopCsv(csv).rows;
    expect(row.symbol).toBeNull();
  });

  it("ogiltig stjärnkostnad ger ett fel och hoppar över raden", () => {
    const csv = "Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id\r\nBio,,minus,,,\r\n";
    const { rows, errors } = parseRewardShopCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

describe("resolveRewardCategoryIds", () => {
  it("matchar befintliga kategorier skiftlägesokänsligt, listar okända separat", () => {
    const categories = [category("cat-1", "Hälsa")];
    const { ids, unknown } = resolveRewardCategoryIds(["hälsa", "Påhittad"], categories);
    expect(ids).toEqual(["cat-1"]);
    expect(unknown).toEqual(["Påhittad"]);
  });
});
