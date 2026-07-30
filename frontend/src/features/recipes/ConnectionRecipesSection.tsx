import { useConnectionRecipes } from "../accounts/useFamilyConnectionsState";

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"). Recept är kontobrett (ADR-0028), inte medlems-scopat,
// så en ansluten familjs HELA receptbok visas när dataScope.recipes är på —
// egen, tydligt avgränsad extra sektion, aldrig sammanslaget med mina egna
// recept. Läsning bara i denna första version (skapa/redigera i en annan
// familjs konto är inte byggt).
export function ConnectionRecipesSection() {
  const groups = useConnectionRecipes();
  if (groups.length === 0) return null;

  return (
    <div className="settings-sub">
      {groups.map((g) => (
        <section aria-label={`Recept från ${g.accountName}`} key={g.accountId}>
          <h3 className="settings-sub-title">{g.accountName}s recept</h3>
          {g.recipes.length === 0 ? (
            <p className="empty-note">Inga recept ännu.</p>
          ) : (
            <ul className="child-share-list">
              {g.recipes.map((r) => (
                <li key={r.id}>
                  {r.emoji ? `${r.emoji} ` : ""}
                  {r.name}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
