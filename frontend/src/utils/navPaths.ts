import type { AppPanel, Id } from "@shared/types";

const PANEL_SEGMENTS: AppPanel[] = ["home", "calendar", "shopping", "todos", "recipes", "members", "settings"];

export type PanelTarget = { panel: AppPanel; memberId: Id | null };

export function buildPanelPath({ panel, memberId }: PanelTarget): string {
  if (panel === "home") return "/";
  if (panel === "members" && memberId) return `/members/${memberId}`;
  return `/${panel}`;
}

// "/" tolkas MEDVETET som "ingen explicit panel angiven" (null), inte
// "home" — annars skulle en helt vanlig sidladdning på "/" alltid tvinga
// fram Hem-panelen istället för att återställa senast aktiva panel
// (member.lastActivePanel, se useAppState.ts). Bara en KÄND panel-URL
// (/kalender, /installningar osv.) räknas som en explicit begäran.
export function parsePanelPath(pathname: string): PanelTarget | null {
  if (pathname === "/") return null;
  const membersMatch = pathname.match(/^\/members\/([^/]+)\/?$/);
  if (membersMatch) return { panel: "members", memberId: membersMatch[1] };
  const segment = pathname.replace(/^\//, "").split("/")[0];
  return (PANEL_SEGMENTS as string[]).includes(segment) ? { panel: segment as AppPanel, memberId: null } : null;
}
