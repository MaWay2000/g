const TODO_STORAGE_KEY = "dustyNova.todos";

const generateTodoId = (() => {
  let counter = 0;

  return () => {
    counter += 1;
    const timePart = Date.now().toString(36);
    const counterPart = counter.toString(36);
    return `todo-${timePart}-${counterPart}`;
  };
})();

const normalizeTodoItem = (item, index = 0) => {
  if (!item || typeof item.text !== "string") {
    return null;
  }

  const text = item.text.trim();

  if (text.length === 0) {
    return null;
  }

  const id =
    typeof item.id === "string" && item.id.trim() !== ""
      ? item.id.trim()
      : generateTodoId() + `-${index}`;

  return { id, text, completed: Boolean(item.completed) };
};

const normalizeTodoList = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item, index) => normalizeTodoItem(item, index))
    .filter((item) => item !== null);
};

const getTodoStorage = (() => {
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

      if (storage) {
        const probeKey = `${TODO_STORAGE_KEY}.probe`;
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
      }
    } catch (error) {
      console.warn("Unable to access localStorage for todos", error);
      storage = null;
    }

    return storage;
  };
})();

const serializeTodos = (todos) => {
  try {
    return JSON.stringify(normalizeTodoList(todos));
  } catch (error) {
    console.warn("Unable to serialize todos", error);
  }

  return null;
};

const parseStoredTodos = (serialized) => {
  if (typeof serialized !== "string" || serialized.trim() === "") {
    return [];
  }

  try {
    return normalizeTodoList(JSON.parse(serialized));
  } catch (error) {
    console.warn("Unable to parse stored todos", error);
  }

  return [];
};

export const loadStoredTodos = () => {
  const storage = getTodoStorage();

  if (!storage) {
    return { todos: [], storageAvailable: false };
  }

  try {
    const serialized = storage.getItem(TODO_STORAGE_KEY);
    return { todos: parseStoredTodos(serialized), storageAvailable: true };
  } catch (error) {
    console.warn("Unable to read stored todos", error);
  }

  return { todos: [], storageAvailable: Boolean(storage) };
};

export const persistTodos = (todos) => {
  const storage = getTodoStorage();

  if (!storage) {
    return { success: false, storageAvailable: false };
  }

  const serialized = serializeTodos(todos);

  if (!serialized) {
    return { success: false, storageAvailable: true };
  }

  try {
    storage.setItem(TODO_STORAGE_KEY, serialized);
    return { success: true, storageAvailable: true };
  } catch (error) {
    console.warn("Unable to persist todos", error);
  }

  return { success: false, storageAvailable: true };
};

export const clearStoredTodos = () => {
  const storage = getTodoStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(TODO_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn("Unable to clear stored todos", error);
  }

  return false;
};
