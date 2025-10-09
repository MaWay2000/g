const DEFAULT_LOGOUT_ENDPOINT = "/api/logout";
const AUTH_TOKEN_KEYS = [
  "dustyNova.authToken",
  "dustyNova.accessToken",
  "authToken",
  "accessToken",
  "token",
];
const CSRF_TOKEN_KEYS = [
  "dustyNova.csrfToken",
  "csrfToken",
  "X-CSRF-Token",
];

const safeStorageRead = (storage, key) => {
  if (!storage || typeof storage.getItem !== "function") {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn(`Unable to read key "${key}" from storage`, error);
    return null;
  }
};

const safeStorageRemove = (storage, key) => {
  if (!storage || typeof storage.removeItem !== "function") {
    return;
  }

  try {
    storage.removeItem(key);
  } catch (error) {
    console.warn(`Unable to remove key "${key}" from storage`, error);
  }
};

const safeStorageClear = (storage) => {
  if (!storage || typeof storage.clear !== "function") {
    return;
  }

  try {
    storage.clear();
  } catch (error) {
    console.warn("Unable to clear storage", error);
  }
};

const getStorageCandidates = () => {
  if (typeof window === "undefined") {
    return [];
  }

  return [window.localStorage, window.sessionStorage];
};

const readFromStorages = (keys) => {
  const storageCandidates = getStorageCandidates();

  for (const key of keys) {
    for (const storage of storageCandidates) {
      const value = safeStorageRead(storage, key);
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const clearStoredKeys = (keys) => {
  const storageCandidates = getStorageCandidates();

  for (const key of keys) {
    for (const storage of storageCandidates) {
      safeStorageRemove(storage, key);
    }
  }
};

const getMetaContent = (name) => {
  if (typeof document === "undefined") {
    return null;
  }

  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute("content") || null;
};

const getStoredAuthToken = () => readFromStorages(AUTH_TOKEN_KEYS);

const getStoredCsrfToken = () => {
  const storedToken = readFromStorages(CSRF_TOKEN_KEYS);
  if (storedToken) {
    return storedToken;
  }

  return (
    getMetaContent("csrf-token") ||
    getMetaContent("csrfToken") ||
    getMetaContent("x-csrf-token")
  );
};

export const clearStoredSession = () => {
  clearStoredKeys(AUTH_TOKEN_KEYS);
  clearStoredKeys(CSRF_TOKEN_KEYS);
  const storageCandidates = getStorageCandidates();
  for (const storage of storageCandidates) {
    safeStorageClear(storage);
  }
};

const parseErrorMessage = async (response) => {
  const defaultMessage = "Unable to log out. Please try again.";

  try {
    const data = await response.clone().json();
    if (typeof data === "string") {
      return data;
    }

    if (data && typeof data === "object") {
      return (
        data.message ||
        data.error ||
        data.detail ||
        defaultMessage
      );
    }
  } catch (error) {
    // JSON parsing failed; fall back to text.
  }

  try {
    const text = await response.clone().text();
    if (text) {
      return text;
    }
  } catch (error) {
    // Text parsing also failed; use default.
  }

  return defaultMessage;
};

const buildRequestHeaders = (initialHeaders = {}) => {
  const headers = new Headers(initialHeaders);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const authToken = getStoredAuthToken();
  if (authToken && !headers.has("Authorization")) {
    const formattedToken = authToken.startsWith("Bearer ")
      ? authToken
      : `Bearer ${authToken}`;
    headers.set("Authorization", formattedToken);
  }

  const csrfToken = getStoredCsrfToken();
  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return headers;
};

export const logout = async (options = {}) => {
  const {
    endpoint = DEFAULT_LOGOUT_ENDPOINT,
    fetchOptions = {},
  } = options;

  const {
    headers: providedHeaders,
    method = "POST",
    credentials = "include",
    body,
    ...rest
  } = fetchOptions;

  const headers = buildRequestHeaders(providedHeaders);

  let response;

  try {
    response = await fetch(endpoint, {
      method,
      credentials,
      headers,
      body,
      ...rest,
    });
  } catch (networkError) {
    throw new Error(
      networkError?.message || "A network error occurred while logging out."
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  clearStoredSession();
  return response;
};

export default {
  logout,
  clearStoredSession,
};
