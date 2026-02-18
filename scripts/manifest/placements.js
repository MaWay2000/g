import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

export class PlacementCancelledError extends Error {
  constructor(message = "Placement cancelled") {
    super(message);
    this.name = "PlacementCancelledError";
    this.isPlacementCancellation = true;
  }
}

export const createManifestPlacementManager = (sceneDependencies = {}) => {
  const {
    scene,
    camera,
    controls,
    canvas,
    raycaster,
    colliderDescriptors = [],
    registerCollidersForImportedRoot,
    unregisterColliderDescriptors,
    rebuildStaticColliders,
    loadModelFromManifestEntry,
    onManifestPlacementHoverChange,
    onManifestEditModeChange,
    onManifestPlacementRemoved,
    onManifestPlacementsChanged,
    getRoomWidth,
    getRoomDepth,
    getRoomFloorY,
    getPlacementBounds,
    getPlacementGroundHeight,
  } = sceneDependencies;

  const getRoomDimensions = () => ({
    width: typeof getRoomWidth === "function" ? getRoomWidth() : 0,
    depth: typeof getRoomDepth === "function" ? getRoomDepth() : 0,
    floorY: typeof getRoomFloorY === "function" ? getRoomFloorY() : 0,
  });

  const resolvePlacementGroundHeight = (position) => {
    if (typeof getPlacementGroundHeight !== "function") {
      return null;
    }

    if (!position) {
      return null;
    }

    const samplePosition = {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
      z: Number.isFinite(position.z) ? position.z : 0,
    };
    const resolvedHeight = getPlacementGroundHeight(samplePosition);
    return Number.isFinite(resolvedHeight) ? resolvedHeight : null;
  };

  const normalizeHorizontalBounds = (rawBounds) => {
    const rawMinX = Number.isFinite(rawBounds?.minX) ? rawBounds.minX : null;
    const rawMaxX = Number.isFinite(rawBounds?.maxX) ? rawBounds.maxX : null;
    const rawMinZ = Number.isFinite(rawBounds?.minZ) ? rawBounds.minZ : null;
    const rawMaxZ = Number.isFinite(rawBounds?.maxZ) ? rawBounds.maxZ : null;

    if (
      !Number.isFinite(rawMinX) ||
      !Number.isFinite(rawMaxX) ||
      !Number.isFinite(rawMinZ) ||
      !Number.isFinite(rawMaxZ)
    ) {
      return null;
    }

    let minX = Math.min(rawMinX, rawMaxX);
    let maxX = Math.max(rawMinX, rawMaxX);
    let minZ = Math.min(rawMinZ, rawMaxZ);
    let maxZ = Math.max(rawMinZ, rawMaxZ);

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return null;
    }

    if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      return null;
    }

    const paddedMinX = minX + ROOM_BOUNDARY_PADDING;
    const paddedMaxX = maxX - ROOM_BOUNDARY_PADDING;
    if (paddedMaxX > paddedMinX) {
      minX = paddedMinX;
      maxX = paddedMaxX;
    }

    const paddedMinZ = minZ + ROOM_BOUNDARY_PADDING;
    const paddedMaxZ = maxZ - ROOM_BOUNDARY_PADDING;
    if (paddedMaxZ > paddedMinZ) {
      minZ = paddedMinZ;
      maxZ = paddedMaxZ;
    }

    return { minX, maxX, minZ, maxZ };
  };

  const getHorizontalPlacementBounds = () => {
    if (typeof getPlacementBounds === "function") {
      const customBounds = normalizeHorizontalBounds(getPlacementBounds());
      if (customBounds) {
        return customBounds;
      }
    }

    const { width, depth } = getRoomDimensions();
    const hasRoomSize =
      Number.isFinite(width) &&
      width > 0 &&
      Number.isFinite(depth) &&
      depth > 0;

    if (!hasRoomSize) {
      return null;
    }

    return normalizeHorizontalBounds({
      minX: -width / 2,
      maxX: width / 2,
      minZ: -depth / 2,
      maxZ: depth / 2,
    });
  };

  let activePlacement = null;
  const manifestPlacements = new Set();
  const externalEditablePlacements = new Set();

  const EDIT_MODE_HOVER_OPACITY = 0.25;
  const EDIT_MODE_SELECTED_OPACITY = 0.45;
  const manifestEditModeState = {
    enabled: false,
    hovered: null,
    selected: null,
    pointerDownHandlerAttached: false,
    keydownHandlerAttached: false,
  };

  const manifestPlacementPadding = new THREE.Vector3(0.05, 0.05, 0.05);
  const placementPointerEvents = ["pointerdown", "mousedown"];
  const placementPreviewBasePosition = new THREE.Vector3();
  const placementComputedPosition = new THREE.Vector3();
  const placementBoundsWorldPosition = new THREE.Vector3();
  const placementDependentOffset = new THREE.Vector3();
  const placementDependentPreviousPosition = new THREE.Vector3();
  const placementPreviousPreviewPosition = new THREE.Vector3();
  const placementCollisionBox = new THREE.Box3();
  const placementPreviousCollisionBox = new THREE.Box3();
  const stackingBoundsBase = new THREE.Box3();
  const stackingBoundsCandidate = new THREE.Box3();

  const PLACEMENT_VERTICAL_TOLERANCE = 1e-3;
  const ROOM_BOUNDARY_PADDING = 1e-3;
  const MIN_MANIFEST_PLACEMENT_DISTANCE = 2;
  const MANIFEST_PLACEMENT_DISTANCE_STEP = 0.5;
  const STACKING_VERTICAL_TOLERANCE = 0.02;
  const STACKING_HORIZONTAL_TOLERANCE = 1e-3;

  const getMaxManifestPlacementDistance = () => {
    const horizontalBounds = getHorizontalPlacementBounds();
    const boundsDepth = horizontalBounds
      ? horizontalBounds.maxZ - horizontalBounds.minZ
      : NaN;
    const { depth } = getRoomDimensions();
    const referenceDepth = Number.isFinite(boundsDepth) && boundsDepth > 0
      ? boundsDepth
      : depth;
    return Math.max(
      MIN_MANIFEST_PLACEMENT_DISTANCE,
      referenceDepth / 2 - 0.5
    );
  };

  const normalizeManifestPlacementScalar = (value, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;

  const normalizeManifestPlacementScale = (value, fallback = 1) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  };

  const isEditablePlacement = (container) =>
    manifestPlacements.has(container) || externalEditablePlacements.has(container);

  const getEditablePlacements = () => [
    ...manifestPlacements,
    ...externalEditablePlacements,
  ];

  const serializeManifestPlacement = (container) => {
    if (!container?.isObject3D) {
      return null;
    }

    const manifestEntry = container.userData?.manifestEntry ?? null;
    const rawPath =
      typeof manifestEntry?.path === "string" ? manifestEntry.path.trim() : "";

    if (!rawPath) {
      return null;
    }

    const rawLabel =
      typeof manifestEntry?.label === "string" ? manifestEntry.label.trim() : "";
    const label = rawLabel || rawPath;

    return {
      path: rawPath,
      label,
      position: {
        x: normalizeManifestPlacementScalar(container.position.x, 0),
        y: normalizeManifestPlacementScalar(container.position.y, 0),
        z: normalizeManifestPlacementScalar(container.position.z, 0),
      },
      rotation: {
        x: normalizeManifestPlacementScalar(container.rotation.x, 0),
        y: normalizeManifestPlacementScalar(container.rotation.y, 0),
        z: normalizeManifestPlacementScalar(container.rotation.z, 0),
      },
      scale: {
        x: normalizeManifestPlacementScale(container.scale.x, 1),
        y: normalizeManifestPlacementScale(container.scale.y, 1),
        z: normalizeManifestPlacementScale(container.scale.z, 1),
      },
    };
  };

  const getManifestPlacementSnapshots = () =>
    Array.from(manifestPlacements)
      .map((container) => serializeManifestPlacement(container))
      .filter(Boolean);

  const notifyManifestPlacementsChanged = () => {
    if (typeof onManifestPlacementsChanged !== "function") {
      return;
    }

    try {
      onManifestPlacementsChanged(getManifestPlacementSnapshots());
    } catch (error) {
      console.warn("Unable to notify manifest placement persistence", error);
    }
  };

  const getManifestPlacementRoot = (object) => {
    let current = object;

    while (current && current !== scene) {
      if (isEditablePlacement(current)) {
        return current;
      }

      current = current.parent;
    }

    return null;
  };

  const updateManifestPlacementVisualState = (container) => {
    if (!container) {
      return;
    }

    const multiplier = !manifestEditModeState.enabled
      ? 1
      : manifestEditModeState.hovered === container
      ? EDIT_MODE_HOVER_OPACITY
      : manifestEditModeState.selected === container
      ? EDIT_MODE_SELECTED_OPACITY
      : 1;

    container.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) {
          return;
        }

        const userData = material.userData || (material.userData = {});
        if (!Number.isFinite(userData.baseOpacity)) {
          userData.baseOpacity = Number.isFinite(material.opacity)
            ? material.opacity
            : 1;
        }

        if (typeof userData.baseTransparent !== "boolean") {
          userData.baseTransparent = Boolean(material.transparent);
        }

        if (typeof userData.baseDepthWrite !== "boolean") {
          userData.baseDepthWrite = Boolean(material.depthWrite);
        }

        if (multiplier < 1) {
          material.transparent = true;
          material.opacity = userData.baseOpacity * multiplier;
          material.depthWrite = false;
        } else {
          material.transparent = userData.baseTransparent ?? false;
          material.opacity = userData.baseOpacity;
          material.depthWrite =
            typeof userData.baseDepthWrite === "boolean"
              ? userData.baseDepthWrite
              : true;
        }

        material.needsUpdate = true;
      });
    });
  };

  const setHoveredManifestPlacement = (container) => {
    if (manifestEditModeState.hovered === container) {
      return;
    }

    const previous = manifestEditModeState.hovered;
    manifestEditModeState.hovered = container;

    if (previous) {
      updateManifestPlacementVisualState(previous);
    }

    if (container) {
      updateManifestPlacementVisualState(container);
    }

    if (typeof onManifestPlacementHoverChange === "function") {
      onManifestPlacementHoverChange(Boolean(container));
    }
  };

  const setSelectedManifestPlacement = (container) => {
    if (manifestEditModeState.selected === container) {
      return;
    }

    const previous = manifestEditModeState.selected;
    manifestEditModeState.selected = container;

    if (previous) {
      updateManifestPlacementVisualState(previous);
    }

    if (container) {
      updateManifestPlacementVisualState(container);
    }
  };

  const clearManifestPlacementColliders = (container) => {
    if (!container) {
      return false;
    }

    const userData = container.userData || (container.userData = {});
    const colliders = Array.isArray(userData.manifestPlacementColliders)
      ? userData.manifestPlacementColliders
      : [];

    if (colliders.length === 0) {
      userData.manifestPlacementColliders = [];
      return false;
    }

    if (typeof unregisterColliderDescriptors === "function") {
      unregisterColliderDescriptors(colliders);
    }

    userData.manifestPlacementColliders = [];

    return true;
  };

  const refreshManifestPlacementColliders = (container) => {
    if (!container || typeof registerCollidersForImportedRoot !== "function") {
      return [];
    }

    const colliderEntries = registerCollidersForImportedRoot(container, {
      padding: manifestPlacementPadding,
    });

    const userData = container.userData || (container.userData = {});
    userData.manifestPlacementColliders = Array.isArray(colliderEntries)
      ? colliderEntries
      : [];

    return userData.manifestPlacementColliders;
  };

  const collectStackedManifestPlacements = (rootContainer) => {
    if (!rootContainer) {
      return [];
    }

    const dependents = [];
    const visited = new Set([rootContainer]);
    const toProcess = [rootContainer];

    while (toProcess.length > 0) {
      const current = toProcess.pop();

      if (!current) {
        continue;
      }

      current.updateMatrixWorld(true);
      stackingBoundsBase.setFromObject(current);

      getEditablePlacements().forEach((candidate) => {
        if (!candidate || visited.has(candidate) || candidate === current) {
          return;
        }

        candidate.updateMatrixWorld(true);
        stackingBoundsCandidate.setFromObject(candidate);

        if (stackingBoundsCandidate.isEmpty()) {
          return;
        }

        const verticalGap =
          stackingBoundsCandidate.min.y - stackingBoundsBase.max.y;

        if (Math.abs(verticalGap) > STACKING_VERTICAL_TOLERANCE) {
          return;
        }

        const overlapsHorizontally =
          stackingBoundsCandidate.max.x >
            stackingBoundsBase.min.x - STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.min.x <
            stackingBoundsBase.max.x + STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.max.z >
            stackingBoundsBase.min.z - STACKING_HORIZONTAL_TOLERANCE &&
          stackingBoundsCandidate.min.z <
            stackingBoundsBase.max.z + STACKING_HORIZONTAL_TOLERANCE;

        if (!overlapsHorizontally) {
          return;
        }

        visited.add(candidate);
        dependents.push({
          container: candidate,
          initialPosition: candidate.position.clone(),
        });
        toProcess.push(candidate);
      });
    }

    return dependents;
  };

  const computeManifestPlacementBounds = (container) => {
    const bounds = new THREE.Box3();

    if (!container) {
      return bounds;
    }

    container.updateMatrixWorld(true);
    bounds.setFromObject(container);

    if (bounds.isEmpty()) {
      return bounds;
    }

    container.getWorldPosition(placementBoundsWorldPosition);
    bounds.min.sub(placementBoundsWorldPosition);
    bounds.max.sub(placementBoundsWorldPosition);

    return bounds;
  };

  const computePlacementPosition = (placement, basePosition) => {
    placementComputedPosition.copy(basePosition);

    let supportingColliders = null;

    if (placement) {
      if (Array.isArray(placement.supportColliders)) {
        supportingColliders = placement.supportColliders;
        supportingColliders.length = 0;
      } else {
        supportingColliders = [];
        placement.supportColliders = supportingColliders;
      }
    }

    if (!placement || !placement.containerBounds) {
      if (supportingColliders) {
        supportingColliders.length = 0;
      }

      const { floorY } = getRoomDimensions();
      if (!Number.isFinite(placementComputedPosition.y)) {
        placementComputedPosition.y = floorY;
      }
      return placementComputedPosition;
    }

    const { floorY: roomFloorY } = getRoomDimensions();
    const container = placement.container ?? null;
    const bounds = placement.containerBounds;

    if (bounds.isEmpty()) {
      placementComputedPosition.y = roomFloorY;
      return placementComputedPosition;
    }

    if (!Number.isFinite(placementComputedPosition.x)) {
      placementComputedPosition.x = Number.isFinite(basePosition.x)
        ? basePosition.x
        : 0;
    }

    if (!Number.isFinite(placementComputedPosition.z)) {
      placementComputedPosition.z = Number.isFinite(basePosition.z)
        ? basePosition.z
        : 0;
    }

    const horizontalBounds = getHorizontalPlacementBounds();

    let footprintMinX = placementComputedPosition.x + bounds.min.x;
    let footprintMaxX = placementComputedPosition.x + bounds.max.x;
    let footprintMinZ = placementComputedPosition.z + bounds.min.z;
    let footprintMaxZ = placementComputedPosition.z + bounds.max.z;

    if (horizontalBounds) {
      if (footprintMinX < horizontalBounds.minX) {
        placementComputedPosition.x += horizontalBounds.minX - footprintMinX;
        footprintMinX = horizontalBounds.minX;
        footprintMaxX = placementComputedPosition.x + bounds.max.x;
      } else if (footprintMaxX > horizontalBounds.maxX) {
        placementComputedPosition.x += horizontalBounds.maxX - footprintMaxX;
        footprintMaxX = horizontalBounds.maxX;
        footprintMinX = placementComputedPosition.x + bounds.min.x;
      }

      if (footprintMinZ < horizontalBounds.minZ) {
        placementComputedPosition.z += horizontalBounds.minZ - footprintMinZ;
        footprintMinZ = horizontalBounds.minZ;
        footprintMaxZ = placementComputedPosition.z + bounds.max.z;
      } else if (footprintMaxZ > horizontalBounds.maxZ) {
        placementComputedPosition.z += horizontalBounds.maxZ - footprintMaxZ;
        footprintMaxZ = horizontalBounds.maxZ;
        footprintMinZ = placementComputedPosition.z + bounds.min.z;
      }
    }

    const baseY = Number.isFinite(basePosition.y)
      ? basePosition.y
      : roomFloorY;

    if (!Number.isFinite(placementComputedPosition.y)) {
      placementComputedPosition.y = baseY;
    }

    const boundsHeight = bounds.max.y - bounds.min.y;

    const sampledGroundHeight = resolvePlacementGroundHeight(
      placementComputedPosition
    );
    let supportHeight = Number.isFinite(sampledGroundHeight)
      ? Math.max(roomFloorY, sampledGroundHeight)
      : roomFloorY;
    let currentTop = supportHeight + boundsHeight;

    colliderDescriptors.forEach((descriptor) => {
      const box = descriptor?.box;

      if (!box || box.isEmpty()) {
        return;
      }

      if (
        container &&
        (descriptor.root === container ||
          (descriptor.object &&
            typeof descriptor.object === "object" &&
            descriptor.object !== null &&
            isObjectDescendantOf(descriptor.object, container)))
      ) {
        return;
      }

      if (
        footprintMaxX <= box.min.x ||
        footprintMinX >= box.max.x ||
        footprintMaxZ <= box.min.z ||
        footprintMinZ >= box.max.z
      ) {
        return;
      }

      const paddingY =
        descriptor.padding instanceof THREE.Vector3
          ? descriptor.padding.y
          : 0;

      const supportBottom = box.min.y + paddingY;

      if (supportBottom >= currentTop - PLACEMENT_VERTICAL_TOLERANCE) {
        return;
      }

      const effectiveTop = box.max.y - paddingY;

      if (effectiveTop > supportHeight) {
        supportHeight = effectiveTop;
        currentTop = supportHeight + boundsHeight;

        if (supportingColliders) {
          supportingColliders.length = 0;
          supportingColliders.push(descriptor);
        }
        return;
      }

      if (
        supportingColliders &&
        Math.abs(effectiveTop - supportHeight) <= STACKING_VERTICAL_TOLERANCE
      ) {
        supportingColliders.push(descriptor);
      }
    });

    placementComputedPosition.y = supportHeight - bounds.min.y;
    return placementComputedPosition;
  };

  const resolvePlacementPreviewCollisions = (placement, previousPosition) => {
    if (!placement || !placement.container) {
      return false;
    }

    const bounds = placement.containerBounds;

    if (!bounds || bounds.isEmpty()) {
      return false;
    }

    const horizontalBounds = getHorizontalPlacementBounds();
    const container = placement.container;
    const position = container.position;
    const dependents = Array.isArray(placement.dependents)
      ? placement.dependents
      : [];
    const supportingColliders = Array.isArray(placement.supportColliders)
      ? placement.supportColliders
      : null;

    placementCollisionBox.min.copy(bounds.min).add(position);
    placementCollisionBox.max.copy(bounds.max).add(position);

    let previousBox = null;

    if (previousPosition) {
      placementPreviousCollisionBox.min.copy(bounds.min).add(previousPosition);
      placementPreviousCollisionBox.max.copy(bounds.max).add(previousPosition);
      previousBox = placementPreviousCollisionBox;
    }

    const applyOffset = (offsetX, offsetZ) => {
      if (offsetX) {
        position.x += offsetX;
        placementCollisionBox.min.x += offsetX;
        placementCollisionBox.max.x += offsetX;
      }

      if (offsetZ) {
        position.z += offsetZ;
        placementCollisionBox.min.z += offsetZ;
        placementCollisionBox.max.z += offsetZ;
      }
    };

    const clampToRoomBounds = () => {
      if (!horizontalBounds) {
        return false;
      }

      let adjusted = false;

      if (placementCollisionBox.min.x < horizontalBounds.minX) {
        applyOffset(horizontalBounds.minX - placementCollisionBox.min.x, 0);
        adjusted = true;
      } else if (placementCollisionBox.max.x > horizontalBounds.maxX) {
        applyOffset(horizontalBounds.maxX - placementCollisionBox.max.x, 0);
        adjusted = true;
      }

      if (placementCollisionBox.min.z < horizontalBounds.minZ) {
        applyOffset(0, horizontalBounds.minZ - placementCollisionBox.min.z);
        adjusted = true;
      } else if (placementCollisionBox.max.z > horizontalBounds.maxZ) {
        applyOffset(0, horizontalBounds.maxZ - placementCollisionBox.max.z);
        adjusted = true;
      }

      return adjusted;
    };

    const isPlacementObject = (object) => {
      if (!object) {
        return false;
      }

      if (object === container || isObjectDescendantOf(object, container)) {
        return true;
      }

      return dependents.some((dependent) => {
        const dependentContainer = dependent?.container ?? null;
        return (
          dependentContainer &&
          (object === dependentContainer ||
            isObjectDescendantOf(object, dependentContainer))
        );
      });
    };

    let collisionResolved = clampToRoomBounds();
    const maxIterations = 10;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let iterationAdjusted = false;

      for (let i = 0; i < colliderDescriptors.length; i += 1) {
        const descriptor = colliderDescriptors[i];

        if (!descriptor) {
          continue;
        }

        if (isPlacementObject(descriptor.object) || isPlacementObject(descriptor.root)) {
          continue;
        }

        const box = descriptor.box;

        if (!box || box.isEmpty()) {
          continue;
        }

        if (
          placementCollisionBox.max.y <= box.min.y ||
          placementCollisionBox.min.y >= box.max.y
        ) {
          continue;
        }

        const overlapX =
          Math.min(placementCollisionBox.max.x, box.max.x) -
          Math.max(placementCollisionBox.min.x, box.min.x);
        const overlapZ =
          Math.min(placementCollisionBox.max.z, box.max.z) -
          Math.max(placementCollisionBox.min.z, box.min.z);
        const overlapY =
          Math.min(placementCollisionBox.max.y, box.max.y) -
          Math.max(placementCollisionBox.min.y, box.min.y);

        if (
          supportingColliders &&
          supportingColliders.includes(descriptor)
        ) {
          const allowedOverlap =
            (descriptor.padding instanceof THREE.Vector3
              ? descriptor.padding.y
              : 0) + STACKING_VERTICAL_TOLERANCE;

          if (overlapY <= allowedOverlap) {
            continue;
          }
        }

        if (
          overlapX <= 0 ||
          overlapZ <= 0 ||
          overlapY <= STACKING_VERTICAL_TOLERANCE
        ) {
          continue;
        }

        if (overlapX < overlapZ) {
          const overlapLeft = placementCollisionBox.max.x - box.min.x;
          const overlapRight = box.max.x - placementCollisionBox.min.x;
          let shiftX = 0;

          if (previousBox && previousBox.max.x <= box.min.x) {
            shiftX = box.min.x - placementCollisionBox.max.x;
          } else if (previousBox && previousBox.min.x >= box.max.x) {
            shiftX = box.max.x - placementCollisionBox.min.x;
          } else if (overlapLeft < overlapRight) {
            shiftX = box.min.x - placementCollisionBox.max.x;
          } else {
            shiftX = box.max.x - placementCollisionBox.min.x;
          }

          if (shiftX !== 0) {
            applyOffset(shiftX, 0);
            iterationAdjusted = true;
          }
        } else {
          const overlapBack = placementCollisionBox.max.z - box.min.z;
          const overlapFront = box.max.z - placementCollisionBox.min.z;
          let shiftZ = 0;

          if (previousBox && previousBox.max.z <= box.min.z) {
            shiftZ = box.min.z - placementCollisionBox.max.z;
          } else if (previousBox && previousBox.min.z >= box.max.z) {
            shiftZ = box.max.z - placementCollisionBox.min.z;
          } else if (overlapBack < overlapFront) {
            shiftZ = box.min.z - placementCollisionBox.max.z;
          } else {
            shiftZ = box.max.z - placementCollisionBox.min.z;
          }

          if (shiftZ !== 0) {
            applyOffset(0, shiftZ);
            iterationAdjusted = true;
          }
        }

        if (iterationAdjusted) {
          collisionResolved = true;
          clampToRoomBounds();
          break;
        }
      }

      if (!iterationAdjusted) {
        break;
      }
    }

    if (collisionResolved) {
      container.position.x = position.x;
      container.position.z = position.z;
    }

    return collisionResolved;
  };

  const realignManifestPlacements = ({ exclude } = {}) => {
    let anyChanged = false;

    manifestPlacements.forEach((container) => {
      if (!container || container === exclude) {
        return;
      }

      const bounds = computeManifestPlacementBounds(container);

      if (bounds.isEmpty()) {
        return;
      }

      const computedPosition = computePlacementPosition(
        { container, containerBounds: bounds },
        container.position
      );

      if (!container.position.equals(computedPosition)) {
        container.position.copy(computedPosition);
        container.updateMatrixWorld(true);
        anyChanged = true;
      }
    });

    return anyChanged;
  };

  const applyPlacementColliderEntries = (container, colliderEntries = []) => {
    if (!container) {
      return;
    }

    const userData = container.userData || (container.userData = {});
    userData.manifestPlacementColliders = Array.isArray(colliderEntries)
      ? colliderEntries
      : [];

    if (manifestPlacements.has(container)) {
      userData.isManifestPlacement = true;
      delete userData.externalEditablePlacement;
      delete userData.externalEditablePlacementHandlers;
    } else if (externalEditablePlacements.has(container)) {
      userData.isManifestPlacement = false;
      userData.externalEditablePlacement = true;
    }

    updateManifestPlacementVisualState(container);
  };

  const registerManifestPlacement = (container, colliderEntries = []) => {
    if (!container) {
      return;
    }

    externalEditablePlacements.delete(container);
    manifestPlacements.add(container);
    applyPlacementColliderEntries(container, colliderEntries);
  };

  const registerExternalEditablePlacement = (
    container,
    { entry = null, onRemove = null, onTransform = null } = {}
  ) => {
    if (!container) {
      return false;
    }

    manifestPlacements.delete(container);
    externalEditablePlacements.add(container);

    const userData = container.userData || (container.userData = {});
    if (entry && typeof entry === "object") {
      userData.manifestEntry = entry;
    }

    const existingColliderEntries = Array.isArray(
      userData.manifestPlacementColliders
    )
      ? userData.manifestPlacementColliders
      : [];
    userData.externalEditablePlacementHandlers = {
      onRemove: typeof onRemove === "function" ? onRemove : null,
      onTransform: typeof onTransform === "function" ? onTransform : null,
    };
    applyPlacementColliderEntries(container, existingColliderEntries);
    return true;
  };

  const unregisterExternalEditablePlacement = (container) => {
    if (!container || !externalEditablePlacements.has(container)) {
      return false;
    }

    if (manifestEditModeState.hovered === container) {
      setHoveredManifestPlacement(null);
    }

    if (manifestEditModeState.selected === container) {
      setSelectedManifestPlacement(null);
    }

    externalEditablePlacements.delete(container);

    const userData = container.userData || (container.userData = {});
    delete userData.externalEditablePlacement;
    delete userData.externalEditablePlacementHandlers;
    updateManifestPlacementVisualState(container);

    return true;
  };

  const removeManifestPlacement = (container) => {
    if (!container || !isEditablePlacement(container)) {
      return null;
    }

    const isStoredManifestPlacement = manifestPlacements.has(container);
    const isExternalEditablePlacement = externalEditablePlacements.has(container);

    if (manifestEditModeState.hovered === container) {
      setHoveredManifestPlacement(null);
    }

    if (manifestEditModeState.selected === container) {
      setSelectedManifestPlacement(null);
    }

    manifestPlacements.delete(container);
    externalEditablePlacements.delete(container);

    const colliders = Array.isArray(
      container.userData?.manifestPlacementColliders
    )
      ? container.userData.manifestPlacementColliders
      : [];

    if (colliders.length > 0 && typeof unregisterColliderDescriptors === "function") {
      unregisterColliderDescriptors(colliders);
      container.userData.manifestPlacementColliders = [];
    }

    if (scene && typeof scene.remove === "function") {
      scene.remove(container);
    }

    if (typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    const placementsRealigned = realignManifestPlacements();

    if (placementsRealigned && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    const manifestEntry = container.userData?.manifestEntry ?? null;
    const externalHandlers =
      container.userData?.externalEditablePlacementHandlers ?? null;

    if (
      isExternalEditablePlacement &&
      typeof externalHandlers?.onRemove === "function"
    ) {
      try {
        externalHandlers.onRemove({
          container,
          entry: manifestEntry,
        });
      } catch (error) {
        console.warn("Unable to persist external placement removal", error);
      }
    }

    if (typeof onManifestPlacementRemoved === "function") {
      onManifestPlacementRemoved(manifestEntry);
    }

    if (isStoredManifestPlacement) {
      notifyManifestPlacementsChanged();
    }

    return manifestEntry;
  };

  const reparentPlacementContainerForEditing = (container) => {
    if (
      !container?.isObject3D ||
      !scene?.isObject3D ||
      typeof scene.attach !== "function"
    ) {
      return null;
    }

    const parent = container.parent;
    if (!parent || parent === scene) {
      return null;
    }

    const previousIndex = Array.isArray(parent.children)
      ? parent.children.indexOf(container)
      : -1;
    scene.attach(container);
    return {
      container,
      parent,
      previousIndex,
    };
  };

  const restoreReparentedPlacementContainer = (record) => {
    if (!record || typeof record !== "object") {
      return;
    }

    const { container, parent, previousIndex } = record;
    if (!container?.isObject3D || !parent?.isObject3D || container.parent === parent) {
      return;
    }

    if (typeof parent.attach === "function") {
      parent.attach(container);
    } else if (typeof parent.add === "function") {
      parent.add(container);
    }

    if (
      Number.isInteger(previousIndex) &&
      previousIndex >= 0 &&
      Array.isArray(parent.children)
    ) {
      const children = parent.children;
      const currentIndex = children.indexOf(container);
      if (currentIndex >= 0 && currentIndex !== previousIndex) {
        children.splice(currentIndex, 1);
        children.splice(Math.min(previousIndex, children.length), 0, container);
      }
    }
  };

  const restoreReparentedPlacementContainers = (placement) => {
    if (!Array.isArray(placement?.reparentedContainers)) {
      return;
    }

    placement.reparentedContainers.forEach((record) => {
      restoreReparentedPlacementContainer(record);
    });
    placement.reparentedContainers.length = 0;
  };

  const beginManifestPlacementReposition = (container) => {
    if (!container || activePlacement) {
      return;
    }

    if (!isEditablePlacement(container)) {
      return;
    }

    setHoveredManifestPlacement(null);

    let collidersWereRemoved = clearManifestPlacementColliders(container);

    const containerBounds = computeManifestPlacementBounds(container);

    const previousState = {
      position: container.position.clone(),
      quaternion: container.quaternion.clone(),
      scale: container.scale.clone(),
    };

    const reparentedContainers = [];
    const reparentedContainer = reparentPlacementContainerForEditing(container);
    if (reparentedContainer) {
      reparentedContainers.push(reparentedContainer);
      container.updateMatrixWorld(true);
    }

    const playerPosition = controls.getObject().position;
    const distanceToPlayer = playerPosition.distanceTo(container.position);
    const placementDistance = Number.isFinite(distanceToPlayer)
      ? Math.max(MIN_MANIFEST_PLACEMENT_DISTANCE, distanceToPlayer)
      : MIN_MANIFEST_PLACEMENT_DISTANCE;

    const stackedDependents = reparentedContainer
      ? []
      : collectStackedManifestPlacements(container).map((dependent) => {
          const dependentContainer = dependent?.container ?? null;
          const collidersCleared = clearManifestPlacementColliders(
            dependentContainer
          );

          if (collidersCleared) {
            collidersWereRemoved = true;
          }

          if (!dependentContainer) {
            return {
              ...dependent,
              collidersCleared,
              containerBounds: null,
              previewPlacement: null,
              previewPosition: null,
              lastResolvedPosition: null,
            };
          }

          const dependentBounds = computeManifestPlacementBounds(
            dependentContainer
          );
          const previewPlacement = dependentBounds?.isEmpty()
            ? null
            : {
                container: dependentContainer,
                containerBounds: dependentBounds,
                dependents: [],
              };

          return {
            ...dependent,
            collidersCleared,
            containerBounds: dependentBounds,
            previewPlacement,
            previewPosition: dependentContainer.position.clone(),
            lastResolvedPosition: dependentContainer.position.clone(),
          };
        });

    const userData = container.userData || (container.userData = {});

    const placement = {
      entry: userData.manifestEntry ?? null,
      container,
      containerBounds,
      resolve: () => {},
      reject: () => {},
      distance: placementDistance,
      previewDirection: new THREE.Vector3(),
      previewPosition: container.position.clone(),
      pointerHandler: null,
      keydownHandler: null,
      isReposition: true,
      previousState,
      skipEventTypes: new Set(placementPointerEvents),
      dependents: stackedDependents,
      collidersWereRemoved,
      reparentedContainers,
    };

    placement.pointerHandler = (event) => {
      if (event.button !== 0) {
        return;
      }

      if (placement.isReposition) {
        const skipEvents = placement.skipEventTypes;

        if (skipEvents instanceof Set && skipEvents.has(event.type)) {
          skipEvents.delete(event.type);
          return;
        }
      }

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      finalizeActivePlacement();
    };

    placement.keydownHandler = (event) => {
      if (event.code === "Escape") {
        cancelActivePlacement(
          new PlacementCancelledError("Placement cancelled"),
          { restoreOnCancel: true }
        );
      }
    };

    activePlacement = placement;

    placementPointerEvents.forEach((eventName) => {
      canvas?.addEventListener(eventName, placement.pointerHandler);
    });
    document.addEventListener("keydown", placement.keydownHandler, true);

    if (collidersWereRemoved && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    updateActivePlacementPreview();
  };

  const handleManifestEditModePointerDown = (event) => {
    if (
      event.type === "mousedown" &&
      typeof window !== "undefined" &&
      typeof window.PointerEvent === "function"
    ) {
      return;
    }

    if (!manifestEditModeState.enabled) {
      return;
    }

    if (activePlacement) {
      return;
    }

    if (event.button === 0) {
      if (!controls.isLocked) {
        return;
      }

      const hovered = manifestEditModeState.hovered;
      if (hovered) {
        setSelectedManifestPlacement(hovered);
        beginManifestPlacementReposition(hovered);
      }
    } else if (event.button === 2) {
      setSelectedManifestPlacement(null);
    }
  };

  const handleManifestEditModeKeydown = (event) => {
    if (!manifestEditModeState.enabled) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement) {
      const tagName = target.tagName;

      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }

      if (target.isContentEditable) {
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setManifestEditModeEnabled(false);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      const selected = manifestEditModeState.selected;

      if (!selected) {
        return;
      }

      event.preventDefault();
      if (activePlacement && activePlacement.container === selected) {
        cancelActivePlacement(
          new PlacementCancelledError("Placement removed"),
          { restoreOnCancel: false }
        );
      }

      removeManifestPlacement(selected);
    }
  };

  const updateManifestEditModeHover = () => {
    if (!manifestEditModeState.enabled) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    if (activePlacement && activePlacement.isReposition) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    const editablePlacements = getEditablePlacements();
    if (!controls.isLocked || editablePlacements.length === 0) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      editablePlacements,
      true
    );

    if (intersections.length === 0) {
      if (manifestEditModeState.hovered) {
        setHoveredManifestPlacement(null);
      }
      return;
    }

    const intersection = intersections[0];
    const placement = getManifestPlacementRoot(intersection.object);
    setHoveredManifestPlacement(placement);
  };

  const setManifestEditModeEnabled = (enabled) => {
    const nextEnabled = Boolean(enabled);

    if (nextEnabled === manifestEditModeState.enabled) {
      return manifestEditModeState.enabled;
    }

    manifestEditModeState.enabled = nextEnabled;

    if (manifestEditModeState.pointerDownHandlerAttached) {
      canvas?.removeEventListener(
        "pointerdown",
        handleManifestEditModePointerDown
      );
      canvas?.removeEventListener(
        "mousedown",
        handleManifestEditModePointerDown
      );
      manifestEditModeState.pointerDownHandlerAttached = false;
    }

    if (manifestEditModeState.keydownHandlerAttached) {
      document.removeEventListener(
        "keydown",
        handleManifestEditModeKeydown,
        true
      );
      manifestEditModeState.keydownHandlerAttached = false;
    }

    if (nextEnabled) {
      canvas?.addEventListener("pointerdown", handleManifestEditModePointerDown);
      canvas?.addEventListener("mousedown", handleManifestEditModePointerDown);
      document.addEventListener("keydown", handleManifestEditModeKeydown, true);
      manifestEditModeState.pointerDownHandlerAttached = true;
      manifestEditModeState.keydownHandlerAttached = true;
      updateManifestEditModeHover();
    } else {
      setHoveredManifestPlacement(null);
      setSelectedManifestPlacement(null);
    }

    getEditablePlacements().forEach(updateManifestPlacementVisualState);

    if (typeof onManifestEditModeChange === "function") {
      onManifestEditModeChange(manifestEditModeState.enabled);
    }

    return manifestEditModeState.enabled;
  };

  const clearPlacementEventListeners = (placement) => {
    if (!placement) {
      return;
    }

    placementPointerEvents.forEach((eventName) => {
      if (placement.pointerHandler) {
        canvas?.removeEventListener(eventName, placement.pointerHandler);
      }
    });

    if (placement.pointerHandler) {
      placement.pointerHandler = null;
    }

    if (placement.wheelHandler) {
      canvas?.removeEventListener("wheel", placement.wheelHandler);
      placement.wheelHandler = null;
    }

    if (placement.keydownHandler) {
      document.removeEventListener("keydown", placement.keydownHandler, true);
      placement.keydownHandler = null;
    }
  };

  const cancelActivePlacement = (reason, options = {}) => {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    clearPlacementEventListeners(placement);
    activePlacement = null;

    const restoreOnCancel =
      options.restoreOnCancel ?? (placement.isReposition ? true : false);

    if (placement.isReposition) {
      restoreReparentedPlacementContainers(placement);
    }

    if (placement.isReposition && restoreOnCancel) {
      const container = placement.container;
      const previousState = placement.previousState;

      if (previousState) {
        container.position.copy(previousState.position);
        container.quaternion.copy(previousState.quaternion);
        container.scale.copy(previousState.scale);
        container.updateMatrixWorld(true);
      }

      if (Array.isArray(placement.dependents)) {
        placement.dependents.forEach((dependent) => {
          if (!dependent?.container || !dependent.initialPosition) {
            return;
          }

          dependent.container.position.copy(dependent.initialPosition);
          dependent.container.updateMatrixWorld(true);
        });
      }

      if (typeof registerCollidersForImportedRoot === "function") {
        const colliderEntries = registerCollidersForImportedRoot(container, {
          padding: manifestPlacementPadding,
        });
        applyPlacementColliderEntries(container, colliderEntries);

        let shouldRebuildColliders = Boolean(placement.collidersWereRemoved);

        if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
          shouldRebuildColliders = true;
        }

        if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
          placement.dependents.forEach((dependent) => {
            if (!dependent?.container || !dependent.collidersCleared) {
              return;
            }

            const dependentEntries = refreshManifestPlacementColliders(
              dependent.container
            );

            if (Array.isArray(dependentEntries) && dependentEntries.length > 0) {
              shouldRebuildColliders = true;
            }
          });
        }

        if (shouldRebuildColliders && typeof rebuildStaticColliders === "function") {
          rebuildStaticColliders();
        }
      }
    } else if (scene && typeof scene.remove === "function") {
      scene.remove(placement.container);
    }

    let error;

    if (reason instanceof PlacementCancelledError) {
      error = reason;
    } else if (reason instanceof Error) {
      error = new PlacementCancelledError(reason.message);
      error.cause = reason;
    } else {
      error = new PlacementCancelledError();
    }

    if (typeof placement.reject === "function") {
      placement.reject(error);
    }
  };

  const finalizeActivePlacement = () => {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    clearPlacementEventListeners(placement);
    activePlacement = null;

    const finalPosition = computePlacementPosition(
      placement,
      placement.previewPosition
    );

    placement.previewPosition.copy(finalPosition);
    placement.container.position.copy(placement.previewPosition);
    placement.container.updateMatrixWorld(true);

    if (placement.isReposition) {
      restoreReparentedPlacementContainers(placement);
      placement.container.updateMatrixWorld(true);
    }

    let colliderEntries = [];
    if (typeof registerCollidersForImportedRoot === "function") {
      colliderEntries = registerCollidersForImportedRoot(placement.container, {
        padding: manifestPlacementPadding,
      });
    }
    if (placement.isReposition) {
      applyPlacementColliderEntries(placement.container, colliderEntries);
    } else {
      registerManifestPlacement(placement.container, colliderEntries);
    }

    let shouldRebuildColliders = Boolean(placement.collidersWereRemoved);

    if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
      shouldRebuildColliders = true;
    }

    if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
      placement.dependents.forEach((dependent) => {
        if (!dependent?.container || !dependent.collidersCleared) {
          return;
        }

        const dependentEntries = refreshManifestPlacementColliders(
          dependent.container
        );

        if (Array.isArray(dependentEntries) && dependentEntries.length > 0) {
          shouldRebuildColliders = true;
        }
      });
    }

    if (shouldRebuildColliders && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    if (placement.isReposition) {
      const placementsRealigned = realignManifestPlacements({
        exclude: placement.container,
      });

      if (placementsRealigned && typeof rebuildStaticColliders === "function") {
        rebuildStaticColliders();
      }
    }

    if (placement.isReposition) {
      setSelectedManifestPlacement(null);
      setHoveredManifestPlacement(null);
      updateManifestEditModeHover();

      const externalHandlers =
        placement.container.userData?.externalEditablePlacementHandlers ?? null;
      if (typeof externalHandlers?.onTransform === "function") {
        try {
          externalHandlers.onTransform({
            container: placement.container,
            entry: placement.container.userData?.manifestEntry ?? null,
          });
        } catch (error) {
          console.warn("Unable to persist external placement transform", error);
        }
      }
    }

    if (manifestPlacements.has(placement.container)) {
      notifyManifestPlacementsChanged();
    }

    if (typeof placement.resolve === "function") {
      placement.resolve(placement.container);
    }
  };

  const updateActivePlacementPreview = () => {
    if (!activePlacement) {
      return;
    }

    const placement = activePlacement;
    const playerPosition = controls.getObject().position;
    const directionVector = placement.previewDirection;

    placementPreviousPreviewPosition.copy(placement.previewPosition);

    camera.getWorldDirection(directionVector);
    directionVector.y = 0;

    if (directionVector.lengthSq() < 1e-6) {
      directionVector.set(0, 0, -1);
    } else {
      directionVector.normalize();
    }

    placementPreviewBasePosition
      .copy(playerPosition)
      .addScaledVector(directionVector, placement.distance);

    const horizontalBounds = getHorizontalPlacementBounds();
    if (horizontalBounds) {
      placementPreviewBasePosition.x = THREE.MathUtils.clamp(
        placementPreviewBasePosition.x,
        horizontalBounds.minX,
        horizontalBounds.maxX
      );
      placementPreviewBasePosition.z = THREE.MathUtils.clamp(
        placementPreviewBasePosition.z,
        horizontalBounds.minZ,
        horizontalBounds.maxZ
      );
    }

    const computedPosition = computePlacementPosition(
      placement,
      placementPreviewBasePosition
    );

    placement.previewPosition.copy(computedPosition);
    placement.container.position.copy(placement.previewPosition);

    const collisionsResolved = resolvePlacementPreviewCollisions(
      placement,
      placementPreviousPreviewPosition
    );

    if (collisionsResolved) {
      placement.previewPosition.copy(placement.container.position);
    }

    placement.container.updateMatrixWorld(true);

    if (Array.isArray(placement.dependents) && placement.dependents.length > 0) {
      placementDependentOffset
        .copy(placement.container.position)
        .sub(placement.previousState?.position ?? placement.container.position);

      placement.dependents.forEach((dependent) => {
        if (!dependent?.container || !dependent.initialPosition) {
          return;
        }

        const previewPosition =
          dependent.previewPosition ??
          (dependent.previewPosition = new THREE.Vector3());
        previewPosition
          .copy(dependent.initialPosition)
          .add(placementDependentOffset);

        const previousResolvedPosition = dependent.lastResolvedPosition
          ? placementDependentPreviousPosition.copy(
              dependent.lastResolvedPosition
            )
          : placementDependentPreviousPosition
              .copy(dependent.initialPosition)
              .add(placementDependentOffset);

        dependent.container.position.copy(previewPosition);

        let dependentCollisionsResolved = false;

        const previewPlacement = dependent.previewPlacement ?? null;

        if (previewPlacement?.dependents) {
          const previewDependents = previewPlacement.dependents;
          previewDependents.length = 0;

          if (placement.container) {
            previewDependents.push({ container: placement.container });
          }

          placement.dependents.forEach((other) => {
            if (!other?.container || other === dependent) {
              return;
            }

            previewDependents.push({ container: other.container });
          });

          dependentCollisionsResolved = resolvePlacementPreviewCollisions(
            previewPlacement,
            previousResolvedPosition
          );
        }

        if (dependentCollisionsResolved && previewPlacement) {
          previewPosition.copy(dependent.container.position);
        }

        if (!dependent.lastResolvedPosition) {
          dependent.lastResolvedPosition = new THREE.Vector3();
        }

        dependent.lastResolvedPosition.copy(dependent.container.position);
        dependent.container.updateMatrixWorld(true);
      });
    }
  };

  const createManifestPlacementContainer = (object, manifestEntry) => {
    const container = new THREE.Group();
    container.name = manifestEntry?.label
      ? `ManifestModel:${manifestEntry.label}`
      : "ManifestModel";
    const userData = container.userData || (container.userData = {});
    userData.manifestEntry = manifestEntry ?? null;
    container.add(object);

    const boundingBox = new THREE.Box3().setFromObject(container);

    if (!boundingBox.isEmpty()) {
      const center = boundingBox.getCenter(new THREE.Vector3());
      object.position.sub(center);
      container.updateMatrixWorld(true);
    }

    return container;
  };

  const applyManifestPlacementSnapshotTransform = (container, snapshot) => {
    if (!container?.isObject3D || !snapshot || typeof snapshot !== "object") {
      return;
    }

    const rotation = snapshot.rotation ?? null;
    if (
      Number.isFinite(rotation?.x) &&
      Number.isFinite(rotation?.y) &&
      Number.isFinite(rotation?.z)
    ) {
      container.rotation.set(rotation.x, rotation.y, rotation.z);
    }

    const scale = snapshot.scale ?? null;
    container.scale.set(
      normalizeManifestPlacementScale(scale?.x, container.scale.x),
      normalizeManifestPlacementScale(scale?.y, container.scale.y),
      normalizeManifestPlacementScale(scale?.z, container.scale.z)
    );

    container.updateMatrixWorld(true);
  };

  const restoreManifestPlacements = async (snapshots = []) => {
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      notifyManifestPlacementsChanged();
      return { restored: 0, failed: 0 };
    }

    setManifestEditModeEnabled(false);

    if (activePlacement) {
      cancelActivePlacement(
        new PlacementCancelledError("Placement superseded")
      );
    }

    let restored = 0;
    let failed = 0;
    let shouldRebuildColliders = false;

    for (const snapshot of snapshots) {
      const rawPath =
        typeof snapshot?.path === "string" ? snapshot.path.trim() : "";

      if (!rawPath) {
        failed += 1;
        continue;
      }

      const rawLabel =
        typeof snapshot?.label === "string" ? snapshot.label.trim() : "";
      const manifestEntry = {
        path: rawPath,
        label: rawLabel || rawPath,
      };

      try {
        const loadedObject = await loadModelFromManifestEntry(manifestEntry);

        if (!loadedObject) {
          throw new Error("Unable to load the requested model");
        }

        const container = createManifestPlacementContainer(
          loadedObject,
          manifestEntry
        );
        applyManifestPlacementSnapshotTransform(container, snapshot);

        const containerBounds = computeManifestPlacementBounds(container);
        const storedPosition = snapshot?.position ?? null;
        const basePosition = new THREE.Vector3(
          normalizeManifestPlacementScalar(storedPosition?.x, 0),
          normalizeManifestPlacementScalar(storedPosition?.y, 0),
          normalizeManifestPlacementScalar(storedPosition?.z, 0)
        );
        const computedPosition = computePlacementPosition(
          { container, containerBounds },
          basePosition
        );

        container.position.copy(computedPosition);
        container.updateMatrixWorld(true);
        scene?.add(container);

        let colliderEntries = [];
        if (typeof registerCollidersForImportedRoot === "function") {
          colliderEntries = registerCollidersForImportedRoot(container, {
            padding: manifestPlacementPadding,
          });
        }

        registerManifestPlacement(container, colliderEntries);

        if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
          shouldRebuildColliders = true;
        }

        restored += 1;
      } catch (error) {
        failed += 1;
        console.warn("Unable to restore manifest placement", error);
      }
    }

    if (shouldRebuildColliders && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    notifyManifestPlacementsChanged();

    return { restored, failed };
  };

  const placeModelFromManifestEntry = async (entry, options = {}) => {
    if (typeof loadModelFromManifestEntry !== "function") {
      throw new Error("Manifest model loader unavailable");
    }

    try {
      setManifestEditModeEnabled(false);
      const loadedObject = await loadModelFromManifestEntry(entry);

      if (!loadedObject) {
        throw new Error("Unable to load the requested model");
      }

      const container = createManifestPlacementContainer(loadedObject, entry);
      const containerBounds = computeManifestPlacementBounds(container);

      const requestedDistance = Number.isFinite(options?.distance)
        ? options.distance
        : 6;
      const maxPlacementDistance = getMaxManifestPlacementDistance();
      const placementDistance = THREE.MathUtils.clamp(
        requestedDistance,
        MIN_MANIFEST_PLACEMENT_DISTANCE,
        maxPlacementDistance
      );

      cancelActivePlacement(
        new PlacementCancelledError("Placement superseded")
      );

      const placementPromise = new Promise((resolve, reject) => {
        const placement = {
          entry,
          container,
          containerBounds,
          resolve,
          reject,
          distance: placementDistance,
          previewDirection: new THREE.Vector3(),
          previewPosition: new THREE.Vector3(),
          pointerHandler: null,
          wheelHandler: null,
          keydownHandler: null,
        };

        placement.pointerHandler = (event) => {
          if (event.button !== 0) {
            return;
          }

          finalizeActivePlacement();
        };

        placement.wheelHandler = (event) => {
          if (event.cancelable) {
            event.preventDefault();
          }

          if (!event.deltaY) {
            return;
          }

          const delta =
            Math.sign(event.deltaY) * MANIFEST_PLACEMENT_DISTANCE_STEP;
          const nextDistance = THREE.MathUtils.clamp(
            placement.distance + delta,
            MIN_MANIFEST_PLACEMENT_DISTANCE,
            getMaxManifestPlacementDistance()
          );

          if (nextDistance === placement.distance) {
            return;
          }

          placement.distance = nextDistance;
          updateActivePlacementPreview();
        };

        placement.keydownHandler = (event) => {
          if (event.code === "Escape") {
            cancelActivePlacement(
              new PlacementCancelledError("Placement cancelled")
            );
          }
        };

        activePlacement = placement;

        placementPointerEvents.forEach((eventName) => {
          canvas?.addEventListener(eventName, placement.pointerHandler);
        });
        canvas?.addEventListener("wheel", placement.wheelHandler, {
          passive: false,
        });
        document.addEventListener("keydown", placement.keydownHandler, true);

        scene?.add(container);
        container.updateMatrixWorld(true);
        updateActivePlacementPreview();
      });

      return placementPromise;
    } catch (error) {
      console.error("Unable to place model from manifest", error);
      throw error;
    }
  };

  const dispose = () => {
    cancelActivePlacement(new PlacementCancelledError("Scene disposed"));
    setManifestEditModeEnabled(false);
    manifestPlacements.clear();
    externalEditablePlacements.clear();
  };

  return {
    setManifestEditModeEnabled,
    isManifestEditModeEnabled: () => manifestEditModeState.enabled,
    placeModelFromManifestEntry,
    hasManifestPlacements: () =>
      manifestPlacements.size + externalEditablePlacements.size > 0,
    getManifestPlacements: () => Array.from(manifestPlacements),
    getManifestPlacementSnapshots,
    restoreManifestPlacements,
    registerExternalEditablePlacement,
    unregisterExternalEditablePlacement,
    updateManifestEditModeHover,
    updateActivePlacementPreview,
    cancelActivePlacement,
    dispose,
  };
};

const isObjectDescendantOf = (object, ancestor) => {
  if (!object || !ancestor) {
    return false;
  }

  let current = object;

  while (current) {
    if (current === ancestor) {
      return true;
    }

    current = current.parent;
  }

  return false;
};
