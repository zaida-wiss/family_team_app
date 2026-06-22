import {
  CalendarDays,
  Home,
  ListTodo,
  LogOut,
  Settings,
  ShoppingCart,
  Trash2,
  Users
} from "lucide-react";
import type { ShellPanel } from "../../hooks/useAppState";

type Props = {
  activePanel: ShellPanel;
  canManageMembers: boolean;
  canViewTrash: boolean;
  onNavigate: (panel: ShellPanel) => void;
  onSwitchAccount: () => void;
};

export function HeroBar({
  activePanel,
  canManageMembers,
  canViewTrash,
  onNavigate,
  onSwitchAccount
}: Props) {
  return (
    <nav className="hero-bar">
      <span className="hero-brand">Familjeappen</span>
      <div className="hero-nav">
        <NavBtn icon={<Home size={20} />} panel="home" active={activePanel === "home"} label="Hem" onNavigate={onNavigate} />
        <NavBtn icon={<CalendarDays size={20} />} panel="calendar" active={activePanel === "calendar"} label="Kalender" onNavigate={onNavigate} />
        <NavBtn icon={<ShoppingCart size={20} />} panel="shopping" active={activePanel === "shopping"} label="Inköp" onNavigate={onNavigate} />
        <NavBtn icon={<ListTodo size={20} />} panel="todos" active={activePanel === "todos"} label="Todos" onNavigate={onNavigate} />
        {canManageMembers && (
          <NavBtn icon={<Users size={20} />} panel="members" active={activePanel === "members"} label="Medlemmar" onNavigate={onNavigate} />
        )}
        {canViewTrash && (
          <NavBtn icon={<Trash2 size={20} />} panel="trash" active={activePanel === "trash"} label="Papperskorg" onNavigate={onNavigate} />
        )}
        <NavBtn icon={<Settings size={20} />} panel="settings" active={activePanel === "settings"} label="Inställningar" onNavigate={onNavigate} />
        <button className="hero-nav-btn" onClick={onSwitchAccount} title="Logga ut" type="button">
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}

function NavBtn({
  icon, panel, active, label, onNavigate
}: {
  icon: React.ReactNode;
  panel: ShellPanel;
  active: boolean;
  label: string;
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
    </button>
  );
}
