import type { DashboardThemeId } from "@shared/types";

export type DashboardTheme = {
  id: DashboardThemeId;
  name: string;
  audience: "adult" | "child";
};

export const dashboardThemes: DashboardTheme[] = [
  { id: "clear", name: "Klar", audience: "child" },
  { id: "focus", name: "Fokus", audience: "child" },
  { id: "warm", name: "Varm", audience: "child" },
  { id: "dark", name: "Mörk", audience: "child" },
  { id: "nature", name: "Natur", audience: "child" },
  { id: "space", name: "Rymd", audience: "child" },
  { id: "cosmic-cobalt", name: "Cosmic cobalt", audience: "child" },
  { id: "lavender-blossom", name: "Lavendelblom", audience: "child" },
  { id: "rainbow", name: "Regnbåge", audience: "child" },
  { id: "ocean", name: "Hav", audience: "child" },
  { id: "forest", name: "Skog", audience: "child" },
  { id: "superhero", name: "Superhjälte", audience: "child" },
  { id: "animal-park", name: "Djurpark", audience: "child" },
  { id: "plunge-pool", name: "Ålands färger", audience: "child" }
];

export function getThemesForAudience(audience: "adult" | "child") {
  return dashboardThemes.filter((theme) => theme.audience === audience);
}
