import "./MemberAvatar.css";
import { Baby, Users } from "lucide-react";
import type { Member } from "@shared/types";
import { cloudinaryUrl } from "../utils/uploadImage";

type MemberAvatarProps = {
  member: Member;
  showArchedName?: boolean;
  size?: "large" | "small" | "xs";
};

export function MemberAvatar({
  member,
  showArchedName = false,
  size = "large"
}: MemberAvatarProps) {
  const pathId = `avatar-arc-${member.id.replace(/[^a-zA-Z0-9]/g, "")}-${size}`;
  const iconSize = size === "large" ? 34 : size === "small" ? 18 : 12;

  return (
    <span className={`avatar-frame avatar-${size}`}>
      {member.avatarUrl ? (
        <img
          alt=""
          src={cloudinaryUrl(member.avatarUrl, size)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="avatar-icon">
          {member.isChild ? (
            <Baby size={iconSize} />
          ) : (
            <Users size={iconSize} />
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
