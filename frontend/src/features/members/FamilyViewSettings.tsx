import { useMyMemberships } from "../todos/useCrossAccountFamilyState";
import { useFamilyConnectionManagement } from "../accounts/useFamilyConnectionsState";
import type { Id, Member } from "@shared/types";

type Props = {
  currentMember: Member;
  onUpdateHiddenCrossAccountIds: (memberId: Id, hiddenCrossAccountIds: Id[]) => void;
  onUpdateHiddenConnectionAccountIds: (memberId: Id, hiddenConnectionAccountIds: Id[]) => void;
};

// Familjevy (2026-08-30, Zaidas önskemål: "Välj familj på dashboarden skall
// flyttas till familj, där jag ska kunna välja vilka familjeanslutningar som
// skall visas i familjevyn" — uppföljt av "jag ska kunna vara ansluten till
// flera familjer, men själv aktivera och avaktivera och på så sätt bestämma
// hur mycket jag vill se") — ersätter den tidigare "Välj familj"-popupen i
// Hem-vyn (filtrerade till EN familj i taget) med en persistent av/på-knapp
// per familj, av/på gäller alla familjer samtidigt (Hem-vyn visar alltid
// alla icke-avaktiverade kombinerat, se MemberOverview.tsx). Två separata
// listor eftersom det är två olika mekanismer under huven: Mina
// familjekonton (genuint medlemskap, hiddenCrossAccountIds) kontra
// Familjeanslutningar (ADR-0030, bara exponerad data, hiddenConnectionAccountIds)
// — se shared/types.ts för fälten. "Mina familjekonton"-fliken behåller sin
// egna, mer administrativa lista (radera/överlåt/gå ur) utan checkboxen, som
// bara skulle dubblera kontrollen här.
export function FamilyViewSettings({
  currentMember,
  onUpdateHiddenCrossAccountIds,
  onUpdateHiddenConnectionAccountIds
}: Props) {
  const hiddenCrossAccountIds = currentMember.hiddenCrossAccountIds ?? [];
  const { memberships, toggleAccountVisible } = useMyMemberships(
    currentMember.id,
    hiddenCrossAccountIds,
    onUpdateHiddenCrossAccountIds
  );
  const otherMemberships = memberships.filter((m) => m.accountId !== currentMember.accountId);

  const { connections } = useFamilyConnectionManagement(currentMember.accountId);
  const hiddenConnectionAccountIds = currentMember.hiddenConnectionAccountIds ?? [];

  function toggleConnectionVisible(accountId: Id, visible: boolean) {
    const hidden = new Set(hiddenConnectionAccountIds);
    if (visible) {
      hidden.delete(accountId);
    } else {
      hidden.add(accountId);
    }
    onUpdateHiddenConnectionAccountIds(currentMember.id, [...hidden]);
  }

  return (
    <div className="settings-sub">
      <p className="field-hint">
        Välj vilka av dina familjer som ska bidra till familjevyn på Hem-panelen (kalender, todos,
        inköp, medlemmar). En uppgift som personligen tilldelas dig i en avaktiverad familj syns
        ändå — men bland dina egna todos istället för i familjevyn.
      </p>

      <h3 className="settings-sub-title">Mina familjekonton</h3>
      {otherMemberships.length === 0 ? (
        <p className="empty-note">Du är bara medlem i ditt eget konto.</p>
      ) : (
        <ul className="settings-hidden-categories">
          {otherMemberships.map((m) => (
            <li className="settings-hidden-categories__row" key={m.accountId}>
              <label>
                <input
                  checked={!hiddenCrossAccountIds.includes(m.accountId)}
                  onChange={(e) => toggleAccountVisible(m.accountId, e.target.checked)}
                  type="checkbox"
                />
                {" "}{m.accountName}
              </label>
            </li>
          ))}
        </ul>
      )}

      <h3 className="settings-sub-title">Familjeanslutningar</h3>
      {connections.exposedToMe.length === 0 ? (
        <p className="empty-note">Ingen familj har delat data med dig ännu.</p>
      ) : (
        <ul className="settings-hidden-categories">
          {connections.exposedToMe.map((c) => (
            <li className="settings-hidden-categories__row" key={c.fromAccountId}>
              <label>
                <input
                  checked={!hiddenConnectionAccountIds.includes(c.fromAccountId)}
                  onChange={(e) => toggleConnectionVisible(c.fromAccountId, e.target.checked)}
                  type="checkbox"
                />
                {" "}{c.fromAccountName}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
