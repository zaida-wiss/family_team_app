import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Globe, Pencil, RefreshCw, X } from "lucide-react";
import type { Calendar, Id, IcsSubscription } from "@shared/types";
import { EmojiPickerSv } from "../../components/EmojiPickerSv";
import styles from "./CalendarPanel.module.css";
import { WordTagInput } from "./WordTagInput";

type Props = {
  selectedCalendar: Calendar;
  canImportToSelected: boolean;
  onAddSubscription: (calendarId: Id, sub: Omit<IcsSubscription, "id" | "calendarId" | "lastSyncedAt">) => void;
  onUpdateSubscription: (calendarId: Id, subId: Id, patch: Partial<Pick<IcsSubscription, "includeWords" | "excludeWords" | "displaySymbol">>) => Promise<void>;
  onRemoveSubscription: (calendarId: Id, subId: Id) => void;
  onSyncSubscription: (calendarId: Id, subId: Id) => Promise<void>;
};

export function CalendarSubscriptionsSection({
  selectedCalendar,
  canImportToSelected,
  onAddSubscription,
  onUpdateSubscription,
  onRemoveSubscription,
  onSyncSubscription,
}: Props) {
  const [newSubUrl, setNewSubUrl] = useState("");
  const [newSubIncludeWords, setNewSubIncludeWords] = useState<string[]>([]);
  const [newSubExcludeWords, setNewSubExcludeWords] = useState<string[]>([]);
  const [addingSub, setAddingSub] = useState(false);
  const [syncingSubId, setSyncingSubId] = useState<string | null>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editIncludeWords, setEditIncludeWords] = useState<string[]>([]);
  const [editExcludeWords, setEditExcludeWords] = useState<string[]>([]);
  const [editDisplaySymbol, setEditDisplaySymbol] = useState("");
  const [symbolPickerSubId, setSymbolPickerSubId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);
  const symbolPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!symbolPickerSubId) return;
    function handler(e: MouseEvent) {
      if (symbolPickerRef.current && !symbolPickerRef.current.contains(e.target as Node)) {
        setSymbolPickerSubId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [symbolPickerSubId]);

  async function addSubscription() {
    const url = newSubUrl.trim();
    if (!url || !canImportToSelected) return;
    setAddingSub(true);
    try {
      await onAddSubscription(selectedCalendar.id, {
        url,
        includeWords: newSubIncludeWords,
        excludeWords: newSubExcludeWords,
        dateFrom: null,
        dateTo: null,
        displaySymbol: null,
      });
      setNewSubUrl("");
      setNewSubIncludeWords([]);
      setNewSubExcludeWords([]);
    } finally {
      setAddingSub(false);
    }
  }

  async function syncSub(subId: string) {
    setSyncingSubId(subId);
    try {
      await onSyncSubscription(selectedCalendar.id, subId);
    } finally {
      setSyncingSubId(null);
    }
  }

  async function saveSubEdit(sub: IcsSubscription) {
    await onUpdateSubscription(selectedCalendar.id, sub.id, {
      includeWords: editIncludeWords,
      excludeWords: editExcludeWords,
      displaySymbol: editDisplaySymbol.trim() || null,
    });
    setEditingSubId(null);
    await syncSub(sub.id);
  }

  return (
    <div className={styles.importBlock}>
      <p className="eyebrow">Prenumerationer</p>

      <div className={styles.subForm}>
        <input
          className="text-input"
          onChange={(e) => setNewSubUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void addSubscription(); }}
          placeholder="iCal-länk (https://…)"
          value={newSubUrl}
        />
        <WordTagInput
          label="Inkludera händelser med ord"
          placeholder="Skriv ord + Enter"
          words={newSubIncludeWords}
          onChangeWords={setNewSubIncludeWords}
        />
        <WordTagInput
          label="Exkludera händelser med ord"
          placeholder="Skriv ord + Enter"
          words={newSubExcludeWords}
          onChangeWords={setNewSubExcludeWords}
        />
        <button
          className={`secondary-button ${styles.fullButton}`}
          disabled={!newSubUrl.trim() || addingSub}
          onClick={() => void addSubscription()}
          type="button"
        >
          <Globe size={16} />
          {addingSub ? "Lägger till…" : "Lägg till prenumeration"}
        </button>
      </div>

      {(selectedCalendar.subscriptions ?? []).length > 0 && (
        <div className={styles.subList}>
          {(selectedCalendar.subscriptions ?? []).map((sub) => (
            <div className={styles.subRow} key={sub.id}>
              {editingSubId === sub.id ? (
                <div className={styles.subEdit}>
                  <WordTagInput
                    label="Inkludera händelser med ord"
                    placeholder="Skriv ord + Enter"
                    words={editIncludeWords}
                    onChangeWords={setEditIncludeWords}
                  />
                  <WordTagInput
                    label="Exkludera händelser med ord"
                    placeholder="Skriv ord + Enter"
                    words={editExcludeWords}
                    onChangeWords={setEditExcludeWords}
                  />
                  <div className={styles.subEditActions}>
                    <button
                      className="secondary-button"
                      onClick={() => void saveSubEdit(sub as IcsSubscription)}
                      type="button"
                    >
                      <RefreshCw size={13} />
                      Spara &amp; synka
                    </button>
                    <button
                      aria-label="Avbryt redigering"
                      className="icon-button"
                      onClick={() => setEditingSubId(null)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.subSymbolWrap}>
                    <button
                      className={styles.subSymbolButton}
                      onClick={(e) => {
                        if (symbolPickerSubId === sub.id) {
                          setSymbolPickerSubId(null);
                        } else {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setPickerPos({ top: rect.bottom + 6, left: rect.left });
                          setSymbolPickerSubId(sub.id);
                        }
                      }}
                      title="Välj symbol"
                      type="button"
                    >
                      {sub.displaySymbol ?? "＋"}
                    </button>
                  </div>
                  {symbolPickerSubId === sub.id && createPortal(
                    <div
                      className={styles.subSymbolPicker}
                      ref={symbolPickerRef}
                      style={{ top: pickerPos.top, left: pickerPos.left }}
                    >
                      <EmojiPickerSv
                        onSelect={(emoji) => {
                          void onUpdateSubscription(selectedCalendar.id, sub.id, { displaySymbol: emoji });
                          setSymbolPickerSubId(null);
                        }}
                      />
                    </div>,
                    document.body
                  )}
                  <div className={styles.subInfo}>
                    <span className={styles.subUrl} title={sub.url}>
                      {sub.url.replace(/^https?:\/\//, "").slice(0, 48)}…
                    </span>
                    {sub.includeWords.length > 0 && (
                      <small>Inkludera: {sub.includeWords.join(", ")}</small>
                    )}
                    {sub.excludeWords.length > 0 && (
                      <small>Exkludera: {sub.excludeWords.join(", ")}</small>
                    )}
                    {sub.lastSyncedAt && (
                      <small>Senast synkad: {new Date(sub.lastSyncedAt).toLocaleString("sv-SE")}</small>
                    )}
                  </div>
                  <div className={styles.subActions}>
                    <button
                      aria-label="Redigera filtreringsord"
                      className="icon-button"
                      onClick={() => {
                        setEditingSubId(sub.id);
                        setEditIncludeWords([...sub.includeWords]);
                        setEditExcludeWords([...sub.excludeWords]);
                        setEditDisplaySymbol(sub.displaySymbol ?? "");
                      }}
                      title="Redigera ord"
                      type="button"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label="Kopiera prenumerations-URL"
                      className="icon-button"
                      onClick={() => void navigator.clipboard.writeText(sub.url)}
                      title={sub.url}
                      type="button"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label="Synka prenumeration nu"
                      className="icon-button"
                      disabled={syncingSubId === sub.id}
                      onClick={() => void syncSub(sub.id)}
                      title="Synka nu"
                      type="button"
                    >
                      <RefreshCw size={14} className={syncingSubId === sub.id ? "spin" : undefined} />
                    </button>
                    {confirmDeleteSubId === sub.id ? (
                      <>
                        <button
                          className={`secondary-button ${styles.confirmDelete}`}
                          onClick={() => {
                            onRemoveSubscription(selectedCalendar.id, sub.id);
                            setConfirmDeleteSubId(null);
                          }}
                          type="button"
                        >
                          Radera
                        </button>
                        <button
                          aria-label="Avbryt radering"
                          className="icon-button"
                          onClick={() => setConfirmDeleteSubId(null)}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        aria-label="Ta bort prenumeration"
                        className="icon-button danger"
                        onClick={() => setConfirmDeleteSubId(sub.id)}
                        title="Ta bort prenumeration"
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
