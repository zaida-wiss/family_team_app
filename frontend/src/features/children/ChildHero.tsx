import "./ChildHero.css";
import { LogOut } from "lucide-react";
import { cloudinaryUrl } from "../../utils/uploadImage";

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

type Props = {
  childName: string;
  avatarUrl?: string | null;
  today: Date;
  onLogout: () => Promise<void>;
};

export function ChildHero({ childName, avatarUrl, today, onLogout }: Props) {
  return (
    <header className="child-hero">
      <div>
        <p className="child-hero-month">{MONTHS_SHORT[today.getMonth()]}</p>
        <h2 className="section-title">Hej {childName}! <span aria-hidden="true">👋</span></h2>
        <p>Tryck på dina uppgifter när du är klar. Håll fingret länge för att lämna in.</p>
      </div>
      <div className="child-hero-actions">
        <div className="child-hero-avatar" aria-hidden="true">
          {avatarUrl
            ? <img src={cloudinaryUrl(avatarUrl, "hero")} alt="" loading="lazy" decoding="async" />
            : <span>🦊</span>}
        </div>
        <button className="child-logout-btn" onClick={onLogout} title="Logga ut" type="button">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
