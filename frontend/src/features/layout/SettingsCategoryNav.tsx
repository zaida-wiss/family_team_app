import { ChevronRight } from "lucide-react";
import "./SettingsCategoryNav.css";
import type { ReactNode } from "react";

export type SettingsSubcategory = {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "danger";
} & ({ content: ReactNode; onSelect?: never } | { content?: never; onSelect: () => void });

export type SettingsCategory = {
  id: string;
  label: string;
  icon: ReactNode;
  subcategories: SettingsSubcategory[];
};

type Props = {
  categories: SettingsCategory[];
  // Kontrollerad komponent (2026-08-11) — kategori/underkategori-valet ägs
  // av useSettingsNavSync.ts (SettingsContent.tsx) istället för intern
  // state, så det kan hållas synkat med webbläsarens historik (bakåt/
  // framåt-knapparna). null = kategori-rutnätet.
  activeCategoryId: string | null;
  activeSubId: string | null;
  onOpenCategory: (categoryId: string, subId: string | null) => void;
  onOpenSub: (subId: string) => void;
  onBackToCategories: () => void;
  onBackToSubcategories: () => void;
};

// Tvånivå-navigering för Inställningar (2026-07-22, Zaidas önskemål: "en
// för konto/familjemedlemmar/roller/tema, en för kalender, en för
// shoppinglista, en för todo-lista och en för barn... du skall hela tiden
// veta var du är"). Ersätter den tidigare platta listan med 18 oberoende,
// samtidigt öppningsbara accordion-sektioner (settings-section.tsx) — bara
// EN kategori och EN underkategori kan vara öppen åt gången, en brödsmule
// visar alltid var man är.
export function SettingsCategoryNav({
  categories,
  activeCategoryId,
  activeSubId,
  onOpenCategory,
  onOpenSub,
  onBackToCategories,
  onBackToSubcategories
}: Props) {
  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;
  const activeSub = activeCategory?.subcategories.find((s) => s.id === activeSubId) ?? null;
  const hasSingleSub = (activeCategory?.subcategories.length ?? 0) <= 1;

  function openCategory(category: SettingsCategory) {
    onOpenCategory(category.id, category.subcategories.length === 1 ? category.subcategories[0].id : null);
  }

  function backToSubcategories() {
    if (hasSingleSub) {
      onBackToCategories();
      return;
    }
    onBackToSubcategories();
  }

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "Inställningar", onClick: activeCategory ? onBackToCategories : undefined }
  ];
  if (activeCategory) {
    const categoryIsLastCrumb = !activeSub || hasSingleSub;
    crumbs.push({ label: activeCategory.label, onClick: categoryIsLastCrumb ? undefined : backToSubcategories });
  }
  if (activeCategory && activeSub && !hasSingleSub) {
    crumbs.push({ label: activeSub.label });
  }

  return (
    <div className="settings-nav">
      <header className="section-header">
        <div>
          <p className="eyebrow">Konto</p>
          <h2>Inställningar</h2>
        </div>
      </header>

      <nav aria-label="Var i inställningarna du är" className="settings-breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span className="settings-breadcrumb__segment" key={crumb.label}>
              {index > 0 && <span aria-hidden="true">›</span>}
              {crumb.onClick ? (
                <button className="settings-breadcrumb__item" onClick={crumb.onClick} type="button">
                  {crumb.label}
                </button>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="settings-breadcrumb__item settings-breadcrumb__item--current">
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {!activeCategory && (
        <div className="settings-category-grid">
          {categories.map((category) => (
            <button
              className="settings-category-card"
              key={category.id}
              onClick={() => openCategory(category)}
              type="button"
            >
              {category.icon}
              <span>{category.label}</span>
            </button>
          ))}
        </div>
      )}

      {activeCategory && !activeSub && (
        <div className="settings-subcategory-list">
          {activeCategory.subcategories.map((sub) => (
            <button
              className={`settings-subcategory-btn${sub.variant === "danger" ? " settings-subcategory-btn--danger" : ""}`}
              key={sub.id}
              onClick={() => (sub.onSelect ? sub.onSelect() : onOpenSub(sub.id))}
              type="button"
            >
              <span className="settings-subcategory-btn__label">
                {sub.icon}
                {sub.label}
              </span>
              {!sub.onSelect && <ChevronRight aria-hidden="true" size={18} />}
            </button>
          ))}
        </div>
      )}

      {activeSub && (
        <div className="settings-panel" key={activeSub.id}>
          {activeSub.content}
        </div>
      )}
    </div>
  );
}
