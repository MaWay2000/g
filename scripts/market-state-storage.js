import { PERIODIC_ELEMENTS } from "./data/periodic-elements.js";

const MARKET_STORAGE_KEY = "dustyNova.market";

const CATEGORY_PRICE_PREMIUMS = Object.freeze({
  "alkali metal": 6,
  "alkaline earth metal": 10,
  "transition metal": 18,
  "post-transition metal": 14,
  metalloid: 16,
  nonmetal: 8,
  halogen: 12,
  "noble gas": 20,
  lanthanide: 28,
  actinide: 32,
});

const CATEGORY_STOCK_OFFSETS = Object.freeze({
  "alkali metal": 4,
  "alkaline earth metal": 3,
  "transition metal": 0,
  "post-transition metal": -2,
  metalloid: -4,
  nonmetal: 6,
  halogen: -5,
  "noble gas": -8,
  lanthanide: -12,
  actinide: -14,
});

const normalizeCategoryKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const formatCategoryLabel = (value) => {
  const normalized = normalizeCategoryKey(value);
  if (!normalized) {
    return "Element";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
};

const buildElementMarketSummary = (element) => {
  const category = formatCategoryLabel(element?.category);
  const atomicNumber = Number.isFinite(element?.number) ? Math.round(element.number) : null;
  if (atomicNumber !== null) {
    return `Atomic #${atomicNumber} • ${category}`;
  }

  return category;
};

const computeDefaultElementPrice = (element) => {
  const atomicNumber = Number.isFinite(element?.number)
    ? Math.max(1, Math.round(element.number))
    : 1;
  const atomicMass = Number.isFinite(element?.atomicMass)
    ? Math.max(1, element.atomicMass)
    : atomicNumber * 2;
  const categoryPremium =
    CATEGORY_PRICE_PREMIUMS[normalizeCategoryKey(element?.category)] ?? 0;

  return Math.max(5, Math.round(6 + atomicNumber * 3 + atomicMass / 12 + categoryPremium));
};

const computeDefaultElementStock = (element) => {
  const atomicNumber = Number.isFinite(element?.number)
    ? Math.max(1, Math.round(element.number))
    : 1;
  const stockOffset = CATEGORY_STOCK_OFFSETS[normalizeCategoryKey(element?.category)] ?? 0;
  const stock = 42 - Math.floor(atomicNumber / 3) + stockOffset;
  return Math.max(2, Math.min(48, stock));
};

const isTradeableElement = (element) => {
  const symbol = typeof element?.symbol === "string" ? element.symbol.trim() : "";
  const name = typeof element?.name === "string" ? element.name.trim() : "";
  return symbol !== "" && name !== "";
};

const createDefaultMarketItem = (element) => ({
  id: element.symbol.trim().toLowerCase(),
  symbol: element.symbol.trim(),
  name: element.name.trim(),
  number: Number.isFinite(element?.number) ? Math.round(element.number) : null,
  category: typeof element?.category === "string" ? element.category.trim() : "",
  atomicMass:
    Number.isFinite(element?.atomicMass) && element.atomicMass > 0
      ? element.atomicMass
      : null,
  summary: buildElementMarketSummary(element),
  price: computeDefaultElementPrice(element),
  stock: computeDefaultElementStock(element),
});

const DEFAULT_MARKET_ITEMS = Object.freeze(
  PERIODIC_ELEMENTS.filter(isTradeableElement)
    .slice()
    .sort((left, right) => {
      const leftNumber = Number.isFinite(left?.number) ? left.number : Number.MAX_SAFE_INTEGER;
      const rightNumber = Number.isFinite(right?.number)
        ? right.number
        : Number.MAX_SAFE_INTEGER;
      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
      return String(left?.symbol ?? "").localeCompare(String(right?.symbol ?? ""));
    })
    .map((element) => createDefaultMarketItem(element))
);

const getMarketStorage = (() => {
  let resolved = false;
  let storage = null;

  return () => {
    if (resolved) {
      return storage;
    }

    resolved = true;

    if (typeof window === "undefined") {
      return null;
    }

    try {
      storage = window.localStorage;
      const probeKey = `${MARKET_STORAGE_KEY}.probe`;
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);
    } catch (error) {
      console.warn("Unable to access market storage", error);
      storage = null;
    }

    return storage;
  };
})();

