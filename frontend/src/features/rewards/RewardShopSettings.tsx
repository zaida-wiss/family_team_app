import "./RewardShopSettings.css";
import { useState } from "react";
import type { RewardShopItem } from "@shared/types";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";

type Props = {
  items: RewardShopItem[];
  currentMemberId: string;
  onAdd: (item: RewardShopItem) => void;
  onRemove: (itemId: string) => void;
};

type FormState = {
  title: string;
  symbol: string;
  starCost: number;
  timerMinutes: number | null;
};

const blank = (): FormState => ({ title: "", symbol: "", starCost: 10, timerMinutes: null });

export function RewardShopSettings({ items, currentMemberId, onAdd, onRemove }: Props) {
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
                className="reward-shop-settings__remove"
                onClick={() => onRemove(item.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
