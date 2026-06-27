import { useEffect, useState } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Member } from "@shared/types";
import styles from "./NavMemberPicker.module.css";

type Props = {
  members: Member[];
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  activeId: string | null;
  onSelect: (memberId: string) => void;
  onClose: () => void;
};

type Point = { x: number; y: number };

// Avatar button outer radius: 28px xs-frame + 2px padding + 2px border = ~34px diameter → 17px radius
const AVATAR_BTN_RADIUS = 17;

function calcArcPositions(rect: DOMRect, count: number): Point[] {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const isMobile = window.innerWidth < 1024;

  const centerAngle = isMobile ? -90 : 0;
  const STEP_DEG = 40;
  const totalSpread = Math.min((count - 1) * STEP_DEG, 160);
  const stepDeg = count <= 1 ? 0 : totalSpread / (count - 1);

  const minRadius =
    stepDeg > 0
      ? Math.ceil((AVATAR_BTN_RADIUS + 2) / Math.sin((stepDeg * Math.PI) / 360))
      : 50;
  const radius = Math.max(50, minRadius);

  const startAngle = centerAngle - totalSpread / 2;
  return Array.from({ length: count }, (_, i) => {
    const deg = startAngle + i * stepDeg;
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  });
}

export function NavMemberPicker({ members, anchorRef, activeId, onSelect, onClose }: Props) {
  const [positions, setPositions] = useState<Point[]>([]);

  useEffect(() => {
    if (anchorRef.current) {
      setPositions(calcArcPositions(anchorRef.current.getBoundingClientRect(), members.length));
    }
  }, [anchorRef, members.length]);

  // Close on outside tap (deferred so the triggering pointerdown doesn't close immediately)
  useEffect(() => {
    const id = setTimeout(() => {
      function handle(e: PointerEvent) {
        if (anchorRef.current?.contains(e.target as Node)) return;
        onClose();
      }
      document.addEventListener("pointerdown", handle, { once: true });
    }, 60);
    return () => clearTimeout(id);
  }, [anchorRef, onClose]);

  if (positions.length === 0) return null;

  return (
    <>
      <div aria-hidden className={styles.backdrop} onPointerDown={onClose} />
      {members.map((member, i) => (
        <button
          className={`${styles.arcBtn}${member.id === activeId ? ` ${styles.arcBtnActive}` : ""}`}
          data-member-id={member.id}
          key={member.id}
          onClick={() => onSelect(member.id)}
          style={{ left: positions[i].x, top: positions[i].y, animationDelay: `${i * 35}ms` }}
          title={member.name}
          type="button"
        >
          <MemberAvatar member={member} size="xs" />
        </button>
      ))}
    </>
  );
}
