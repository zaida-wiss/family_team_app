import {
  CalendarDays,
  ChefHat,
  Home,
  ListTodo,
  Settings,
  ShoppingCart
} from "lucide-react";
import type { ShellPanel } from "../../hooks/useAppState";
import styles from "./HeroBar.module.css";

type Props = {
  activePanel: ShellPanel;
  onNavigate: (panel: ShellPanel) => void;
};

// Kontobyte ("Byt vy") och temaväljare bodde tidigare här som två
// oskyltade ikonknappar längst ner i sidonavet (2026-08-11, Zaidas fynd:
// "jag trycker på det som hemknappen skall göra" — på ≥1024px döljs all
// text (memberInfo), så kontobytesknappen blev en oskyltad avatar-ikon
// direkt under Hem/Kalender/Todos m.fl., lätt att klicka av misstag. Ett
// sådant klick skickade rakt in i AccountPicker, en helt egen skärm utan
// någon tillbakaknapp). Temat nås redan via Inställningar → Utseende;
// kontobyte flyttat till Inställningar → Konto → Byt vy (samma
// onSwitchAccount-funktion, se SettingsContent.tsx), båda medvetet
// helt borttagna härifrån istället för bara omdesignade.
export function HeroBar({ activePanel, onNavigate }: Props) {
  return (
    <nav className={styles.heroBar}>
      <div className={styles.nav}>
        <NavBtn icon={<Home size="1.25rem" />} label="Hem" panel="home" active={activePanel === "home"} onNavigate={onNavigate} />
        <NavBtn icon={<CalendarDays size="1.25rem" />} label="Kalender" panel="calendar" active={activePanel === "calendar"} onNavigate={onNavigate} />
        <NavBtn icon={<ShoppingCart size="1.25rem" />} label="Inköp" panel="shopping" active={activePanel === "shopping"} onNavigate={onNavigate} />
        <NavBtn icon={<ListTodo size="1.25rem" />} label="Todos" panel="todos" active={activePanel === "todos"} onNavigate={onNavigate} />
        <NavBtn icon={<ChefHat size="1.25rem" />} label="Recept" panel="recipes" active={activePanel === "recipes"} onNavigate={onNavigate} />
        <NavBtn icon={<Settings size="1.25rem" />} label="Inställningar" panel="settings" active={activePanel === "settings"} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function NavBtn({
  icon, label, panel, active, onNavigate
}: {
  icon: React.ReactNode;
  label: string;
  panel: ShellPanel;
  active: boolean;
  onNavigate: (p: ShellPanel) => void;
}) {
  return (
    <button
      className={`${styles.navBtn}${active ? ` ${styles.active}` : ""}`}
      onClick={() => onNavigate(panel)}
      title={label}
      type="button"
    >
      {icon}
      <span className={styles.navLabel}>{label}</span>
    </button>
  );
}
