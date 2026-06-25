import { MemberAvatar } from "../../components/MemberAvatar";
import type { ShellPanel } from "../../hooks/useAppState";
import type { Account, Member, Role } from "@shared/types";
import styles from "./MembersView.module.css";

type Props = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onSelectMember: (id: string) => void;
  onNavigate: (panel: ShellPanel) => void;
};

export function MembersView({ account, currentMember, members, roles, onSelectMember, onNavigate }: Props) {
  const active = members.filter(
    (m) => m.accountId === account.id && m.deletedAt === null
  );

  function openMember(member: Member) {
    onSelectMember(member.id);
    onNavigate("home");
  }

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.title}>Familjemedlemmar</h2>
        <p className={styles.subtitle}>Familjen {account.name}</p>
      </div>

      <div className={styles.grid}>
        {active.map((member) => {
          const role = roles.find((r) => r.id === member.roleId);
          const isMe = member.id === currentMember.id;
          const roleLabel = member.isChild
            ? `${role?.name ?? "Barn"} · barn`
            : (role?.name ?? "Förälder");

          return (
            <button
              className={`${styles.card}${isMe ? ` ${styles.cardMe}` : ""}`}
              key={member.id}
              onClick={() => openMember(member)}
              type="button"
            >
              <MemberAvatar member={member} size="small" />
              <div className={styles.cardInfo}>
                <span className={styles.cardName}>
                  {member.name}
                  {isMe && <span className={styles.youTag}>Du</span>}
                </span>
                <span className={styles.cardRole}>{roleLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
