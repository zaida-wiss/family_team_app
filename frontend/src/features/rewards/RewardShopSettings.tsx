import "./RewardShopSettings.css";
import { useState } from "react";
import type { Member, PurchasedReward, RewardShopItem, ShopAvailability } from "@shared/types";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { RequiredCategoriesEditor } from "./RequiredCategoriesEditor";

type ItemPatch = Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes" | "availability" | "requiredCategories">>;

type Props = {
  items: RewardShopItem[];
  currentMemberId: string;
  children: Member[];
  purchased: PurchasedReward[] | null;
  requireApprovalForCategories: boolean;
  onAdd: (item: RewardShopItem) => void;
  onUpdate: (itemId: string, patch: ItemPatch) => void;
  onUpdateSettings: (patch: { requireApprovalForCategories?: boolean }) => void;
  onRemove: (itemId: string) => void;
  onRefund: (childId: string, amount: number) => void;
  onMovePurchased: (id: string, startsAt: string) => void;
  onDeletePurchased: (id: string) => void;
};

type FormState = {
  title: string;
  symbol: string;
  starCost: number;
  timerMinutes: number | null;
  availability: ShopAvailability | null;
  requiredCategories: string[];
};

const blank = (): FormState => ({ title: "", symbol: "", starCost: 10, timerMinutes: null, availability: null, requiredCategories: [] });

// Konverterar ISO-sträng till lokalt datetime-input-format (respekterar enhetens tidszon)
function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PurchasedListProps = {
  purchased: PurchasedReward[] | null;
  children: Member[];
  onMovePurchased: (id: string, startsAt: string) => void;
  onDeletePurchased: (id: string) => void;
  onRefund: (childId: string, amount: number) => void;
};

function PurchasedList({ purchased, children, onMovePurchased, onDeletePurchased, onRefund }: PurchasedListProps) {
  if (purchased === null) {
    return <div className="reward-shop-settings__purchased-placeholder" aria-hidden="true" />;
  }
  if (purchased.length === 0) return null;

  const sorted = [...purchased].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

  return (
    <div className="reward-shop-settings__purchased">
      <p className="reward-shop-settings__refund-heading">Uthämtade belöningar</p>
      {sorted.map((pr) => {
        const child = children.find((c) => c.id === pr.memberId);
        const localStart = toLocalDateTimeInput(pr.startsAt);
        return (
          <div key={pr.id} className="reward-shop-settings__purchased-row">
            <span className="reward-shop-settings__purchased-symbol">{pr.itemSymbol ?? "🎁"}</span>
            <div className="reward-shop-settings__purchased-info">
              <span className="reward-shop-settings__purchased-title">{pr.itemTitle}</span>
              {child && <span className="reward-shop-settings__purchased-child">{child.name}</span>}
            </div>
            <input
              aria-label="Starttid för belöning"
              type="datetime-local"
              className="reward-shop-settings__purchased-time"
              defaultValue={localStart}
              onBlur={(e) => {
                if (e.target.value) {
                  onMovePurchased(pr.id, new Date(e.target.value).toISOString());
                }
              }}
            />
            <button
              aria-label={`Ta bort ${pr.itemTitle} och återbetala ${pr.starCost} stjärnor`}
              className="reward-shop-settings__remove"
              onClick={() => {
                onRefund(pr.memberId, pr.starCost);
                onDeletePurchased(pr.id);
              }}
              type="button"
            >✕</button>
          </div>
        );
      })}
    </div>
  );
}

