import { useEffect, useState } from "react";
import { todoCategoriesApi } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import type { Id, TodoCategory } from "@shared/types";

const TODO_CATEGORIES_CACHE_KEY = "todo_categories_v1";

// Vuxenvyns egna, personliga kategori-trådar (2026-07-05) — varje medlem har sin
// egen lista, hämtas via x-member-id-headern (se backend/src/routes/todoCategories.ts).
export function useTodoCategoriesState() {
  // Stale-while-revalidate (2026-07-17) — se useTodosState.ts för samma mönster.
  const [categories, setCategories] = useState<TodoCategory[]>(() => readCache(TODO_CATEGORIES_CACHE_KEY, []));

  useEffect(() => {
    todoCategoriesApi.getAll().then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    writeCache(TODO_CATEGORIES_CACHE_KEY, categories);
  }, [categories]);

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
