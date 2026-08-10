import { Plus } from "lucide-react";
import { useState } from "react";
import type { ClipboardEvent } from "react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { ShoppingListCard } from "./ShoppingListCard";
import { readCache, writeCache } from "../../utils/localCache";
import { splitPastedShoppingItems } from "./parseShoppingPaste";
import { useDragReorder } from "../../hooks/useDragReorder";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import styles from "./ShoppingLists.module.css";
import type { AccessLevel, Id, Member, Role, ShoppingList } from "@shared/types";

const SHOW_COMPLETED_CACHE_KEY = "shopping_show_completed_v1";

// Visning av bockade varor + redigeringsläge (2026-07-22, Zaidas önskemål:
// "tänk minimalistiskt"). "Visa avklarade" per lista sparas nu på ENHETEN
// (2026-07-27, Zaidas fynd: "sparas inställningen [inte] om jag växlar vy...
// det ska sparas på enheten") — var tidigare bara lokal komponent-state,
// nollställdes vid varje panelbyte (samma remount-mönster som redan
// dokumenterats för andra paneler, ErrorBoundary key={activePanel}). En
// lista som aldrig fått ett eget val på DENNA enhet faller tillbaka på
// showCompletedDefault (medlemmens inställning, Inställningar →
// Inköpslistor), annars "visa" — oförändrat beteende. Synliga bockade varor
// hamnar alltid sist. Raderaknappen per rad och delningspanelen visas bara
// i redigeringsläge, inte hela tiden — Redigera-knappen är medvetet bara en
// ikon (ingen text).
type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  showCompletedDefault?: boolean;
  onAddItem: (listId: Id, title: string) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
  onDeleteItem: (listId: Id, itemId: Id) => void;
  onReorderItems: (listId: Id, itemIds: Id[]) => void;
  onClearCompleted: (listId: Id) => void;
  onCreateList: (name: string, icon?: string | null) => void;
  onDeleteList: (listId: Id) => void;
  onRenameList: (listId: Id, name: string) => void;
  onShareList: (listId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveListShare: (listId: Id, memberId: Id) => void;
};

type ShareDraft = { memberId: Id; access: AccessLevel };

