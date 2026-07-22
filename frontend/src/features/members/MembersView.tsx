import { MemberAvatar } from "../../components/MemberAvatar";
import type { Account, Member, Role } from "@shared/types";
import styles from "./MembersView.module.css";

type Props = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onSelectMember: (id: string) => void;
};

// Medlemmar-panelen (2026-07-23, Zaidas beslut: "endast medlemmar symbolen
// som skall vara markerad. Klickar vi på hemmet eller kalendern så ska det
// inte längre vara barnvyn") — att klicka ett kort valde tidigare medlemmen
// OCH navigerade till Hem, vilket visade dashboarden där (fel nav-ikon
// markerad, och Hem/Kalender/Todos/Inköp visade sedan permanent den valda
// personens vy tills man valde en annan medlem). Nu stannar valet kvar HÄR —
// PanelRouter (Shell.tsx) visar dashboarden i samma panel (activePanel
// förblir "members") så länge ett val finns. Hem/Kalender/Todos/Inköp
// rensar alltid valet (se useAppState.ts:s setActivePanel) — de fungerar
// därmed som en implicit "tillbaka till min egen vy"-väg, och att klicka
// Medlemmar-ikonen igen (samma rensning) fungerar som "tillbaka till listan".
export function MembersView({ account, currentMember, members, roles, onSelectMember }: Props) {
  const active = members.filter(
    (m) => m.accountId === account.id && m.deletedAt === null
  );

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
              onClick={() => onSelectMember(member.id)}
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
