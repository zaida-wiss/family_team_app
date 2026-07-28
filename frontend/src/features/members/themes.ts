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
  { id: "orchid",           name: "Orkidé",         audience: "adult" },
  { id: "dusk",             name: "Skymning",       audience: "adult" },
  { id: "salvia",           name: "Salvia",         audience: "adult" },
  { id: "karneval",         name: "Karneval",       audience: "adult" },
  { id: "spektrum",         name: "Spektrum",       audience: "adult" },
  { id: "juveltoner",       name: "Juveltoner",     audience: "adult" },
  { id: "dova",             name: "Dova",           audience: "adult" },
  { id: "space",            name: "Rymd",           audience: "child" },
  { id: "cosmic-cobalt",    name: "Cosmic cobalt",  audience: "child" },
  { id: "lavender-blossom", name: "Lavendelblom",   audience: "child" },
  { id: "rainbow",          name: "Regnbåge",       audience: "child" },
  { id: "rainbow-light",    name: "Regnbåge ljus",  audience: "child" },
  { id: "ocean",            name: "Hav",            audience: "child" },
  { id: "forest",           name: "Skog",           audience: "child" },
  { id: "superhero",        name: "Superhjälte",    audience: "child" },
  { id: "animal-park",      name: "Djurpark",       audience: "child" },
  { id: "plunge-pool",      name: "Ålands färger",  audience: "child" },
];

export function getThemesForAudience(audience: "adult" | "child") {
  return dashboardThemes.filter((t) => t.audience === audience);
}
