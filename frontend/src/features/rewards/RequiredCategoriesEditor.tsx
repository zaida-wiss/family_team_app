import "./RequiredCategoriesEditor.css";
import type { Id, TodoCategory } from "@shared/types";

type Props = {
  value: Id[];
  onChange: (v: Id[]) => void;
  // Kategorierna som faktiskt används på barnens uppgifter (2026-07-08,
  // ADR-0020 — ersätter det tidigare fasta Hälsa/Trivsel/Pengar-settet).
  // Härleds av anroparen (RewardShopSettings.tsx).
  availableCategories: TodoCategory[];
};

export function RequiredCategoriesEditor({ value, onChange, availableCategories }: Props) {
  const safeValue = value ?? [];

  function toggleCategory(categoryId: Id) {
    onChange(
      safeValue.includes(categoryId)
        ? value.filter((c) => c !== categoryId)
        : [...value, categoryId]
    );
  }

  if (availableCategories.length === 0) {
    return (
      <div className="required-categories-editor">
        <p className="required-categories-editor__label">
          Kräver avklarade uppdrag i kategori
        </p>
        <p className="empty-note">
          Inga kategorier ännu — skapa en via tråd-vyns "Lägg till uppgift"-meny och tilldela minst ett barn en uppgift i den, så blir den valbar här.
        </p>
      </div>
    );
  }

  return (
    <div className="required-categories-editor">
      <p className="required-categories-editor__label">
        Kräver avklarade uppdrag i kategori
      </p>
      <div className="required-categories-editor__options">
        {availableCategories.map((category) => (
          <label key={category.id} className="required-categories-editor__option">
            <input
              type="checkbox"
              checked={safeValue.includes(category.id)}
              onChange={() => toggleCategory(category.id)}
            />
            {category.name}
          </label>
        ))}
      </div>
    </div>
  );
}
