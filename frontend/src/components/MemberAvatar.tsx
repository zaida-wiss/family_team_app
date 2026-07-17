import "./MemberAvatar.css";
import { useEffect, useState } from "react";
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
  // Bildens URL cachas nu i localStorage (2026-07-17) tillsammans med resten
  // av medlemsdatan, men själva bilden gör det inte — den hämtas fortfarande
  // från Cloudinarys CDN vid varje visning. Utan nät (och om webbläsarens
  // egen bild-cache inte redan har den, t.ex. en annan enhet) visade denna
  // tidigare en trasig bild-ikon istället för att falla tillbaka snyggt. Ett
  // fel nollställer bara EGET state, inte något delat — byter man medlem
  // eller storlek monteras komponenten om (key ändras naturligt via props),
  // så inget explicit återställ-vid-propändring behövs.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [member.avatarUrl]);

  return (
    <span className={`avatar-frame avatar-${size}`}>
      {member.avatarUrl && !imageFailed ? (
        <img
          alt=""
          src={cloudinaryUrl(member.avatarUrl, size)}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
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