const normalizeMarketItem = (item, fallback) => {
  const normalized = { ...(fallback ?? {}) };
  const symbol =
    typeof item?.symbol === "string"
      ? item.symbol.trim()
      : typeof fallback?.symbol === "string"
        ? fallback.symbol.trim()
        : "";
  const id =
    typeof item?.id === "string" && item.id.trim() !== ""
      ? item.id.trim().toLowerCase()
      : symbol
        ? symbol.toLowerCase()
        : "";

  if (!id) {
    return fallback ?? null;
  }

  normalized.id = id;
  normalized.symbol = symbol || fallback?.symbol || id.toUpperCase();
  normalized.name =
    typeof item?.name === "string" && item.name.trim() !== ""
      ? item.name.trim()
      : fallback?.name ?? normalized.symbol;
  normalized.category =
    typeof item?.category === "string" && item.category.trim() !== ""
      ? item.category.trim()
      : fallback?.category ?? "";
  normalized.summary =
    typeof item?.summary === "string" && item.summary.trim() !== ""
      ? item.summary.trim()
      : fallback?.summary ?? buildElementMarketSummary(normalized);

  const number = Number.isFinite(item?.number) ? Math.round(item.number) : null;
  normalized.number = number ?? fallback?.number ?? null;

  const atomicMass =
    Number.isFinite(item?.atomicMass) && item.atomicMass > 0 ? item.atomicMass : null;
  normalized.atomicMass = atomicMass ?? fallback?.atomicMass ?? null;

  const price = Number.isFinite(item?.price) ? Math.max(1, Math.round(item.price)) : null;
  normalized.price = price ?? fallback?.price ?? computeDefaultElementPrice(normalized);

  const stock = Number.isFinite(item?.stock) ? Math.max(0, Math.round(item.stock)) : null;
  normalized.stock = stock ?? fallback?.stock ?? computeDefaultElementStock(normalized);

  return normalized;
};

const getDefaultMarketState = () => ({
  items: DEFAULT_MARKET_ITEMS.map((item) => normalizeMarketItem(item, item)),
});

const sanitizeMarketState = (state) => {
  const defaultState = getDefaultMarketState();
  if (!state || !Array.isArray(state.items)) {
    return defaultState;
  }

  const normalizedItems = defaultState.items.map((defaultItem) => {
    const storedItem = state.items.find((item) => {
      const itemId = typeof item?.id === "string" ? item.id.trim().toLowerCase() : "";
      return itemId === defaultItem.id;
    });

    return normalizeMarketItem(storedItem, defaultItem) ?? defaultItem;
  });

  return { items: normalizedItems };
};

export const loadMarketState = () => {
  const storage = getMarketStorage();

  if (!storage) {
    return getDefaultMarketState();
  }

  try {
    const storedValue = storage.getItem(MARKET_STORAGE_KEY);
    if (!storedValue) {
      return getDefaultMarketState();
    }

    const parsed = JSON.parse(storedValue);
    return sanitizeMarketState(parsed);
  } catch (error) {
    console.warn("Unable to read stored market state", error);
  }

  return getDefaultMarketState();
};

export const persistMarketState = (state) => {
  const storage = getMarketStorage();

  if (!storage) {
    return false;
  }

  try {
    const normalizedState = sanitizeMarketState(state);
    storage.setItem(MARKET_STORAGE_KEY, JSON.stringify(normalizedState));
    return true;
  } catch (error) {
    console.warn("Unable to persist market state", error);
  }

  return false;
};

export { getDefaultMarketState };
