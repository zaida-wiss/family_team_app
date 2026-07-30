import { useConnectionShoppingLists } from "../accounts/useFamilyConnectionsState";

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"). Inköpslistor är kontobreda, inte medlems-scopade, så
// en ansluten familjs listor visas när dataScope.shoppingLists är på — egen,
// tydligt avgränsad extra sektion, aldrig sammanslaget med mina egna listor.
// Läsning bara i denna första version (skiljer sig från ADR-0026:s
// externalSharedWith, som redan tillåter redigering av en specifikt delad
// lista — den funktionen är opåverkad och används fortfarande för det).
export function ConnectionShoppingListsSection() {
  const groups = useConnectionShoppingLists();
  if (groups.length === 0) return null;

  return (
    <div className="settings-sub">
      {groups.map((g) => (
        <section aria-label={`Inköpslistor från ${g.accountName}`} key={g.accountId}>
          <h3 className="settings-sub-title">{g.accountName}s inköpslistor</h3>
          {g.lists.length === 0 ? (
            <p className="empty-note">Inga listor ännu.</p>
          ) : (
            <ul className="child-share-list">
              {g.lists.map((list) => (
                <li key={list.id}>
                  <strong>{list.name}</strong>
                  <small> · {list.items.filter((i) => !i.done && !i.deletedAt).length} kvar</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
