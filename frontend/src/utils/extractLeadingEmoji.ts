// Delmoment har inget eget emoji-fält (2026-08-12) — familjen skriver redan
// emojin rakt in i delmomentets titel (t.ex. "🧺Plocka in i diskmaskinen"),
// se TodoDetailView.tsx:s checklista. Denna extraherar den ledande emojin
// (inkl. flerkodpunkts-sekvenser: variant-väljare U+FE0F, hudtonsmodifierare,
// ZWJ-sammansatta emojis) ur en sådan titel, så den kan återanvändas som
// kortikon på dashboarden istället för att stå kvar dubblerad i texten.
const LEADING_EMOJI_PATTERN =
  /^(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)\s*/u;

export function extractLeadingEmoji(text: string): { emoji: string | null; rest: string } {
  const trimmed = text.trimStart();
  const match = trimmed.match(LEADING_EMOJI_PATTERN);
  if (!match) return { emoji: null, rest: text.trim() };
  return { emoji: match[1], rest: trimmed.slice(match[0].length).trim() };
}
