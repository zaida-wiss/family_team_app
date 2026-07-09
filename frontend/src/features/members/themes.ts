import type { DashboardThemeId } from "@shared/types";

export type DashboardTheme = {
  id: DashboardThemeId;
  name: string;
  audience: "adult" | "child";
};

export const dashboardThemes: DashboardTheme[] = [
  { id: "clear",            name: "Klar",           audience: "adult" },
  { id: "sunset",           name: "Solnedgång",     audience: "adult" },
  { id: "turquoise",        name: "Turkos",         audience: "adult" },
  { id: "lagoon",           name: "Lagun",          audience: "adult" },
  { id: "space",            name: "Rymd",           audience: "child" },
  { id: "cosmic-cobalt",    name: "Cosmic cobalt",  audience: "child" },
  { id: "lavender-blossom", name: "Lavendelblom",   audience: "child" },
  { id: "rainbow",          name: "Regnbåge",       audience: "child" },
  { id: "ocean",            name: "Hav",            audience: "child" },
  { id: "forest",           name: "Skog",           audience: "child" },
  { id: "superhero",        name: "Superhjälte",    audience: "child" },
  { id: "animal-park",      name: "Djurpark",       audience: "child" },
  { id: "plunge-pool",      name: "Ålands färger",  audience: "child" },
];

export function getThemesForAudience(audience: "adult" | "child") {
  return dashboardThemes.filter((t) => t.audience === audience);
}
