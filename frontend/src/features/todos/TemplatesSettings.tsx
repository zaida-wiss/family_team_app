import "./TemplatesSettings.css";
import { Trash2 } from "lucide-react";
import type { Id, TodoCategoryTemplate, TodoTemplate } from "@shared/types";

type Props = {
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onRemoveTaskTemplate: (id: Id) => void;
  onRemoveCategoryTemplate: (id: Id) => void;
};

// Mallbibliotek (2026-07-08, Zaidas önskemål: "jag vill spara både
// återkommande uppgifter och hela kategorier som mall för fler tillfällen då
// jag får en kopia") — mallar SKAPAS från Spara som mall-knapparna (kategori-
// menyn/redigera-uppgift-modalen) och HÄMTAS när man skapar en ny uppgift/
// kategori (Ny uppgift-modalen). Den här sektionen är bara för att se
// överblicken och kunna städa bort mallar man inte längre vill ha kvar.
export function TemplatesSettings({
  taskTemplates,
  categoryTemplates,
  onRemoveTaskTemplate,
  onRemoveCategoryTemplate
}: Props) {
  if (taskTemplates.length === 0 && categoryTemplates.length === 0) {
    return <p className="empty-note">Inga sparade mallar än. Spara en uppgift eller en hel kategori som mall för att se den här.</p>;
  }

  return (
    <div className="templates-settings">
      {categoryTemplates.length > 0 && (
        <div className="templates-settings__group">
          <h4 className="templates-settings__heading">Kategori-mallar</h4>
          <ul className="templates-settings__list">
            {categoryTemplates.map((template) => (
              <li className="templates-settings__row" key={template.id}>
                <span>
                  {template.name} <small>({template.tasks.length} uppgifter)</small>
                </span>
                <button
                  aria-label={`Ta bort mallen ${template.name}`}
                  className="icon-button danger"
                  onClick={() => onRemoveCategoryTemplate(template.id)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {taskTemplates.length > 0 && (
        <div className="templates-settings__group">
          <h4 className="templates-settings__heading">Uppgiftsmallar</h4>
          <ul className="templates-settings__list">
            {taskTemplates.map((template) => (
              <li className="templates-settings__row" key={template.id}>
                <span>{template.title}</span>
                <button
                  aria-label={`Ta bort mallen ${template.title}`}
                  className="icon-button danger"
                  onClick={() => onRemoveTaskTemplate(template.id)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
