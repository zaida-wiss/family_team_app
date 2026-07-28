import "./ChildShareSettings.css";
import { X } from "lucide-react";
import { usePendingChildShares } from "../todos/useChildSharesState";

// 2026-07-29, ADR-0024-uppföljning (Zaidas önskemål: "när ett barn delas med
// en annan vuxen i en annan familj skall denna först godkänna att barnet
// skall delas") — mottagarsidan, alltid synlig oavsett om KONTOT har egna
// barn eller inte (en delning kan komma in vart som helst ifrån). Renderas
// ovanför den befintliga, barn-gated Data-underkategorin i
// ChildDataSettings.tsx, inte inuti den.
export function PendingChildShares() {
  const { pendingShares, accept, decline } = usePendingChildShares();

  if (pendingShares.length === 0) return null;

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Väntande delningar</h3>
      <p className="settings-sub-desc">
        En annan familj vill dela ett barns uppgifter, kalender, belöningar och Medaljer med dig. Du
        måste godkänna innan du får åtkomst.
      </p>
      <ul className="child-share-list" aria-label="Väntande delningar">
        {pendingShares.map((share) => (
          <li
            className="child-share-list__item child-share-list__item--confirmed"
            key={`${share.childAccountId}-${share.childId}`}
          >
            <div className="child-share-list__row">
              <div>
                <strong>{share.childName}</strong>
                <small>
                  {" "}
                  ({share.homeAccountName}) — delas av {share.grantedByName}
                  {share.relation ? `, ${share.relation}` : ""}
                </small>
              </div>
              <button
                aria-label={`Avböj delningen av ${share.childName}`}
                className="icon-button danger"
                onClick={() => decline(share)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <small>
              {share.access === "edit" ? "Full åtkomst (kan godkänna/redigera)" : "Kan bara visa"}
              {share.expiresAt
                ? ` · gäller till ${new Date(share.expiresAt).toLocaleDateString("sv-SE")}`
                : " · gäller tills vidare"}
            </small>
            <button className="secondary-button" onClick={() => accept(share)} type="button">
              Acceptera
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