export function ShoppingView({
  currentMember,
  members,
  roles,
  shoppingLists,
  showCompletedDefault,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onReorderItems,
  onClearCompleted,
  onCreateList,
  onDeleteList,
  onRenameList,
  onShareList,
  onRemoveListShare
}: Props) {
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});
  // Sparat på ENHETEN, inte per komponent-mount (se filhuvudets kommentar) —
  // lazy-init från localStorage, skrivs om vid varje ändring.
  const [showCompleted, setShowCompleted] = useState<Record<Id, boolean>>(() =>
    readCache(SHOW_COMPLETED_CACHE_KEY, {})
  );

  function setListShowCompleted(listId: Id, value: boolean) {
    setShowCompleted((prev) => {
      const next = { ...prev, [listId]: value };
      writeCache(SHOW_COMPLETED_CACHE_KEY, next);
      return next;
    });
  }

  function shouldShowCompletedFor(listId: Id): boolean {
    return showCompleted[listId] ?? showCompletedDefault ?? true;
  }
  const [editingLists, setEditingLists] = useState<Record<Id, boolean>>({});
  const [sharingListId, setSharingListId] = useState<Id | null>(null);
  const [shareDrafts, setShareDrafts] = useState<Record<Id, ShareDraft>>({});
  const [creatingList, setCreatingList] = useState(false);
  const [draftListName, setDraftListName] = useState("");
  const [draftListIcon, setDraftListIcon] = useState("");
  const [mergingListId, setMergingListId] = useState<Id | null>(null);
  // Byt namn i redigeringsläge (2026-07-28, Zaidas önskemål: "inköpslistorna
  // måste gå att ändra namn på när man trycker på redigera") — sparas vid
  // blur/Enter, samma mönster som ShoppingListsPanel.tsx.
  const [nameDrafts, setNameDrafts] = useState<Record<Id, string>>({});

  function saveListName(list: ShoppingList) {
    const draft = nameDrafts[list.id]?.trim();
    if (draft && draft !== list.name) {
      onRenameList(list.id, draft);
    }
    setNameDrafts((current) => {
      const next = { ...current };
      delete next[list.id];
      return next;
    });
  }
  const [mergeTargetId, setMergeTargetId] = useState<Id | null>(null);
  // Drag-and-drop-ordning på varorna (2026-07-26, konsoliderad till den
  // delade hooken 2026-08-10, Sprint 9 S4) — "data-list-id" som groupAttr
  // förhindrar bara en missvisande drag-över-markering på en rad i en ANNAN
  // lista, den faktiska omordningen är redan säker (en främmande vara hittas
  // aldrig i den lista som tar emot droppet).
  const drag = useDragReorder<Id>("data-item-id", "data-list-id");

  const canEdit = hasPermission(currentMember, roles, "canEditShoppingLists");
  const canCreate = hasPermission(currentMember, roles, "canCreateShoppingLists");
  // Soft-deletade medlemmar ska inte gå att välja i delnings-listan
  // (2026-07-23, Zaidas fynd) — namn-uppslaget för en redan gjord delning
  // (nedan) förblir medvetet ofiltrerat.
  const activeMembers = members.filter((m) => m.deletedAt === null);

  const visible = shoppingLists.filter((list) => {
    if (list.deletedAt !== null) return false;
    return (
      hasPermission(currentMember, roles, "canSeeShoppingLists") &&
      canViewResource(currentMember, list)
    );
  });

  function canEditList(list: ShoppingList) {
    return canEdit && canEditSharedResource(currentMember, list);
  }

  function addItem(listId: Id) {
    const title = draftItems[listId]?.trim();
    const list = shoppingLists.find((l) => l.id === listId);
    if (!title || !list || !canEditList(list)) return;
    onAddItem(listId, title);
    setDraftItems((prev) => ({ ...prev, [listId]: "" }));
  }

  // Klistra in flera varor på en gång, en per rad (2026-08-09, Zaidas
  // önskemål: "bara de har ett radbryt, eller semikolon") — en enda vara
  // (inget separatortecken hittat) lämnas till fältets vanliga klistra-in-
  // hantering istället, så en vanlig enstaka inklistring beter sig som förut.
  function handleItemPaste(e: ClipboardEvent<HTMLInputElement>, listId: Id) {
    const list = shoppingLists.find((l) => l.id === listId);
    if (!list || !canEditList(list)) return;
    const items = splitPastedShoppingItems(e.clipboardData.getData("text"));
    if (items.length <= 1) return;
    e.preventDefault();
    items.forEach((title) => onAddItem(listId, title));
  }

  function createList() {
    const name = draftListName.trim();
    if (!name || !canCreate) return;
    onCreateList(name, draftListIcon || null);
    setDraftListName("");
    setDraftListIcon("");
    setCreatingList(false);
  }

  function getDefaultShareDraft(): ShareDraft {
    return {
      memberId: activeMembers.find((m) => m.id !== currentMember.id)?.id ?? "",
      access: "view"
    };
  }

  function getShareDraft(listId: Id): ShareDraft {
    return shareDrafts[listId] ?? getDefaultShareDraft();
  }

  // Slå ihop två listor (2026-07-26, Zaidas önskemål) — återanvänder
  // befintliga onAddItem/onDeleteList, ingen ny backend-endpoint. Varorna
  // läggs till som NYA, obockade rader i målet (samma "en rad i taget"-
  // mönster som CSV-importen) — bockad status från källistan förs medvetet
  // inte över, en enkel avvägning. Källistan raderas (mjukt) efteråt.
  function mergeListInto(sourceListId: Id, targetListId: Id) {
    const source = shoppingLists.find((l) => l.id === sourceListId);
    const target = shoppingLists.find((l) => l.id === targetListId);
    if (!source || !target || !canEditList(source) || !canEditList(target)) return;
    for (const item of source.items.filter((i) => i.deletedAt === null)) {
      onAddItem(targetListId, item.title);
    }
    onDeleteList(sourceListId);
    setMergingListId(null);
    setMergeTargetId(null);
  }

  return (
    <div className="dashboard-list">
      {canCreate && (
        <div className={styles.card}>
          {creatingList ? (
            <div className={styles.addRow}>
              <EmojiPickerPortal
                onSelect={setDraftListIcon}
                symbol={draftListIcon}
                triggerClassName="icon-button"
              />
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setDraftListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createList();
                  if (e.key === "Escape") setCreatingList(false);
                }}
                placeholder="Namn på listan"
                value={draftListName}
              />
              <button
                aria-label="Skapa lista"
                className="icon-button"
                disabled={!draftListName.trim()}
                onClick={createList}
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <button
              className="secondary-button"
              onClick={() => setCreatingList(true)}
              type="button"
            >
              <Plus size={16} />
              Ny lista
            </button>
          )}
        </div>
      )}

      {visible.length === 0 && !canCreate && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Inköp</p><h2>Inga inköpslistor</h2></div>
          </header>
          <p className="empty-note">Du har inga tillgängliga inköpslistor.</p>
        </article>
      )}

      {visible.map((list) => {
        const editable = canEditList(list);
        const isEditing = editable && (editingLists[list.id] ?? false);
        const isSharing = sharingListId === list.id;
        const isMerging = mergingListId === list.id;
        const shareDraft = getShareDraft(list.id);
        const otherEditableLists = shoppingLists.filter(
          (l) => l.id !== list.id && l.deletedAt === null && canEditList(l)
        );

        return (
          <ShoppingListCard
            activeMembers={activeMembers}
            currentMember={currentMember}
            dragOverItemId={drag.dragOverKey}
            draggingItemId={drag.draggingKey}
            draftItemValue={draftItems[list.id] ?? ""}
            editable={editable}
            isEditing={isEditing}
            isMerging={isMerging}
            isSharing={isSharing}
            key={list.id}
            list={list}
            members={members}
            mergeTargetId={mergeTargetId}
            nameDraft={nameDrafts[list.id] ?? list.name}
            onAddItemClick={() => addItem(list.id)}
            onClearCompleted={() => onClearCompleted(list.id)}
            onConfirmMerge={() => mergeTargetId && mergeListInto(list.id, mergeTargetId)}
            onConfirmShare={() => onShareList(list.id, shareDraft.memberId, shareDraft.access)}
            onDeleteItem={(itemId) => onDeleteItem(list.id, itemId)}
            onDeleteListClick={() => onDeleteList(list.id)}
            onDraftItemChange={(value) => setDraftItems((prev) => ({ ...prev, [list.id]: value }))}
            onItemPaste={(e) => handleItemPaste(e, list.id)}
            onItemPointerDown={(e, itemId) => drag.handlePointerDown(e, itemId, list.id)}
            onItemPointerMove={drag.handlePointerMove}
            onItemPointerUp={(visibleItemIds) =>
              drag.handlePointerUp(visibleItemIds, (next) => onReorderItems(list.id, next))
            }
            onMergeTargetChange={setMergeTargetId}
            onNameDraftChange={(value) => setNameDrafts((current) => ({ ...current, [list.id]: value }))}
            onRemoveShare={(memberId) => onRemoveListShare(list.id, memberId)}
            onSaveListName={() => saveListName(list)}
            onShareDraftAccessChange={(access) =>
              setShareDrafts((prev) => ({ ...prev, [list.id]: { ...shareDraft, access } }))
            }
            onShareDraftMemberChange={(memberId) =>
              setShareDrafts((prev) => ({ ...prev, [list.id]: { ...shareDraft, memberId } }))
            }
            onToggleEditingMode={() => {
              if (!isEditing) {
                setEditingLists((prev) => ({ ...prev, [list.id]: true }));
                return;
              }
              // Lämnar redigeringsläget — spara ett ev. öppet namnbyte och
              // nollställ en öppen sammanslagning.
              saveListName(list);
              setEditingLists((prev) => ({ ...prev, [list.id]: false }));
              setMergingListId((current) => (current === list.id ? null : current));
            }}
            onToggleItem={(itemId) => onToggleItem(list.id, itemId)}
            onToggleMerging={() => {
              setMergingListId((current) => (current === list.id ? null : list.id));
              setMergeTargetId(null);
            }}
            onToggleShowCompleted={() => setListShowCompleted(list.id, !shouldShowCompletedFor(list.id))}
            onToggleSharing={() => setSharingListId(isSharing ? null : list.id)}
            otherEditableLists={otherEditableLists}
            shareDraft={shareDraft}
            shouldShowCompleted={shouldShowCompletedFor(list.id)}
          />
        );
      })}

    </div>
  );
}
