import { MemberAvatar } from "../../components/MemberAvatar";
import type { Account, Member, Role } from "@shared/types";

type Props = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
};

export function MembersView({ account, currentMember, members, roles }: Props) {
  const active = members.filter(
    (m) => m.accountId === account.id && m.deletedAt === null
  );

  return (
    <div className="members-page">
      <div>
        <h2 className="members-page-title">Familjemedlemmar</h2>
        <p className="members-page-sub">Familjen {account.name}</p>
      </div>

      <div className="members-grid">
        {active.map((member) => {
          const role = roles.find((r) => r.id === member.roleId);
          const isMe = member.id === currentMember.id;
          const roleLabel = member.isChild
            ? `${role?.name ?? "Barn"} · barn`
            : (role?.name ?? "Förälder");

          return (
            <div
              className={`members-card${isMe ? " members-card--me" : ""}`}
              key={member.id}
            >
              <MemberAvatar member={member} />
              <div className="members-card-info">
                <span className="members-card-name">
                  {member.name}
                  {isMe && <span className="member-you-tag">Du</span>}
                </span>
                <span className="members-card-role">{roleLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
