const MARKET_STORAGE_KEY = "dustyNova.market";

const DEFAULT_MARKET_ITEMS = [
  {
    id: "water-ice",
    name: "Water Ice Contracts",
    price: 125,
    stock: 18,
    accent: "💧",
    summary: "Hydration caches from polar harvesters.",
  },
  {
    id: "ferrocrete",
    name: "Ferrocrete Mix",
    price: 210,
    stock: 10,
    accent: "🧱",
    summary: "Prefabricated regolith binder for builds.",
  },
  {
    id: "reactor-cells",
    name: "Micro Reactor Cells",
    price: 460,
    stock: 6,
    accent: "⚡",
    summary: "Sealed units for remote drone beacons.",
  },
  {
    id: "survey-data",
    name: "Survey Data Packets",
    price: 95,
    stock: 24,
    accent: "📡",
    summary: "Encrypted scans of nearby mineral veins.",
  },
];

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
  const id = typeof item?.id === "string" ? item.id.trim() : "";

  if (!id) {
    return fallback ?? null;
  }

  normalized.id = id;
  normalized.name = typeof item?.name === "string" && item.name.trim() !== ""
    ? item.name.trim()
    : fallback?.name ?? id;
  normalized.accent = typeof item?.accent === "string" && item.accent.trim() !== ""
    ? item.accent.trim()
    : fallback?.accent ?? "";
  normalized.summary = typeof item?.summary === "string" && item.summary.trim() !== ""
    ? item.summary.trim()
    : fallback?.summary ?? "";

  const price = Number.isFinite(item?.price) ? Math.max(1, Math.round(item.price)) : null;
  normalized.price = price ?? fallback?.price ?? 1;

  const stock = Number.isFinite(item?.stock) ? Math.max(0, Math.round(item.stock)) : null;
  normalized.stock = stock ?? fallback?.stock ?? 0;

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

  const normalizedItems = state.items
    .map((item, index) => normalizeMarketItem(item, defaultState.items[index]))
    .filter(Boolean);

  if (normalizedItems.length === 0) {
    return defaultState;
  }

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
