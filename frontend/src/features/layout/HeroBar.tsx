import {
  CalendarDays,
  Home,
  ListTodo,
  Palette,
  Settings,
  ShoppingCart,
  Users
} from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Member } from "@shared/types";
import type { ShellPanel } from "../../hooks/useAppState";
import styles from "./HeroBar.module.css";

type Props = {
  activePanel: ShellPanel;
  accountName: string;
  currentMember: Member;
  canManageMembers: boolean;
  onNavigate: (panel: ShellPanel) => void;
  onSwitchAccount: () => void;
  onOpenThemePicker: () => void;
};

export function HeroBar({
  activePanel,
  accountName,
  currentMember,
  canManageMembers,
  onNavigate,
  onSwitchAccount,
  onOpenThemePicker,
}: Props) {
  return (
    <nav className={styles.heroBar}>
      <div className={styles.top}>
        <span className={styles.brand}>Familjeappen</span>
        <span className={styles.account}>{accountName}</span>
      </div>

      <div className={styles.nav}>
        <NavBtn icon={<Home size={20} />} label="Hem" panel="home" active={activePanel === "home"} onNavigate={onNavigate} />
        <NavBtn icon={<CalendarDays size={20} />} label="Kalender" panel="calendar" active={activePanel === "calendar"} onNavigate={onNavigate} />
        <NavBtn icon={<ShoppingCart size={20} />} label="Inköp" panel="shopping" active={activePanel === "shopping"} onNavigate={onNavigate} />
        <NavBtn icon={<ListTodo size={20} />} label="Todos" panel="todos" active={activePanel === "todos"} onNavigate={onNavigate} />
        {canManageMembers && (
          <NavBtn icon={<Users size={20} />} label="Medlemmar" panel="members" active={activePanel === "members"} onNavigate={onNavigate} />
        )}
        <NavBtn icon={<Settings size={20} />} label="Inställningar" panel="settings" active={activePanel === "settings"} onNavigate={onNavigate} />
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomRow}>
          <button className={styles.memberBtn} onClick={onSwitchAccount} type="button">
            <MemberAvatar member={currentMember} size="xs" />
            <div className={styles.memberInfo}>
              <span className={styles.memberName}>{currentMember.name}</span>
              <span className={styles.switchText}>Byt vy</span>
            </div>
          </button>
          <button className={styles.themeBtn} onClick={onOpenThemePicker} title="Byt tema" type="button">
            <Palette size={18} />
          </button>
        </div>
        <p className={styles.tip}>Tips: håll fingret länge på bakgrunden för att byta tema.</p>
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
