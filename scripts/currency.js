const CURRENCY_STORAGE_KEY = "dustyNova.currency";
const DEFAULT_BALANCE = 0;

const getCurrencyStorage = (() => {
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
      const probeKey = `${CURRENCY_STORAGE_KEY}.probe`;
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);
    } catch (error) {
      console.warn("Unable to access currency storage", error);
      storage = null;
    }

    return storage;
  };
})();

const parseStoredBalance = (value) => {
  if (typeof value !== "string") {
    return DEFAULT_BALANCE;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_BALANCE;
};

let currencyBalance = DEFAULT_BALANCE;
let currencyStorageAvailable = false;
const currencyListeners = new Set();

const notifyCurrencyListeners = (detail) => {
  currencyListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.warn("Currency listener failed", error);
    }
  });
};

const persistCurrencyBalance = () => {
  if (!currencyStorageAvailable) {
    return;
  }

  const storage = getCurrencyStorage();

  if (!storage) {
    currencyStorageAvailable = false;
    return;
  }

  try {
    storage.setItem(CURRENCY_STORAGE_KEY, String(currencyBalance));
  } catch (error) {
    console.warn("Unable to persist currency", error);
    currencyStorageAvailable = false;
  }
};

const initializeCurrencyBalance = () => {
  const storage = getCurrencyStorage();

  if (!storage) {
    currencyBalance = DEFAULT_BALANCE;
    currencyStorageAvailable = false;
    return;
  }

  try {
    const storedBalance = storage.getItem(CURRENCY_STORAGE_KEY);
    currencyBalance = parseStoredBalance(storedBalance);
    currencyStorageAvailable = true;
  } catch (error) {
    console.warn("Unable to read stored currency", error);
    currencyBalance = DEFAULT_BALANCE;
    currencyStorageAvailable = false;
  }
};

initializeCurrencyBalance();

export const isCurrencyStorageAvailable = () => currencyStorageAvailable;

export const getCurrencyBalance = () => currencyBalance;

export const setCurrencyBalance = (balance) => {
  const normalized = Number.isFinite(balance) ? Math.max(0, Math.round(balance)) : DEFAULT_BALANCE;
  const previous = currencyBalance;

  if (previous === normalized) {
    persistCurrencyBalance();
    return currencyBalance;
  }

  currencyBalance = normalized;
  persistCurrencyBalance();
  notifyCurrencyListeners({ balance: currencyBalance, delta: currencyBalance - previous });

  return currencyBalance;
};

export const addMarsMoney = (amount = 0) => {
  const delta = Number.isFinite(amount) ? Math.round(amount) : 0;

  if (delta === 0) {
    return currencyBalance;
  }

  return setCurrencyBalance(currencyBalance + delta);
};

export const resetCurrency = () => setCurrencyBalance(DEFAULT_BALANCE);

export const subscribeToCurrency = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  currencyListeners.add(listener);
  return () => currencyListeners.delete(listener);
};
