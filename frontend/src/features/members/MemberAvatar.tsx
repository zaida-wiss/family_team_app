import { Baby, Users } from "lucide-react";
import type { Member } from "@shared/types";

type MemberAvatarProps = {
  member: Member;
  showArchedName?: boolean;
  size?: "large" | "small";
};

export function MemberAvatar({
  member,
  showArchedName = false,
  size = "large"
}: MemberAvatarProps) {
  const pathId = `avatar-arc-${member.id.replace(/[^a-zA-Z0-9]/g, "")}-${size}`;

  return (
    <span className={`avatar-frame avatar-${size}`}>
      {member.avatarUrl ? (
        <img alt="" src={member.avatarUrl} />
      ) : (
        <span className="avatar-icon">
          {member.isChild ? (
            <Baby size={size === "large" ? 34 : 18} />
          ) : (
            <Users size={size === "large" ? 34 : 18} />
          )}
        </span>
      )}

      {showArchedName ? (
        <svg aria-hidden="true" className="avatar-arc-text" viewBox="0 0 108 108">
          <defs>
            <path d="M 16 58 A 38 38 0 0 1 92 58" id={pathId} />
          </defs>
          <text>
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {member.name}
            </textPath>
          </text>
        </svg>
      ) : null}
    </span>
  );
}
