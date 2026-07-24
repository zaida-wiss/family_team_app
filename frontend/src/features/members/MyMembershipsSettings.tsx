import "../children/ChildShareSettings.css";
import { useMyMemberships } from "../todos/useCrossAccountFamilyState";
import type { Id, Member } from "@shared/types";

type Props = {
  currentMember: Member;
  onUpdateHiddenCrossAccountIds: (memberId: Id, hiddenCrossAccountIds: Id[]) => void;
};

// Mina familjekonton (2026-07-25, Zaidas önskemål: "du skall se vilka
// familjer du är med i... kunna avmarkera dessa när de inte används").
// Skiljer sig från ChildShareSettings.tsx (en delnings-grant TILL/FRÅN
// andra) — det här är mina EGNA, riktiga medlemskap. Återanvänder samma
// lista/rad-CSS för visuell konsekvens, egen fil (inget nytt klassnamn
// behövdes).
export function MyMembershipsSettings({ currentMember, onUpdateHiddenCrossAccountIds }: Props) {
  const hidden = currentMember.hiddenCrossAccountIds ?? [];
  const { memberships, toggleAccountVisible } = useMyMemberships(currentMember.id, hidden, onUpdateHiddenCrossAccountIds);
  const others = memberships.filter((m) => m.accountId !== currentMember.accountId);

  return (
    <div className="settings-sub">
      <p className="empty-note">
        Andra familjekonton du är medlem i. Avmarkera ett konto för att dölja dess gemensamma
        Familjen-uppgifter i todo-vyn tills du markerar det igen — du lämnar inte kontot.
      </p>
      {others.length === 0 ? (
        <p className="empty-note">Du är bara medlem i det här kontot.</p>
      ) : (
        <ul className="child-share-list">
          {others.map((m) => (
            <li className="child-share-list__item" key={m.accountId}>
              <label>
                <input
                  checked={!hidden.includes(m.accountId)}
                  onChange={(e) => toggleAccountVisible(m.accountId, e.target.checked)}
                  type="checkbox"
                />
                {" "}{m.accountName}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
