import "./RequiredCategoriesEditor.css";
import { ROUTINE_CATEGORIES } from "@shared/types";

type Props = {
  value: string[];
  onChange: (v: string[]) => void;
};

export function RequiredCategoriesEditor({ value, onChange }: Props) {
  function toggleCategory(category: string) {
    onChange(
      value.includes(category)
        ? value.filter((c) => c !== category)
        : [...value, category]
    );
  }

  return (
    <div className="required-categories-editor">
      <p className="required-categories-editor__label">
        Kräver avklarade uppdrag i kategori
      </p>
      <div className="required-categories-editor__options">
        {ROUTINE_CATEGORIES.map((category) => (
          <label key={category} className="required-categories-editor__option">
            <input
              type="checkbox"
              checked={value.includes(category)}
              onChange={() => toggleCategory(category)}
            />
            {category}
          </label>
        ))}
      </div>
    </div>
  );
}
