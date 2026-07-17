import { useCallback, useEffect, useRef, useState } from "react";
import { rewardShopApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import { readCache, writeCache } from "../../utils/localCache";
import type { PurchasedReward, RewardShopItem } from "@shared/types";

export type { PurchasedReward };

const REWARD_SHOP_ITEMS_CACHE_KEY = "reward_shop_items_v1";

export function useRewardShopState() {
  // Stale-while-revalidate (2026-07-17) — bara katalogen (items) cachas, inte
  // den paginerade köphistoriken (för invecklat för en enkel cache, lägre
  // värde offline än att kunna BLÄDDRA butiken).
  const [items, setItems] = useState<RewardShopItem[]>(() => readCache(REWARD_SHOP_ITEMS_CACHE_KEY, []));
  const [requireApprovalForCategories, setRequireApprovalForCategories] = useState(false);

  // Infinite-scroll-lista över uthämtade belöningar: sidor läggs till i slutet, ersätter inte varandra
  const [purchasedItems, setPurchasedItems] = useState<PurchasedReward[]>([]);
  const [purchasedTotal, setPurchasedTotal] = useState<number | null>(null);
  const [purchasedLoading, setPurchasedLoading] = useState(false);
  const [purchasedPageNum, setPurchasedPageNum] = useState(1);
  // Ökas vid köp/flytt/borttag så både belöningsbutikens lista och barnets tidslinje vet att hämta om
  const [purchaseVersion, setPurchaseVersion] = useState(0);
  const lastPurchaseVersionRef = useRef(purchaseVersion);

  const refreshShop = useCallback(() => {
    return rewardShopApi.getShop().then(({ items: shopItems, requireApprovalForCategories: raf }) => {
      setItems(shopItems);
      writeCache(REWARD_SHOP_ITEMS_CACHE_KEY, shopItems);
      setRequireApprovalForCategories(raf);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    refreshShop();
  }, [refreshShop]);

  // Realtidssynk mellan enheter: ett köp/flytt/borttag ELLER en katalogändring (ny/redigerad/
  // borttagen vara, ändrade inställningar) på en annan enhet ska synas här utan att man själv
  // behöver trigga en omhämtning (samma SSE-mönster som todos). Ett enda händelsenamn täcker
  // båda — katalogändringar är sällsynta nog att en extra getShop()-hämtning är billig.
  useEffect(() => {
    return rewardShopApi.subscribeToChanges(() => {
      setPurchaseVersion((v) => v + 1);
      refreshShop();
    });
  }, [refreshShop]);

  useEffect(() => {
    let cancelled = false;
    // En köp/flytt/borttag-mutation gör listan inaktuell — börja om från sida 1 oavsett hur långt ner man skrollat
    const versionChanged = lastPurchaseVersionRef.current !== purchaseVersion;
    lastPurchaseVersionRef.current = purchaseVersion;
    const pageToFetch = versionChanged ? 1 : purchasedPageNum;

    setPurchasedLoading(true);
    rewardShopApi.getPurchasedPage(pageToFetch).then((res) => {
      if (cancelled) return;
      // Defensiv fallback mot oväntad svarsform (t.ex. tillfällig frontend/backend-versionsskillnad
      // under en deploy) — undefined ska aldrig kunna hamna i state och krascha renderingen.
      const newItems = res.items ?? [];
      setPurchasedItems((prev) => (pageToFetch === 1 ? newItems : [...prev, ...newItems]));
      setPurchasedTotal(res.total ?? 0);
      if (versionChanged) setPurchasedPageNum(1);
    }).catch(console.error).finally(() => {
      if (!cancelled) setPurchasedLoading(false);
    });

    return () => { cancelled = true; };
  }, [purchasedPageNum, purchaseVersion]);

  // Stabil referens krävs: PurchasedList skapar om sin IntersectionObserver när onLoadMore
  // byter identitet, och observern triggar direkt om sentinel redan är synlig — utan useCallback
  // skulle varje orelaterad omrendering av appskalet ge en självförstärkande hämtningsloop.
  const loadMorePurchased = useCallback(() => {
    setPurchasedPageNum((p) => p + 1);
  }, []);

  async function addItem(item: RewardShopItem) {
    await rewardShopApi.addItem(item);
    setItems((prev) => [...prev, item]);
  }

  async function updateSettings(patch: { requireApprovalForCategories?: boolean }) {
    await rewardShopApi.updateSettings(patch);
    if (patch.requireApprovalForCategories !== undefined) setRequireApprovalForCategories(patch.requireApprovalForCategories);
  }

  async function updateItem(itemId: string, patch: Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes">>) {
    await rewardShopApi.updateItem(itemId, patch);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, ...patch } : i));
  }

  async function removeItem(itemId: string) {
    await rewardShopApi.removeItem(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function purchase(item: RewardShopItem, forMemberId: string) {
    await rewardShopApi.purchase(item.id, forMemberId);
    trackEvent("reward-redeemed");
    setPurchaseVersion((v) => v + 1);
  }

  async function movePurchased(id: string, startsAt: string) {
    await rewardShopApi.movePurchased(id, startsAt);
    setPurchaseVersion((v) => v + 1);
  }

  async function deletePurchased(id: string) {
    await rewardShopApi.deletePurchased(id);
    setPurchaseVersion((v) => v + 1);
  }

  return {
    items,
    requireApprovalForCategories,
    purchasedItems,
    purchasedTotal,
    purchasedLoading,
    loadMorePurchased,
    purchaseVersion,
    addItem,
    updateItem,
    updateSettings,
    removeItem,
    purchase,
    movePurchased,
    deletePurchased,
  };
}
