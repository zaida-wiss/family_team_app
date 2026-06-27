import { useState, useRef } from "react";
import { flushSync } from "react-dom";
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
import { NavMemberPicker } from "./NavMemberPicker";
import { useLongPress } from "../../hooks/useLongPress";
import type { Member } from "@shared/types";
import type { ShellPanel } from "../../hooks/useAppState";
import styles from "./HeroBar.module.css";

type Props = {
  activePanel: ShellPanel;
  accountName: string;
  currentMember: Member;
  activeMembers: Member[];
  canManageMembers: boolean;
  onNavigate: (panel: ShellPanel) => void;
  onSwitchAccount: () => void;
  onOpenThemePicker: () => void;
  onSelectMemberProfile: (memberId: string) => void;
};

export function HeroBar({
  activePanel,
  accountName,
  currentMember,
  activeMembers,
  canManageMembers,
  onNavigate,
  onSwitchAccount,
  onOpenThemePicker,
  onSelectMemberProfile,
}: Props) {
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null);
  const membersRef = useRef<HTMLButtonElement>(null);
  // Ref-based flags avoid stale closure issues in pointer event handlers
  const pickerActiveRef = useRef(false);
  const hoveredMemberIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);

  function memberIdAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y);
    return el?.closest<HTMLElement>("[data-member-id]")?.dataset.memberId ?? null;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pickerActiveRef.current) return;
    const id = memberIdAtPoint(e.clientX, e.clientY);
    hoveredMemberIdRef.current = id;
    setHoveredMemberId(id);
  }

  function handleActivatedRelease(e: React.PointerEvent) {
    pickerActiveRef.current = false;
    suppressClickRef.current = true;
    // elementFromPoint at release position is most accurate;
    // fall back to last tracked hover if pointer moved between events
    const id = memberIdAtPoint(e.clientX, e.clientY) ?? hoveredMemberIdRef.current;
    if (id) onSelectMemberProfile(id);
    setMemberPickerOpen(false);
    setHoveredMemberId(null);
    hoveredMemberIdRef.current = null;
  }

  const longPress = useLongPress(
    () => {
      pickerActiveRef.current = true;
      // flushSync forces the picker to render synchronously so avatar buttons
      // are in the DOM before the first pointermove/pointerup fires
      flushSync(() => setMemberPickerOpen(true));
    },
    handleActivatedRelease,
    1000
  );

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
          <button
            ref={membersRef}
            className={`${styles.navBtn}${activePanel === "members" ? ` ${styles.active}` : ""}`}
            onClick={() => {
              if (suppressClickRef.current) { suppressClickRef.current = false; return; }
              onNavigate("members");
            }}
            onPointerMove={handlePointerMove}
            title="Medlemmar"
            type="button"
            {...longPress}
          >
            <Users size={20} />
            <span className={styles.navLabel}>Medlemmar</span>
          </button>
        )}
        <NavBtn icon={<Settings size={20} />} label="Inställningar" panel="settings" active={activePanel === "settings"} onNavigate={onNavigate} />
      </div>

      {memberPickerOpen && (
        <NavMemberPicker
          activeId={hoveredMemberId}
          anchorRef={membersRef}
          members={activeMembers}
          onClose={() => { setMemberPickerOpen(false); setHoveredMemberId(null); hoveredMemberIdRef.current = null; pickerActiveRef.current = false; }}
          onSelect={(id) => { onSelectMemberProfile(id); setMemberPickerOpen(false); setHoveredMemberId(null); hoveredMemberIdRef.current = null; }}
        />
      )}

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
