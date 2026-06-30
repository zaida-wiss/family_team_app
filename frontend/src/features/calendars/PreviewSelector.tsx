import styles from "./CalendarPanel.module.css";
import type { ImportedCalendarEvent } from "./calendarIcs";
import { buildCategoryGroups, buildKeywordGroups } from "./calendarPanelHelpers";

type Props = {
  events: ImportedCalendarEvent[];
  selectedIds: Set<string>;
  onChangeSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onConfirm: () => void;
};

export function PreviewSelector({ events, selectedIds, onChangeSelected, onConfirm }: Props) {
  if (events.length === 0) {
    return <p className="empty-note">Inga händelser i valt datumintervall.</p>;
  }

  const groups = buildCategoryGroups(events);
  const keywords = buildKeywordGroups(events);

  function toggleGroup(indices: number[]) {
    const allSelected = indices.every((i) => selectedIds.has(String(i)));
    onChangeSelected((prev) => {
      const next = new Set(prev);
      for (const i of indices) {
        if (allSelected) next.delete(String(i)); else next.add(String(i));
      }
      return next;
    });
  }

  function toggleAll() {
    const allSelected = selectedIds.size === events.length;
    onChangeSelected(allSelected ? new Set() : new Set(events.map((_, i) => String(i))));
  }

  function renderChip(label: string, indices: number[], modifier?: string) {
    const selectedCount = indices.filter((i) => selectedIds.has(String(i))).length;
    const allOn = selectedCount === indices.length;
    const someOn = selectedCount > 0 && !allOn;
    const cls = [styles.categoryButton, allOn && styles.categoryButtonOn, someOn && styles.categoryButtonPartial, modifier]
      .filter(Boolean).join(" ");
    return (
      <button key={label} className={cls} onClick={() => toggleGroup(indices)} type="button">
        <span className={styles.categoryName}>{label}</span>
        <span className={styles.categoryCount}>{selectedCount}/{indices.length}</span>
      </button>
    );
  }

  return (
    <div className={styles.preview}>
      <div className={styles.previewHeader}>
        <span className={styles.previewCount}>{selectedIds.size} av {events.length} händelser valda</span>
        <button className={styles.bulkButton} onClick={toggleAll} type="button">
          {selectedIds.size === events.length ? "Ingen" : "Alla"}
        </button>
      </div>
      <div className={styles.categoryGrid}>
        {[...groups.entries()].map(([cat, idx]) =>
          renderChip(cat, idx, cat === "Stängningsdag" ? styles.categoryButtonSpecial : undefined)
        )}
      </div>
      {keywords.size > 0 && (
        <>
          <p className={styles.keywordLabel}>Nyckelord</p>
          <div className={styles.keywordRow}>
            {[...keywords.entries()].map(([word, idx]) => renderChip(word, idx))}
          </div>
        </>
      )}
      <button
        className="primary-button"
        disabled={selectedIds.size === 0}
        onClick={onConfirm}
        type="button"
      >
        Importera {selectedIds.size} händelser
      </button>
    </div>
  );
}
