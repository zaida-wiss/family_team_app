import "./RecipesView.css";
import { useState } from "react";
import { ImagePlus, Loader, Plus, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import { uploadImage } from "../../utils/uploadImage";
import { reportApiError } from "../../api";
import { WordTagInput } from "../calendars/WordTagInput";
import type { Recipe } from "@shared/types";

type Ingredient = { id: string; text: string };
type Step = { id: string; text: string; timed: boolean; minutesInput: string };

export type RecipeFormInput = {
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number | null;
  tags: string[];
  ingredients: { text: string }[];
  steps: { text: string; timedMinutes: number | null }[];
};

type Props = {
  recipe: Recipe | null;
  onSave: (input: RecipeFormInput) => void;
  onDelete?: () => void;
  onClose: () => void;
};

// Recept-skapa/redigera-modal (2026-07-25, ADR-0028) — ingredienser och steg
// är egna, fria rader (samma "en rad i taget"-mönster som delmomentens
// checklista, TodoCreatorModal.tsx). Ett steg kan markeras "tidsstyrt" med
// en varaktighet — det är ENDA sättet timern kopplas till ett steg (inget
// gissande på fritext, se ADR-0028).
export function RecipeFormModal({ recipe, onSave, onDelete, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // Radera nås härifrån, INTE via en separat knapp i visa-vyn (2026-07-26,
  // Zaidas rättelse: "det finns redan en redigera knapp i receptmodalen,
  // där ska det gå att radera" — samma "en enda plats att ändra"-princip
  // som header-pennan redan gav, ingen ny egen redigeringsläge-toggle).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(recipe?.name ?? "");
  const [emoji, setEmoji] = useState(recipe?.emoji ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(recipe?.imageUrl ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl ?? "");
  // Sträng-baserat lokalt state (samma mönster som delmomentens Stjärnor-
  // fält, 2026-07-07) — en kontrollerad `Number(...)`-input tvingar annars
  // fältet till "0" istället för att gå att radera helt medan man skriver.
  const [servingsInput, setServingsInput] = useState(recipe?.servings != null ? String(recipe.servings) : "");
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients.map((i) => ({ id: i.id, text: i.text })) ?? [{ id: generateId(), text: "" }]
  );
  const [steps, setSteps] = useState<Step[]>(
    recipe?.steps.map((s) => ({ id: s.id, text: s.text, timed: s.timedMinutes != null, minutesInput: s.timedMinutes != null ? String(s.timedMinutes) : "" }))
      ?? [{ id: generateId(), text: "", timed: false, minutesInput: "" }]
  );

  const hasName = name.trim().length > 0;
  const hasIngredient = ingredients.some((i) => i.text.trim());
  const hasStep = steps.some((s) => s.text.trim());
  const canSave = hasName && hasIngredient && hasStep;
  // Synlig varning istället för en bara-tyst-grå-knapp (2026-07-26, Zaidas
  // fynd: "det händer inget när jag trycker på spara") — samma "spärra OCH
  // förklara varför"-princip som redan gäller todo-formulärets tom titel/
  // saknat startdatum-spärrar (se CLAUDE.md 2026-07-06). Ett recept importerat
  // via CSV kan sakna ingredienser/steg helt (backend kräver bara namn) —
  // utan denna hint ser Spara-knappen ut att bara inte fungera.
  const saveHint = !hasName
    ? "Namn saknas."
    : !hasIngredient
      ? "Lägg till minst en ingrediens."
      : !hasStep
        ? "Lägg till minst ett steg."
        : null;

  function updateIngredient(id: string, text: string) {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)));
  }
  function addIngredient() {
    setIngredients((prev) => [...prev, { id: generateId(), text: "" }]);
  }
  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleImageUpload(file: File | null) {
    if (!file || uploadingImage) return;
    setUploadingImage(true);
    try {
      setImageUrl(await uploadImage(file, "recipes"));
    } catch {
      reportApiError("Bilden kunde inte laddas upp");
    } finally {
      setUploadingImage(false);
    }
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { id: generateId(), text: "", timed: false, minutesInput: "" }]);
  }
  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function submit() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      emoji: emoji || null,
      imageUrl,
      sourceUrl: sourceUrl.trim() || null,
      servings: servingsInput ? Math.max(1, Math.floor(Number(servingsInput)) || 0) || null : null,
      tags,
      ingredients: ingredients.filter((i) => i.text.trim()).map((i) => ({ text: i.text.trim() })),
      steps: steps.filter((s) => s.text.trim()).map((s) => ({
        text: s.text.trim(),
        timedMinutes: s.timed && s.minutesInput ? Math.max(1, Math.floor(Number(s.minutesInput)) || 0) : null
      }))
    });
  }

  return (
    <div className="recipe-modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="recipe-form-title"
        aria-modal="true"
        className="recipe-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="recipe-modal__header">
          <h3 id="recipe-form-title">{recipe ? "Redigera recept" : "Nytt recept"}</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="todo-emoji-title-row">
          <EmojiPickerPortal symbol={emoji} onSelect={setEmoji} triggerClassName="todo-emoji-btn" />
          <label className="field-label todo-emoji-title-row__title">
            Namn
            <input autoFocus className="text-input" onChange={(e) => setName(e.target.value)} placeholder="Till exempel Köttfärssås" value={name} />
          </label>
        </div>

        <div className="recipe-form__image-row">
          {imageUrl && <img alt="" className="recipe-form__image-preview" src={imageUrl} />}
          <label
            aria-label="Välj bild för receptet"
            className={`icon-button${uploadingImage ? " icon-button--loading" : ""}`}
            title="Välj bild"
          >
            {uploadingImage ? <Loader className="spin" size={16} /> : <ImagePlus size={16} />}
            <input
              accept="image/*"
              disabled={uploadingImage}
              hidden
              onChange={(e) => {
                void handleImageUpload(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              type="file"
            />
          </label>
          {imageUrl && (
            <button aria-label="Ta bort bild" className="icon-button" onClick={() => setImageUrl(null)} title="Ta bort bild" type="button">
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <label className="field-label">
          Länk till receptet
          <input
            className="text-input"
            inputMode="url"
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            type="url"
            value={sourceUrl}
          />
        </label>

        <label className="field-label recipe-form__servings">
          Antal personer
          <input
            className="text-input"
            inputMode="numeric"
            onChange={(e) => setServingsInput(e.target.value.replace(/\D/g, ""))}
            placeholder="Till exempel 4"
            value={servingsInput}
          />
        </label>

        <WordTagInput
          label="Söktaggar"
          onChangeWords={setTags}
          placeholder="Till exempel vardag, snabbt + Enter"
          words={tags}
        />

        <p className="eyebrow">Ingredienser</p>
        <div className="recipe-form__rows">
          {ingredients.map((ing, i) => (
            <div className="recipe-form__row" key={ing.id}>
              <input
                className="text-input"
                onChange={(e) => updateIngredient(ing.id, e.target.value)}
                placeholder="Till exempel 2 dl mjöl"
                value={ing.text}
              />
              <button
                aria-label="Ta bort ingrediens"
                className="icon-button"
                disabled={ingredients.length === 1 && i === 0}
                onClick={() => removeIngredient(ing.id)}
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="secondary-button" onClick={addIngredient} type="button">
          <Plus size={14} /> Lägg till ingrediens
        </button>

        <p className="eyebrow">Steg</p>
        <div className="recipe-form__rows">
          {steps.map((step, i) => (
            <div className="recipe-form__step" key={step.id}>
              <div className="recipe-form__row">
                <span className="recipe-form__step-number">{i + 1}.</span>
                <input
                  className="text-input"
                  onChange={(e) => updateStep(step.id, { text: e.target.value })}
                  placeholder="Till exempel Blanda mjöl och mjölk"
                  value={step.text}
                />
                <button
                  aria-label="Ta bort steg"
                  className="icon-button"
                  disabled={steps.length === 1 && i === 0}
                  onClick={() => removeStep(step.id)}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <label className="recipe-form__timed-toggle">
                <input
                  checked={step.timed}
                  onChange={(e) => updateStep(step.id, { timed: e.target.checked })}
                  type="checkbox"
                />
                Tidsstyrt steg (startar en nedräkning automatiskt när steget bockas av)
              </label>
              {step.timed && (
                <input
                  className="text-input recipe-form__minutes-input"
                  inputMode="numeric"
                  onChange={(e) => updateStep(step.id, { minutesInput: e.target.value.replace(/\D/g, "") })}
                  placeholder="Minuter"
                  value={step.minutesInput}
                />
              )}
            </div>
          ))}
        </div>
        <button className="secondary-button" onClick={addStep} type="button">
          <Plus size={14} /> Lägg till steg
        </button>

        <div className="recipe-form__actions">
          {recipe && onDelete && (
            confirmDelete ? (
              <>
                <button aria-label="Bekräfta radering av receptet" className="icon-button danger" onClick={onDelete} type="button">
                  <Trash2 size={16} />
                </button>
                <button aria-label="Avbryt radering" className="icon-button" onClick={() => setConfirmDelete(false)} type="button">
                  <X size={16} />
                </button>
              </>
            ) : (
              <button aria-label="Radera recept" className="icon-button danger" onClick={() => setConfirmDelete(true)} type="button">
                <Trash2 size={16} />
              </button>
            )
          )}
          <button className="secondary-button" onClick={onClose} type="button">Avbryt</button>
          <button className="primary-button" disabled={!canSave} onClick={submit} type="button">
            {recipe ? "Spara" : "Skapa recept"}
          </button>
        </div>
        {saveHint && <p className="field-hint">{saveHint}</p>}
      </div>
    </div>
  );
}
