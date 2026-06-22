import type { Account, Member } from "@shared/types";
import { MemberAvatar } from "../../components/MemberAvatar";

type Props = {
  account: Account;
  members: Member[];
  onSelect: (memberId: string) => void;
};

export function MemberPicker({ account, members, onSelect }: Props) {
  return (
    <main className="member-picker">
      <p className="eyebrow">Familj</p>
      <h1>{account.name}</h1>
      <p className="member-picker-prompt">Vem är du?</p>
      <div className="member-picker-grid">
        {members.map((member) => (
          <button
            className="member-picker-button"
            key={member.id}
            onClick={() => onSelect(member.id)}
            type="button"
          >
            <MemberAvatar member={member} showArchedName />
          </button>
        ))}
      </div>
    </main>
  );
}
