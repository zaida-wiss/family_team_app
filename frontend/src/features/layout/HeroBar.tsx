import {
  CalendarDays,
  Home,
  ListTodo,
  Settings,
  ShoppingCart,
  Users
} from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Member } from "@shared/types";
import type { ShellPanel } from "../../hooks/useAppState";
import "./HeroBar.css";

type Props = {
  activePanel: ShellPanel;
  accountName: string;
  currentMember: Member;
  canManageMembers: boolean;
  onNavigate: (panel: ShellPanel) => void;
  onSwitchAccount: () => void;
};

export function HeroBar({
  activePanel,
  accountName,
  currentMember,
  canManageMembers,
  onNavigate,
  onSwitchAccount
}: Props) {
  return (
    <nav className="hero-bar">
      <div className="hero-top">
        <span className="hero-brand">Familjeappen</span>
        <span className="hero-account">{accountName}</span>
      </div>

      <div className="hero-nav">
        <NavBtn icon={<Home size={20} />} label="Hem" panel="home" active={activePanel === "home"} onNavigate={onNavigate} />
        <NavBtn icon={<CalendarDays size={20} />} label="Kalender" panel="calendar" active={activePanel === "calendar"} onNavigate={onNavigate} />
        <NavBtn icon={<ShoppingCart size={20} />} label="Inköp" panel="shopping" active={activePanel === "shopping"} onNavigate={onNavigate} />
        <NavBtn icon={<ListTodo size={20} />} label="Todos" panel="todos" active={activePanel === "todos"} onNavigate={onNavigate} />
        {canManageMembers && (
          <NavBtn icon={<Users size={20} />} label="Medlemmar" panel="members" active={activePanel === "members"} onNavigate={onNavigate} />
        )}
        <NavBtn icon={<Settings size={20} />} label="Inställningar" panel="settings" active={activePanel === "settings"} onNavigate={onNavigate} />
      </div>

      <div className="hero-bottom">
        <button className="hero-member-btn" onClick={onSwitchAccount} type="button">
          <MemberAvatar member={currentMember} size="xs" />
          <div className="hero-member-info">
            <span className="hero-member-name">{currentMember.name}</span>
            <span className="hero-switch">Byt vy</span>
          </div>
        </button>
        <div className="hero-dots">
          <span className="hero-dot" style={{ background: "#e8956d" }} />
          <span className="hero-dot" style={{ background: "#2f9b8f" }} />
          <span className="hero-dot" style={{ background: "#2f7d6d" }} />
        </div>
        <p className="hero-tip">Tips: håll fingret länge på bakgrunden för att byta tema.</p>
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
      className={`hero-nav-btn${active ? " active" : ""}`}
      onClick={() => onNavigate(panel)}
      title={label}
      type="button"
    >
      {icon}
      <span className="hero-nav-label">{label}</span>
    </button>
  );
}
