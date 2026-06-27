import "./ChildHero.css";

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

type Props = {
  childName: string;
  avatarUrl?: string | null;
  today: Date;
};

export function ChildHero({ childName, avatarUrl, today }: Props) {
  return (
    <header className="child-hero">
      <div>
        <p className="child-hero-month">{MONTHS_SHORT[today.getMonth()]}</p>
        <h2 className="section-title">Hej {childName}! <span aria-hidden="true">👋</span></h2>
        <p>Tryck på dina uppgifter när du är klar. Håll fingret länge för att lämna in.</p>
      </div>
      <div className="child-hero-actions">
        <div className="child-hero-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>🦊</span>}
        </div>
      </div>
    </header>
  );
}
