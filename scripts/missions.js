import missionDefinitions from "./data/missions.json" assert { type: "json" };

const MISSION_STORAGE_KEY = "dustyNova.missions";
export const MAX_ACTIVE_MISSIONS = 3;

const normalizedMissionDefinitions = Array.isArray(missionDefinitions) ? missionDefinitions : [];

const missionLookup = new Map(
  normalizedMissionDefinitions.map((mission) => [mission.id, mission])
);
const orderedMissions = normalizedMissionDefinitions
  .slice()
  .sort((a, b) => a.unlockOrder - b.unlockOrder);

const getMissionStorage = (() => {
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
      const probeKey = `${MISSION_STORAGE_KEY}.probe`;
      storage.setItem(probeKey, "1");
      storage.removeItem(probeKey);
    } catch (error) {
      console.warn("Unable to access mission storage", error);
      storage = null;
    }

    return storage;
  };
})();

const getMissionStatus = (value) => {
  if (value === "active" || value === "completed") {
    return value;
  }

  return "pending";
};

const createDefaultMissionState = () => {
  const statuses = {};
  orderedMissions.forEach((mission, index) => {
    statuses[mission.id] = index < MAX_ACTIVE_MISSIONS ? "active" : "pending";
  });
  return { statuses, completedLog: [] };
};

const loadStoredMissionState = () => {
  const storage = getMissionStorage();

  if (!storage) {
    return null;
  }

  try {
    const serialized = storage.getItem(MISSION_STORAGE_KEY);

    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized);
    const statuses = parsed?.statuses;
    if (!statuses || typeof statuses !== "object") {
      return null;
    }

    const normalizedStatuses = {};
    orderedMissions.forEach((mission) => {
      normalizedStatuses[mission.id] = getMissionStatus(statuses[mission.id]);
    });

    const completedLog = Array.isArray(parsed?.completedLog)
      ? parsed.completedLog
          .filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string")
          .map((entry) => ({
            id: entry.id,
            completedAt: typeof entry.completedAt === "string" ? entry.completedAt : null,
          }))
      : [];

    return { statuses: normalizedStatuses, completedLog };
  } catch (error) {
    console.warn("Unable to read stored missions", error);
  }

  return null;
};

let missionState = createDefaultMissionState();

const persistMissionState = () => {
  const storage = getMissionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(MISSION_STORAGE_KEY, JSON.stringify(missionState));
  } catch (error) {
    console.warn("Unable to persist missions", error);
  }
};

const enforceActiveSlots = () => {
  const promotedMissions = [];
  const activeMissions = [];

  orderedMissions.forEach((mission) => {
    const status = getMissionStatus(missionState.statuses[mission.id]);
    if (status === "active") {
      activeMissions.push(mission);
    }
  });

  if (activeMissions.length > MAX_ACTIVE_MISSIONS) {
    for (let index = MAX_ACTIVE_MISSIONS; index < activeMissions.length; index += 1) {
      const mission = activeMissions[index];
      if (mission) {
        missionState.statuses[mission.id] = "pending";
      }
    }
  }

  const activeIds = new Set(
    orderedMissions
      .filter((mission) => getMissionStatus(missionState.statuses[mission.id]) === "active")
      .map((mission) => mission.id)
  );

  if (activeIds.size < MAX_ACTIVE_MISSIONS) {
    for (const mission of orderedMissions) {
      if (activeIds.size >= MAX_ACTIVE_MISSIONS) {
        break;
      }

      if (getMissionStatus(missionState.statuses[mission.id]) !== "pending") {
        continue;
      }

      missionState.statuses[mission.id] = "active";
      activeIds.add(mission.id);
      promotedMissions.push(mission);
    }
  }

  return promotedMissions;
};

const initializeMissionState = () => {
  const storedState = loadStoredMissionState();

  if (storedState) {
    missionState = storedState;
  }

  enforceActiveSlots();
  persistMissionState();
};

initializeMissionState();

const listeners = new Set();

const notifyMissionListeners = (detail = {}) => {
  listeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.warn("Mission listener failed", error);
    }
  });
};

export const getMissions = () =>
  orderedMissions.map((mission) => ({
    ...mission,
    status: getMissionStatus(missionState.statuses[mission.id]),
  }));

export const getActiveMissions = () => getMissions().filter((mission) => mission.status === "active");

export const getPendingMissions = () =>
  getMissions().filter((mission) => mission.status === "pending");

export const getCompletedMissions = () => missionState.completedLog.slice();

export const subscribeToMissionState = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const completeMission = (missionId) => {
  const mission = missionLookup.get(missionId);

  if (!mission) {
    return { completed: null, promoted: [] };
  }

  const currentStatus = getMissionStatus(missionState.statuses[missionId]);

  if (currentStatus === "completed") {
    return { completed: mission, promoted: [] };
  }

  if (currentStatus !== "active") {
    return { completed: null, promoted: [] };
  }

  missionState.statuses[missionId] = "completed";
  missionState.completedLog.push({ id: missionId, completedAt: new Date().toISOString() });

  const promoted = enforceActiveSlots();
  persistMissionState();
  notifyMissionListeners({ type: "completed", missionId, promoted });

  return { completed: mission, promoted };
};

export const resetMissions = () => {
  missionState = createDefaultMissionState();
  enforceActiveSlots();
  persistMissionState();
  notifyMissionListeners({ type: "reset" });
};