export function RewardShopSettings({ items, currentMemberId, children, purchased, requireApprovalForCategories, onAdd, onUpdate, onUpdateSettings, onRemove, onRefund, onMovePurchased, onDeletePurchased }: Props) {
  const [form, setForm] = useState<FormState>(blank());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(blank());

  function startEdit(item: RewardShopItem) {
    setEditingId(item.id);
    setEditForm({ title: item.title, symbol: item.symbol ?? "", starCost: item.starCost, timerMinutes: item.timerMinutes, availability: item.availability, requiredCategories: item.requiredCategories ?? [] });
  }

  function saveEdit(itemId: string) {
    if (!editForm.title.trim()) return;
    onUpdate(itemId, { title: editForm.title.trim(), symbol: editForm.symbol || null, starCost: editForm.starCost, timerMinutes: editForm.timerMinutes, availability: editForm.availability, requiredCategories: editForm.requiredCategories });
    setEditingId(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const item: RewardShopItem = {
      id: `rsi-${Date.now()}`,
      title: form.title.trim(),
      symbol: form.symbol || null,
      starCost: form.starCost,
      timerMinutes: form.timerMinutes,
      availability: form.availability,
      requiredCategories: form.requiredCategories,
      createdBy: currentMemberId,
      deletedAt: null,
    };
    onAdd(item);
    setForm(blank());
  }

  return (
    <section className="reward-shop-settings">
      <h3 className="reward-shop-settings__heading">Belöningsbutiken</h3>

      <label className="reward-shop-settings__approval-toggle">
        <input
          type="checkbox"
          checked={requireApprovalForCategories}
          onChange={(e) => onUpdateSettings({ requireApprovalForCategories: e.target.checked })}
        />
        <span>
          Kräv föräldragodkännande för kategori-spärr
          <small>
            {requireApprovalForCategories
              ? "Barnet måste ha fått uppgifterna godkända av en förälder."
              : "Det räcker att barnet markerat uppgifterna som avklarade."}
          </small>
        </span>
      </label>

      <form className="reward-shop-settings__form" onSubmit={submit}>
        <div className="reward-shop-settings__title-row">
          <EmojiPickerPortal
            symbol={form.symbol}
            onSelect={(emoji) => setForm((f) => ({ ...f, symbol: emoji }))}
            triggerClassName="reward-shop-settings__emoji-btn"
          />
          <input
            className="reward-shop-settings__input"
            placeholder="Belöningens namn"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </div>

        <div className="reward-shop-settings__row">
          <label>
            Stjärnor
            <input
              type="number"
              min={1}
              max={999}
              value={form.starCost}
              onChange={(e) => setForm((f) => ({ ...f, starCost: Number(e.target.value) }))}
            />
          </label>
          <label>
            Timer (min)
            <input
              type="number"
              min={1}
              max={480}
              placeholder="—"
              value={form.timerMinutes ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  timerMinutes: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </label>
        </div>

        <AvailabilityEditor
          value={form.availability}
          onChange={(v) => setForm((f) => ({ ...f, availability: v }))}
        />

        <RequiredCategoriesEditor
          value={form.requiredCategories}
          onChange={(v) => setForm((f) => ({ ...f, requiredCategories: v }))}
        />

        <button type="submit" className="reward-shop-settings__add-btn">
          Lägg till
        </button>
      </form>

      {items.length > 0 && (
        <ul className="reward-shop-settings__list">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="reward-shop-settings__item reward-shop-settings__item--editing">
                <EmojiPickerPortal
                  symbol={editForm.symbol}
                  onSelect={(emoji) => setEditForm((f) => ({ ...f, symbol: emoji }))}
                  triggerClassName="reward-shop-settings__emoji-btn reward-shop-settings__emoji-btn--sm"
                />
                <input
                  className="reward-shop-settings__input reward-shop-settings__input--sm"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  aria-label="Belöningens namn"
                  autoFocus
                />
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="reward-shop-settings__edit-number"
                  value={editForm.starCost}
                  onChange={(e) => setEditForm((f) => ({ ...f, starCost: Number(e.target.value) }))}
                  aria-label="Stjärnor"
                />
                <input
                  type="number"
                  min={1}
                  max={480}
                  placeholder="—"
                  className="reward-shop-settings__edit-number"
                  value={editForm.timerMinutes ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, timerMinutes: e.target.value === "" ? null : Number(e.target.value) }))}
                  aria-label="Timer (min)"
                />
                <AvailabilityEditor
                  value={editForm.availability}
                  onChange={(v) => setEditForm((f) => ({ ...f, availability: v }))}
                />
                <RequiredCategoriesEditor
                  value={editForm.requiredCategories}
                  onChange={(v) => setEditForm((f) => ({ ...f, requiredCategories: v }))}
                />
                <button className="reward-shop-settings__save" type="button" onClick={() => saveEdit(item.id)} aria-label="Spara">✓</button>
                <button className="reward-shop-settings__remove" type="button" onClick={() => setEditingId(null)} aria-label="Avbryt">✕</button>
              </li>
            ) : (
              <li key={item.id} className="reward-shop-settings__item">
                <span className="reward-shop-settings__item-symbol">{item.symbol ?? "🎁"}</span>
                <span className="reward-shop-settings__item-title">{item.title}</span>
                <span className="reward-shop-settings__item-meta">
                  ⭐ {item.starCost}
                  {item.timerMinutes !== null && ` · ⏱ ${item.timerMinutes} min`}
                </span>
                <button
                  aria-label={`Redigera ${item.title}`}
                  className="reward-shop-settings__edit-btn"
                  onClick={() => startEdit(item)}
                  type="button"
                >
                  ✏
                </button>
                <button
                  aria-label={`Ta bort ${item.title}`}
                  className="reward-shop-settings__remove"
                  onClick={() => onRemove(item.id)}
                  type="button"
                >
                  ✕
                </button>
              </li>
            )
          )}
        </ul>
      )}

      {children.some((c) => (c.spentStars ?? 0) > 0) && items.length > 0 && (
        <div className="reward-shop-settings__refund">
          <p className="reward-shop-settings__refund-heading">Ångra köp</p>
          {children
            .filter((c) => (c.spentStars ?? 0) > 0)
            .map((child) => (
              <div key={child.id} className="reward-shop-settings__refund-child">
                <span className="reward-shop-settings__refund-name">
                  {child.name} · ⭐ {child.spentStars} spenderade
                </span>
                <div className="reward-shop-settings__refund-items">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className="reward-shop-settings__refund-btn"
                      onClick={() => onRefund(child.id, item.starCost)}
                      disabled={(child.spentStars ?? 0) < item.starCost}
                    >
                      {item.symbol ?? "🎁"} {item.title} (−⭐ {item.starCost})
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <PurchasedList
        purchased={purchased}
        children={children}
        onMovePurchased={onMovePurchased}
        onDeletePurchased={onDeletePurchased}
        onRefund={onRefund}
      />
    </section>
  );
}
