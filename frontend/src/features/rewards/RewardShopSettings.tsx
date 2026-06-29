import "./RewardShopSettings.css";
import { useState } from "react";
import type { Member, PurchasedReward, RewardShopItem } from "@shared/types";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";

type Props = {
  items: RewardShopItem[];
  currentMemberId: string;
  children: Member[];
  purchased: PurchasedReward[] | null;
  onAdd: (item: RewardShopItem) => void;
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
};

const blank = (): FormState => ({ title: "", symbol: "", starCost: 10, timerMinutes: null });

type PurchasedListProps = {
  purchased: PurchasedReward[] | null;
  children: Member[];
  onMovePurchased: (id: string, startsAt: string) => void;
  onDeletePurchased: (id: string) => void;
};

function PurchasedList({ purchased, children, onMovePurchased, onDeletePurchased }: PurchasedListProps) {
  if (purchased === null) {
    return <div className="reward-shop-settings__purchased-placeholder" aria-hidden="true" />;
  }
  if (purchased.length === 0) return null;
  return (
    <div className="reward-shop-settings__purchased">
      <p className="reward-shop-settings__refund-heading">Uthämtade belöningar</p>
      {purchased.map((pr) => {
        const child = children.find((c) => c.id === pr.memberId);
        const localStart = new Date(pr.startsAt).toISOString().slice(0, 16);
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
              aria-label={`Ta bort ${pr.itemTitle}`}
              className="reward-shop-settings__remove"
              onClick={() => onDeletePurchased(pr.id)}
              type="button"
            >✕</button>
          </div>
        );
      })}
    </div>
  );
}

export function RewardShopSettings({ items, currentMemberId, children, purchased, onAdd, onRemove, onRefund, onMovePurchased, onDeletePurchased }: Props) {
  const [form, setForm] = useState<FormState>(blank());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const item: RewardShopItem = {
      id: `rsi-${Date.now()}`,
      title: form.title.trim(),
      symbol: form.symbol || null,
      starCost: form.starCost,
      timerMinutes: form.timerMinutes,
      createdBy: currentMemberId,
      deletedAt: null,
    };
    onAdd(item);
    setForm(blank());
  }

  return (
    <section className="reward-shop-settings">
      <h3 className="reward-shop-settings__heading">Belöningsbutiken</h3>

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

        <button type="submit" className="reward-shop-settings__add-btn">
          Lägg till
        </button>
      </form>

      {items.length > 0 && (
        <ul className="reward-shop-settings__list">
          {items.map((item) => (
            <li key={item.id} className="reward-shop-settings__item">
              <span className="reward-shop-settings__item-symbol">{item.symbol ?? "🎁"}</span>
              <span className="reward-shop-settings__item-title">{item.title}</span>
              <span className="reward-shop-settings__item-meta">
                ⭐ {item.starCost}
                {item.timerMinutes !== null && ` · ⏱ ${item.timerMinutes} min`}
              </span>
              <button
                aria-label={`Ta bort ${item.title}`}
                className="reward-shop-settings__remove"
                onClick={() => onRemove(item.id)}
                type="button"
              >
                ✕
              </button>
            </li>
          ))}
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
      />
    </section>
  );
}
