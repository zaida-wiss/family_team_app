import { useEffect, useState } from "react";
import { todoCategoriesApi } from "../../api";
import type { Id, TodoCategory } from "@shared/types";

// Vuxenvyns egna, personliga kategori-trådar (2026-07-05) — varje medlem har sin
// egen lista, hämtas via x-member-id-headern (se backend/src/routes/todoCategories.ts).
export function useTodoCategoriesState() {
  const [categories, setCategories] = useState<TodoCategory[]>([]);

  useEffect(() => {
    todoCategoriesApi.getAll().then(setCategories).catch(console.error);
  }, []);

  function createCategory(name: string) {
    return todoCategoriesApi.create(name).then((category) => {
      setCategories((current) => [...current, category]);
      return category;
    });
  }

  function renameCategory(id: Id, name: string) {
    todoCategoriesApi.rename(id, name).catch(console.error);
    setCategories((current) => current.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function removeCategory(id: Id) {
    todoCategoriesApi.remove(id).catch(console.error);
    setCategories((current) => current.filter((c) => c.id !== id));
  }

  function setCategoryHidden(id: Id, hidden: boolean) {
    todoCategoriesApi.setHidden(id, hidden).catch(console.error);
    setCategories((current) => current.map((c) => (c.id === id ? { ...c, hidden } : c)));
  }

  return { categories, createCategory, renameCategory, removeCategory, setCategoryHidden };
}
