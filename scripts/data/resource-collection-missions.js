import { PERIODIC_ELEMENTS } from "./periodic-elements.js";

const BASE_REQUIREMENTS = [1, 3, 5];
const GROWTH_FACTOR = 1.5;
const MISSION_COUNT = 100;

const pseudoRandomIndex = (seed, upperBound) => {
  const LCG_A = 1664525;
  const LCG_C = 1013904223;
  const modulus = 2 ** 32;
  return ((seed * LCG_A + LCG_C) % modulus) % upperBound;
};

const buildResourceMissions = () => {
  const missions = [];
  let requiredQuantity = 0;

  for (let index = 0; index < MISSION_COUNT; index += 1) {
    if (index < BASE_REQUIREMENTS.length) {
      requiredQuantity = BASE_REQUIREMENTS[index];
    } else {
      requiredQuantity = Math.ceil(requiredQuantity * GROWTH_FACTOR);
    }

    const element = PERIODIC_ELEMENTS[pseudoRandomIndex(index + 1, PERIODIC_ELEMENTS.length)];
    const resourceName = element?.name ?? "Unknown Resource";

    missions.push({
      id: `resource-collection-${String(index + 1).padStart(3, "0")}`,
      title: `Resource Collection #${index + 1}`,
      description: `Collect ${requiredQuantity} units of ${resourceName}.`,
      resource: {
        name: resourceName,
        symbol: element?.symbol ?? "?",
        atomicNumber: element?.number ?? null,
      },
      requirements: {
        quantity: requiredQuantity,
        growthFactor: GROWTH_FACTOR,
      },
    });
  }

  return missions;
};

export const RESOURCE_COLLECTION_MISSIONS = buildResourceMissions();

