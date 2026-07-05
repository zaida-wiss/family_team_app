import "./ChildHero.css";
import { Trophy } from "lucide-react";
import { cloudinaryUrl } from "../../utils/uploadImage";

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

type Props = {
  childName: string;
  avatarUrl?: string | null;
  today: Date;
  onOpenRecords: () => void;
};

// Pokal-knappen till vänster om profilbilden (2026-07-06, Zaidas beslut) —
// ersätter den tidigare alltid synliga Rekord-sektionen längst ner i
// dashboarden, öppnar nu istället en egen sida (ChildRecordsPage).
export function ChildHero({ childName, avatarUrl, today, onOpenRecords }: Props) {
  return (
    <header className="child-hero">
      <div>
        <p className="child-hero-month">{MONTHS_SHORT[today.getMonth()]}</p>
        <h2 className="section-title">Hej {childName}! <span aria-hidden="true">👋</span></h2>
        <p>Tryck på dina uppgifter när du är klar. Håll fingret länge för att lämna in.</p>
      </div>
      <div className="child-hero-actions">
        <div className="child-hero-avatar-row">
          <button
            aria-label="Rekord"
            className="child-hero-records-btn"
            onClick={onOpenRecords}
            type="button"
          >
            <Trophy size={22} />
          </button>
          <div className="child-hero-avatar" aria-hidden="true">
            {avatarUrl
              ? <img src={cloudinaryUrl(avatarUrl, "hero")} alt="" loading="lazy" decoding="async" />
              : <span>🦊</span>}
          </div>
        </div>
      </div>
    </header>
  );
}
