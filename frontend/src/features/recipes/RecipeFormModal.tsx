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
  tags: string[];
  ingredients: { text: string }[];
  steps: { text: string; timedMinutes: number | null }[];
};

type Props = {
  recipe: Recipe | null;
  onSave: (input: RecipeFormInput) => void;
  onClose: () => void;
};

// Recept-skapa/redigera-modal (2026-07-25, ADR-0028) — ingredienser och steg
// är egna, fria rader (samma "en rad i taget"-mönster som delmomentens
// checklista, TodoCreatorModal.tsx). Ett steg kan markeras "tidsstyrt" med
// en varaktighet — det är ENDA sättet timern kopplas till ett steg (inget
// gissande på fritext, se ADR-0028).
export function RecipeFormModal({ recipe, onSave, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [name, setName] = useState(recipe?.name ?? "");
  const [emoji, setEmoji] = useState(recipe?.emoji ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(recipe?.imageUrl ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl ?? "");
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients.map((i) => ({ id: i.id, text: i.text })) ?? [{ id: generateId(), text: "" }]
  );
  const [steps, setSteps] = useState<Step[]>(
    recipe?.steps.map((s) => ({ id: s.id, text: s.text, timed: s.timedMinutes != null, minutesInput: s.timedMinutes != null ? String(s.timedMinutes) : "" }))
      ?? [{ id: generateId(), text: "", timed: false, minutesInput: "" }]
  );

  const canSave = name.trim().length > 0 && ingredients.some((i) => i.text.trim()) && steps.some((s) => s.text.trim());

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
        className="recipe-modal recipe-form-modal"
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
          <button className="secondary-button" onClick={onClose} type="button">Avbryt</button>
          <button className="primary-button" disabled={!canSave} onClick={submit} type="button">
            {recipe ? "Spara" : "Skapa recept"}
          </button>
        </div>
      </div>
    </div>
  );
}
