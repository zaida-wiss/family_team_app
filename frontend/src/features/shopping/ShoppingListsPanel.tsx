import { Plus, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import type { AccessLevel, Id, Member, Role, ShoppingList } from "@shared/types";

type ShoppingListsPanelProps = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  onCreateList: (name: string) => void;
  onAddItem: (listId: Id, title: string) => void;
  onDeleteList: (listId: Id) => void;
  onRemoveListShare: (listId: Id, memberId: Id) => void;
  onShareList: (listId: Id, memberId: Id, access: AccessLevel) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
};

type ShareDraft = {
  memberId: Id;
  access: AccessLevel;
};

export function ShoppingListsPanel({
  currentMember,
  members,
  roles,
  shoppingLists,
  onCreateList,
  onAddItem,
  onDeleteList,
  onRemoveListShare,
  onShareList,
  onToggleItem
}: ShoppingListsPanelProps) {
  const [draftListName, setDraftListName] = useState("");
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});
  const [shareDrafts, setShareDrafts] = useState<Record<Id, ShareDraft>>({});
  const canCreateShoppingLists = hasPermission(currentMember, roles, "canCreateShoppingLists");
  const canEditShoppingLists = hasPermission(currentMember, roles, "canEditShoppingLists");
  const visibleLists = shoppingLists.filter((list) => {
    if (list.deletedAt !== null) {
      return false;
    }

    return (
      hasPermission(currentMember, roles, "canSeeShoppingLists") &&
      canViewResource(currentMember, list)
    );
  });

  function createList() {
    const name = draftListName.trim();

    if (!name || !canCreateShoppingLists) {
      return;
    }

    onCreateList(name);
    setDraftListName("");
  }

  function addItem(listId: Id) {
    const title = draftItems[listId]?.trim();
    const list = shoppingLists.find((candidate) => candidate.id === listId);

    if (!title || !list || !canEditList(list)) {
      return;
    }

    onAddItem(listId, title);
    setDraftItems((currentDrafts) => ({
      ...currentDrafts,
      [listId]: ""
    }));
  }

  function shareList(list: ShoppingList) {
    const draft = getShareDraft(list.id);

    if (!draft.memberId || !canEditList(list)) {
      return;
    }

    onShareList(list.id, draft.memberId, draft.access);
  }

  function getDefaultShareDraft(): ShareDraft {
    return {
      memberId: members.find((member) => member.id !== currentMember.id)?.id ?? "",
      access: "view"
    };
  }

  function getShareDraft(listId: Id): ShareDraft {
    return shareDrafts[listId] ?? getDefaultShareDraft();
  }

  function updateShareDraft(listId: Id, draftUpdate: Partial<ShareDraft>) {
    setShareDrafts((currentDrafts) => ({
      ...currentDrafts,
      [listId]: {
        ...(currentDrafts[listId] ?? getDefaultShareDraft()),
        ...draftUpdate
      }
    }));
  }

  function canEditList(list: ShoppingList) {
    return canEditShoppingLists && canEditSharedResource(currentMember, list);
  }

  return (
    <div className="dashboard-list">
      <section className="shopping-create-card" aria-label="Skapa inköpslista">
        <div>
          <p className="eyebrow">Ny lista</p>
          <h3>Skapa inköpslista</h3>
        </div>
        <div className="shopping-add-row">
          <input
            className="text-input"
            disabled={!canCreateShoppingLists}
            onChange={(event) => setDraftListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                createList();
              }
            }}
            placeholder="Till exempel Fredagsmys"
            value={draftListName}
          />
          <button
            className="icon-button"
            disabled={!canCreateShoppingLists}
            onClick={createList}
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {visibleLists.map((list) => {
        const canEditThisList = canEditList(list);
        const shareDraft = getShareDraft(list.id);

        return (
          <div className="shopping-card" key={list.id}>
            <div className="shopping-card-header">
              <div>
                <ShoppingCart size={18} />
                <strong>{list.name}</strong>
              </div>
              <button
                aria-label={`Radera ${list.name}`}
                className="icon-button danger"
                disabled={!canEditThisList}
                onClick={() => onDeleteList(list.id)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <ul className="shopping-items">
              {list.items
                .filter((item) => item.deletedAt === null)
                .map((item) => (
                  <li key={item.id}>
                    <label className={item.done ? "done" : ""}>
                      <input
                        checked={item.done}
                        disabled={!canEditThisList}
                        onChange={() => onToggleItem(list.id, item.id)}
                        type="checkbox"
                      />
                      <span>{item.title}</span>
                    </label>
                  </li>
                ))}
            </ul>

            <div className="shopping-add-row">
              <input
                className="text-input"
                disabled={!canEditThisList}
                onChange={(event) =>
                  setDraftItems((currentDrafts) => ({
                    ...currentDrafts,
                    [list.id]: event.target.value
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    addItem(list.id);
                  }
                }}
                placeholder="Lägg till vara"
                value={draftItems[list.id] ?? ""}
              />
              <button
                className="icon-button"
                disabled={!canEditThisList}
                onClick={() => addItem(list.id)}
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="shopping-share-panel">
              <div className="calendar-event-form">
                <select
                  className="text-input"
                  disabled={!canEditThisList}
                  onChange={(event) =>
                    updateShareDraft(list.id, { memberId: event.target.value })
                  }
                  value={shareDraft.memberId}
                >
                  <option value="">Välj medlem</option>
                  {members
                    .filter((member) => member.id !== currentMember.id)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
                <select
                  className="text-input"
                  disabled={!canEditThisList}
                  onChange={(event) =>
                    updateShareDraft(list.id, {
                      access: event.target.value as AccessLevel
                    })
                  }
                  value={shareDraft.access}
                >
                  <option value="view">Bara se</option>
                  <option value="edit">Redigera</option>
                </select>
                <button
                  className="secondary-button"
                  disabled={!canEditThisList || !shareDraft.memberId}
                  onClick={() => shareList(list)}
                  type="button"
                >
                  <Share2 size={16} />
                  Dela
                </button>
              </div>

              {list.sharedWith.length > 0 ? (
                <div className="share-list">
                  {list.sharedWith.map((share) => (
                    <div className="share-row" key={share.memberId}>
                      <span>
                        {getMemberName(share.memberId, members)}
                        <small>
                          {share.access === "edit" ? "Kan redigera" : "Kan se"}
                        </small>
                      </span>
                      <button
                        className="icon-button danger"
                        disabled={!canEditThisList}
                        onClick={() => onRemoveListShare(list.id, share.memberId)}
                        type="button"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">Listan är privat.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getMemberName(memberId: Id, members: Member[]) {
  return members.find((member) => member.id === memberId)?.name ?? "Okänd medlem";
}
