import { useState } from "react";
import { Share2, X } from "lucide-react";
import type { AccessLevel, Calendar, Id, Member } from "@shared/types";
import { getMemberName } from "./calendarPanelHelpers";

type Props = {
  selectedCalendar: Calendar;
  members: Member[];
  currentMemberId: Id;
  canEdit: boolean;
  onShareCalendar: (calendarId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
};

export function CalendarShareSection({
  selectedCalendar,
  members,
  currentMemberId,
  canEdit,
  onShareCalendar,
  onRemoveCalendarShare,
}: Props) {
  const [shareMemberId, setShareMemberId] = useState(
    members.find((m) => m.id !== currentMemberId)?.id ?? ""
  );
  const [shareAccess, setShareAccess] = useState<AccessLevel>("view");

  function share() {
    if (!shareMemberId || !canEdit) return;
    onShareCalendar(selectedCalendar.id, shareMemberId, shareAccess);
  }

  return (
    <section aria-label="Dela kalender">
      <div>
        <p className="eyebrow">Delning</p>
        <h3>Dela {selectedCalendar.name}</h3>
      </div>
      <div className="calendar-event-form">
        <select
          aria-label="Välj medlem att dela med"
          className="text-input"
          disabled={!canEdit}
          onChange={(e) => setShareMemberId(e.target.value)}
          value={shareMemberId}
        >
          <option value="">Välj medlem</option>
          {members
            .filter((m) => m.id !== currentMemberId)
            .map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
        </select>
        <select
          aria-label="Behörighetsnivå"
          className="text-input"
          disabled={!canEdit}
          onChange={(e) => setShareAccess(e.target.value as AccessLevel)}
          value={shareAccess}
        >
          <option value="view">Bara se</option>
          <option value="edit">Redigera</option>
        </select>
        <button
          className="secondary-button"
          disabled={!canEdit || !shareMemberId}
          onClick={share}
          type="button"
        >
          <Share2 size={16} />
          Dela
        </button>
      </div>
      {selectedCalendar.sharedWith.length > 0 ? (
        <div className="share-list">
          {selectedCalendar.sharedWith.map((share) => (
            <div className="share-row" key={share.memberId}>
              <span>
                {getMemberName(share.memberId, members)}
                <small>{share.access === "edit" ? "Kan redigera" : "Kan se"}</small>
              </span>
              <button
                className="icon-button danger"
                disabled={!canEdit}
                onClick={() => onRemoveCalendarShare(selectedCalendar.id, share.memberId)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-note">Kalendern är privat.</p>
      )}
    </section>
  );
}
