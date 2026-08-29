import { Star } from "lucide-react";
import type { Member, Role } from "@shared/types";
import { MemberAvatar } from "../../components/MemberAvatar";
import { isChildMember } from "../todos/selectors";
import "./FamilyChildrenStars.css";

type Props = {
  members: Member[];
  roles: Role[];
};

// Hem-vyns nya "familjeläge"-standardvy (2026-08-29, Zaidas önskemål efter
// en mockup-bild: "Barnens stjärnor" — exakt som bilden, bara namn + totalt
// antal godkända stjärnor per barn). member.approvedStars är redan
// denormaliserat och inkrementeras vid godkännande (se CLAUDE.md:s "Viktiga
// tekniska beslut") — ingen egen beräkning behövs här.
export function FamilyChildrenStars({ members, roles }: Props) {
  const children = members.filter((m) => isChildMember(m, roles));

  if (children.length === 0) {
    return <p className="empty-note">Inga barnkonton i familjen ännu.</p>;
  }

  return (
    <ul aria-label="Barnens stjärnor" className="family-children-stars">
      {children.map((child) => (
        <li className="family-children-stars__row" key={child.id}>
          <MemberAvatar member={child} size="small" />
          <div className="family-children-stars__info">
            <strong>{child.name}</strong>
            <span>{child.approvedStars} godkända stjärnor</span>
          </div>
          <span className="family-children-stars__count">
            <Star aria-hidden="true" fill="currentColor" size="1rem" />
            {child.approvedStars}
          </span>
        </li>
      ))}
    </ul>
  );
}
