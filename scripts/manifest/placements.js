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
    getActiveFloorId,
    resolveFloorIdForPosition,
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
  const EDIT_MODE_HIGHLIGHT_PADDING = 0.06;
  const EDIT_MODE_HIGHLIGHT_MIN_SIZE = 0.08;
  const EDIT_MODE_HIGHLIGHT_BASE_OPACITY = 0.35;
  const EDIT_MODE_HIGHLIGHT_PULSE_OPACITY = 0.45;
  const EDIT_MODE_HIGHLIGHT_PULSE_SPEED = 0.008;
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
  const placementRepositionDirection = new THREE.Vector3();
  const placementRepositionCenterline = new THREE.Vector3();
  const placementRepositionVectorToObject = new THREE.Vector3();
  const placementDependentOffset = new THREE.Vector3();
  const placementDependentPreviousPosition = new THREE.Vector3();
  const placementPreviousPreviewPosition = new THREE.Vector3();
  const placementSnapPreviousPosition = new THREE.Vector3();
  const settleWorldPosition = new THREE.Vector3();
  const settleWorldTargetPosition = new THREE.Vector3();
  const settleLocalTargetPosition = new THREE.Vector3();
  const settleSortPositionA = new THREE.Vector3();
  const settleSortPositionB = new THREE.Vector3();
  const placementCollisionBox = new THREE.Box3();
  const placementPreviousCollisionBox = new THREE.Box3();
  const placementPreviewSupportBox = new THREE.Box3();
  const editHighlightBounds = new THREE.Box3();
  const editHighlightCenter = new THREE.Vector3();
  const editHighlightSize = new THREE.Vector3();
  const editHighlightGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(1, 1, 1)
  );
  const editHighlightMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x38bdf8),
    transparent: true,
    opacity: EDIT_MODE_HIGHLIGHT_BASE_OPACITY,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const editHighlightMesh = new THREE.LineSegments(
    editHighlightGeometry,
    editHighlightMaterial
  );
  editHighlightMesh.visible = false;
  editHighlightMesh.renderOrder = 999;
  if (scene?.isObject3D && typeof scene.add === "function") {
    scene.add(editHighlightMesh);
  }

  const PLACEMENT_VERTICAL_TOLERANCE = 1e-3;
  const ROOM_BOUNDARY_PADDING = 1e-3;
  const MIN_MANIFEST_PLACEMENT_DISTANCE = 2;
  const MANIFEST_PLACEMENT_DISTANCE_STEP = 0.5;
  const MANIFEST_PLACEMENT_ROTATION_STEP = Math.PI / 2;
  const STACKING_VERTICAL_TOLERANCE = 0.02;
  const PLACEMENT_PREVIEW_INPUT_POSITION_EPSILON_SQ = 1e-6;
  const PLACEMENT_PREVIEW_INPUT_DIRECTION_EPSILON_SQ = 1e-6;
  const PLACEMENT_PREVIEW_INPUT_ROTATION_EPSILON = 1e-6;
  const PLACEMENT_PREVIEW_SETTLE_MOVE_EPSILON_SQ = 4e-4;
  const PLACEMENT_PREVIEW_SETTLE_INTERVAL_MS = 120;
  const PLACEMENT_PREVIEW_SETTLE_MAX_ITERATIONS = 2;
  const PLACEMENT_WALL_SNAP_EDGE_THRESHOLD = 1.3;
  const PLACEMENT_WALL_SNAP_ALIGN_THRESHOLD = 0.96;
  const PLACEMENT_FLOOR_SNAP_EDGE_THRESHOLD = 1.2;
  const PLACEMENT_FLOOR_SNAP_ALIGN_THRESHOLD = 1.05;
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

  const snapManifestPlacementRotation = (value) =>
    Math.round((Number.isFinite(value) ? value : 0) / (Math.PI / 2)) *
    (Math.PI / 2);

  const normalizeManifestPlacementFloorId = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  let activeManifestFloorId = normalizeManifestPlacementFloorId(
    typeof getActiveFloorId === "function" ? getActiveFloorId() : null
  );

  const getPlacementFloorId = (container) =>
    normalizeManifestPlacementFloorId(container?.userData?.manifestFloorId);

  const setPlacementFloorId = (container, floorId) => {
    if (!container) {
      return null;
    }

    const userData = container.userData || (container.userData = {});
    const normalizedFloorId = normalizeManifestPlacementFloorId(floorId);

    if (normalizedFloorId) {
      userData.manifestFloorId = normalizedFloorId;
    } else {
      delete userData.manifestFloorId;
    }

    return normalizedFloorId;
  };

  const resolvePlacementFloorIdForPosition = (position) =>
    normalizeManifestPlacementFloorId(
      typeof resolveFloorIdForPosition === "function"
        ? resolveFloorIdForPosition(position)
        : null
    );

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
    const floorId = getPlacementFloorId(container);

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
      ...(floorId ? { floorId } : {}),
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

  const notifyExternalPlacementTransform = (container) => {
    if (!container || !externalEditablePlacements.has(container)) {
      return false;
    }

    const externalHandlers =
      container.userData?.externalEditablePlacementHandlers ?? null;
    if (typeof externalHandlers?.onTransform !== "function") {
      return false;
    }

    try {
      externalHandlers.onTransform({
        container,
        entry: container.userData?.manifestEntry ?? null,
      });
      return true;
    } catch (error) {
      console.warn("Unable to persist external placement transform", error);
      return false;
    }
  };

  const persistRealignedPlacementChanges = (
    changedContainers = [],
    { excludeContainer = null } = {}
  ) => {
    if (!Array.isArray(changedContainers) || changedContainers.length === 0) {
      return { manifestChanged: false };
    }

    let manifestChanged = false;
    const seen = new Set();

    changedContainers.forEach((container) => {
      if (!container || seen.has(container) || container === excludeContainer) {
        return;
      }
      seen.add(container);

      if (manifestPlacements.has(container)) {
        manifestChanged = true;
      } else if (externalEditablePlacements.has(container)) {
        notifyExternalPlacementTransform(container);
      }
    });

    if (manifestChanged) {
      notifyManifestPlacementsChanged();
    }

    return { manifestChanged };
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

  const resolveManifestEditHighlightTarget = () => {
    if (!manifestEditModeState.enabled) {
      return null;
    }

    if (activePlacement?.container?.isObject3D) {
      return activePlacement.container;
    }

    if (manifestEditModeState.selected?.isObject3D) {
      return manifestEditModeState.selected;
    }

    if (manifestEditModeState.hovered?.isObject3D) {
      return manifestEditModeState.hovered;
    }

    return null;
  };

  const getPlacementEntryPath = (container) => {
    const path =
      typeof container?.userData?.manifestEntry?.path === "string"
        ? container.userData.manifestEntry.path.trim()
        : "";
    return path;
  };

  const isWallLikePlacement = (container) => {
    const path = getPlacementEntryPath(container);
    return /wall/i.test(path);
  };

  const isFloorLikePlacement = (container) => {
    const path = getPlacementEntryPath(container);
    return /(floor|tile)/i.test(path);
  };

  const updateManifestEditSelectionHighlight = () => {
    const target = resolveManifestEditHighlightTarget();
    if (!target || !target.parent || target.visible === false) {
      editHighlightMesh.visible = false;
      return;
    }

    target.updateWorldMatrix(true, true);
    editHighlightBounds.setFromObject(target);
    if (editHighlightBounds.isEmpty()) {
      editHighlightMesh.visible = false;
      return;
    }

    editHighlightBounds.expandByScalar(EDIT_MODE_HIGHLIGHT_PADDING);
    editHighlightBounds.getCenter(editHighlightCenter);
    editHighlightBounds.getSize(editHighlightSize);
    editHighlightSize.x = Math.max(
      EDIT_MODE_HIGHLIGHT_MIN_SIZE,
      editHighlightSize.x
    );
    editHighlightSize.y = Math.max(
      EDIT_MODE_HIGHLIGHT_MIN_SIZE,
      editHighlightSize.y
    );
    editHighlightSize.z = Math.max(
      EDIT_MODE_HIGHLIGHT_MIN_SIZE,
      editHighlightSize.z
    );

    editHighlightMesh.position.copy(editHighlightCenter);
    editHighlightMesh.scale.copy(editHighlightSize);
    const pulse =
      0.5 + 0.5 * Math.sin(performance.now() * EDIT_MODE_HIGHLIGHT_PULSE_SPEED);
    editHighlightMaterial.opacity = THREE.MathUtils.clamp(
      EDIT_MODE_HIGHLIGHT_BASE_OPACITY +
        pulse * EDIT_MODE_HIGHLIGHT_PULSE_OPACITY,
      0,
      1
    );
    editHighlightMaterial.color.setRGB(
      0.22 + 0.18 * pulse,
      0.74 + 0.2 * pulse,
      0.98
    );
    editHighlightMaterial.needsUpdate = true;
    editHighlightMesh.visible = true;
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

    updateManifestEditSelectionHighlight();
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

    updateManifestEditSelectionHighlight();
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

  const isPlacementCollisionEnabled = (container) =>
    container?.userData?.mapMakerCollisionEnabled !== false;

  const isColliderDescriptorCollisionEnabled = (descriptor) =>
    descriptor?.mapMakerCollisionEnabled !== false &&
    descriptor?.root?.userData?.mapMakerCollisionEnabled !== false &&
    descriptor?.object?.userData?.mapMakerCollisionEnabled !== false;

  const isTerrainColliderDescriptor = (descriptor) => {
    const terrainHeight = Number(descriptor?.object?.userData?.terrainHeight);
    return Number.isFinite(terrainHeight);
  };

  const getPlacementColliderEntries = (container) => {
    if (!container) {
      return [];
    }

    const colliders = container.userData?.manifestPlacementColliders;
    if (!Array.isArray(colliders) || colliders.length === 0) {
      return [];
    }

    return colliders.filter((descriptor) => {
      const box = descriptor?.box;
      if (!box || box.isEmpty()) {
        return false;
      }
      return isColliderDescriptorCollisionEnabled(descriptor);
    });
  };

  const hasEnabledPlacementColliders = (container) =>
    getPlacementColliderEntries(container).length > 0;

  const pushUniquePlacementContainer = (collection, candidate, { exclude = null } = {}) => {
    if (!Array.isArray(collection) || !candidate || candidate === exclude) {
      return false;
    }

    if (collection.includes(candidate)) {
      return false;
    }

    collection.push(candidate);
    return true;
  };

  const getDescriptorContainer = (descriptor) =>
    descriptor?.root ?? getManifestPlacementRoot(descriptor?.object);

  const getEditableDescriptorHorizontalPadding = (descriptor) => {
    const padding =
      descriptor?.padding instanceof THREE.Vector3 ? descriptor.padding : null;
    const descriptorContainer = getDescriptorContainer(descriptor);
    const isEditableDescriptor =
      descriptorContainer && isEditablePlacement(descriptorContainer);

    return {
      x:
        isEditableDescriptor && Number.isFinite(padding?.x)
          ? Math.max(0, padding.x)
          : 0,
      z:
        isEditableDescriptor && Number.isFinite(padding?.z)
          ? Math.max(0, padding.z)
          : 0,
    };
  };

  const getDescriptorHorizontalFootprint = (descriptor) => {
    const box = descriptor?.box;
    if (!box || box.isEmpty()) {
      return null;
    }

    const horizontalPadding = getEditableDescriptorHorizontalPadding(descriptor);
    const paddedMinX = box.min.x + horizontalPadding.x;
    const paddedMaxX = box.max.x - horizontalPadding.x;
    const paddedMinZ = box.min.z + horizontalPadding.z;
    const paddedMaxZ = box.max.z - horizontalPadding.z;

    if (paddedMaxX > paddedMinX && paddedMaxZ > paddedMinZ) {
      return {
        minX: paddedMinX,
        maxX: paddedMaxX,
        minZ: paddedMinZ,
        maxZ: paddedMaxZ,
      };
    }

    return {
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
  };

  const shouldShowPlacementOnActiveFloor = (container) => {
    if (!container || !manifestPlacements.has(container)) {
      return true;
    }

    const placementFloorId = getPlacementFloorId(container);
    if (!placementFloorId || !activeManifestFloorId) {
      return true;
    }

    return placementFloorId === activeManifestFloorId;
  };

  const syncManifestPlacementFloorVisibility = () => {
    if (manifestPlacements.size === 0) {
      return;
    }

    let shouldRebuild = false;

    manifestPlacements.forEach((container) => {
      if (!container) {
        return;
      }

      const shouldBeVisible = shouldShowPlacementOnActiveFloor(container);
      if (container.visible !== shouldBeVisible) {
        container.visible = shouldBeVisible;
      }

      if (shouldBeVisible) {
        const colliders = Array.isArray(
          container.userData?.manifestPlacementColliders
        )
          ? container.userData.manifestPlacementColliders
          : [];

        if (colliders.length === 0) {
          const entries = refreshManifestPlacementColliders(container);
          if (Array.isArray(entries) && entries.length > 0) {
            shouldRebuild = true;
          }
        }
      } else if (clearManifestPlacementColliders(container)) {
        shouldRebuild = true;
      }
    });

    if (shouldRebuild && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }
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

  const resolveGroundSupportHeightForBounds = (
    worldPosition,
    bounds,
    fallbackHeight,
    { allowRaise = true, currentBottom = null } = {}
  ) => {
    if (!bounds || bounds.isEmpty() || !worldPosition) {
      return fallbackHeight;
    }

    const minX = worldPosition.x + bounds.min.x;
    const maxX = worldPosition.x + bounds.max.x;
    const minZ = worldPosition.z + bounds.min.z;
    const maxZ = worldPosition.z + bounds.max.z;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const probeY = Number.isFinite(worldPosition.y)
      ? worldPosition.y
      : fallbackHeight;
    const samplePoints = [
      [centerX, centerZ],
      [minX, minZ],
      [minX, maxZ],
      [maxX, minZ],
      [maxX, maxZ],
    ];

    let supportHeight = fallbackHeight;
    samplePoints.forEach(([sampleX, sampleZ]) => {
      const sampledHeight = resolvePlacementGroundHeight({
        x: sampleX,
        y: probeY,
        z: sampleZ,
      });
      if (!Number.isFinite(sampledHeight)) {
        return;
      }
      if (
        !allowRaise &&
        Number.isFinite(currentBottom) &&
        sampledHeight > currentBottom + STACKING_VERTICAL_TOLERANCE
      ) {
        return;
      }
      if (sampledHeight > supportHeight) {
        supportHeight = sampledHeight;
      }
    });

    return supportHeight;
  };

  const computePlacementPosition = (
    placement,
    basePosition,
    { allowRaise = true } = {}
  ) => {
    placementComputedPosition.copy(basePosition);

    let supportingColliders = null;
    let supportingContainers = null;

    if (placement) {
      if (Array.isArray(placement.supportColliders)) {
        supportingColliders = placement.supportColliders;
        supportingColliders.length = 0;
      } else {
        supportingColliders = [];
        placement.supportColliders = supportingColliders;
      }

      if (Array.isArray(placement.supportContainers)) {
        supportingContainers = placement.supportContainers;
        supportingContainers.length = 0;
      } else {
        supportingContainers = [];
        placement.supportContainers = supportingContainers;
      }
    }

    if (!placement || !placement.containerBounds) {
      if (supportingColliders) {
        supportingColliders.length = 0;
      }
      if (supportingContainers) {
        supportingContainers.length = 0;
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
      if (placement) {
        placement.supportHeight = roomFloorY;
      }
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
    const referenceBottom = Number.isFinite(basePosition?.y)
      ? basePosition.y + bounds.min.y
      : null;
    const currentBottom = placementComputedPosition.y + bounds.min.y;
    const sampledGroundSupportHeight = resolveGroundSupportHeightForBounds(
      placementComputedPosition,
      bounds,
      roomFloorY,
      {
        allowRaise,
        currentBottom,
      }
    );
    let supportHeight = Number.isFinite(sampledGroundSupportHeight)
      ? Math.max(roomFloorY, sampledGroundSupportHeight)
      : roomFloorY;
    let currentTop = supportHeight + boundsHeight;
    const resetSupportingSources = () => {
      if (supportingColliders) {
        supportingColliders.length = 0;
      }
      if (supportingContainers) {
        supportingContainers.length = 0;
      }
    };
    const addSupportingSource = (descriptor, supportContainer = null) => {
      if (supportingColliders && descriptor) {
        supportingColliders.push(descriptor);
      }
      if (supportingContainers && supportContainer) {
        pushUniquePlacementContainer(supportingContainers, supportContainer, {
          exclude: container,
        });
      }
    };

    colliderDescriptors.forEach((descriptor) => {
      const box = descriptor?.box;

      if (!box || box.isEmpty()) {
        return;
      }

      if (isTerrainColliderDescriptor(descriptor)) {
        return;
      }

      if (!isColliderDescriptorCollisionEnabled(descriptor)) {
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

      const descriptorFootprint = getDescriptorHorizontalFootprint(descriptor);
      if (!descriptorFootprint) {
        return;
      }

      if (
        footprintMaxX <= descriptorFootprint.minX ||
        footprintMinX >= descriptorFootprint.maxX ||
        footprintMaxZ <= descriptorFootprint.minZ ||
        footprintMinZ >= descriptorFootprint.maxZ
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

      if (
        !allowRaise &&
        Number.isFinite(referenceBottom) &&
        effectiveTop > referenceBottom + STACKING_VERTICAL_TOLERANCE
      ) {
        return;
      }

      if (effectiveTop > supportHeight) {
        supportHeight = effectiveTop;
        currentTop = supportHeight + boundsHeight;
        resetSupportingSources();
        addSupportingSource(descriptor, getDescriptorContainer(descriptor));
        return;
      }

      if (
        Math.abs(effectiveTop - supportHeight) <= STACKING_VERTICAL_TOLERANCE
      ) {
        addSupportingSource(descriptor, getDescriptorContainer(descriptor));
      }
    });

    // Fallback support: some imported models can be editable but expose no
    // collider descriptors. Use their bounds so every object can be stacked.
    getEditablePlacements().forEach((candidate) => {
      if (
        !candidate ||
        candidate === container ||
        candidate.visible === false ||
        !isPlacementCollisionEnabled(candidate) ||
        hasEnabledPlacementColliders(candidate)
      ) {
        return;
      }

      const candidateBounds = computeManifestPlacementBounds(candidate);
      if (!candidateBounds || candidateBounds.isEmpty()) {
        return;
      }

      const candidatePosition = getContainerWorldPosition(
        candidate,
        settleWorldPosition
      );
      if (!candidatePosition) {
        return;
      }

      const candidateMinX = candidatePosition.x + candidateBounds.min.x;
      const candidateMaxX = candidatePosition.x + candidateBounds.max.x;
      const candidateMinZ = candidatePosition.z + candidateBounds.min.z;
      const candidateMaxZ = candidatePosition.z + candidateBounds.max.z;

      if (
        footprintMaxX <= candidateMinX ||
        footprintMinX >= candidateMaxX ||
        footprintMaxZ <= candidateMinZ ||
        footprintMinZ >= candidateMaxZ
      ) {
        return;
      }

      const supportBottom = candidatePosition.y + candidateBounds.min.y;
      if (supportBottom >= currentTop - PLACEMENT_VERTICAL_TOLERANCE) {
        return;
      }

      const effectiveTop = candidatePosition.y + candidateBounds.max.y;

      if (
        !allowRaise &&
        Number.isFinite(referenceBottom) &&
        effectiveTop > referenceBottom + STACKING_VERTICAL_TOLERANCE
      ) {
        return;
      }

      if (effectiveTop > supportHeight) {
        supportHeight = effectiveTop;
        currentTop = supportHeight + boundsHeight;
        resetSupportingSources();
        addSupportingSource(null, candidate);
        return;
      }

      if (
        Math.abs(effectiveTop - supportHeight) <= STACKING_VERTICAL_TOLERANCE
      ) {
        addSupportingSource(null, candidate);
      }
    });

    placementComputedPosition.y = supportHeight - bounds.min.y;
    if (placement) {
      placement.supportHeight = supportHeight;
    }
    return placementComputedPosition;
  };

  const gatherPlacementContainers = (candidates = [], { exclude = null } = {}) => {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }

    const unique = new Set();
    const collected = [];

    candidates.forEach((candidate) => {
      const container = candidate?.container ?? candidate;
      if (!container || container === exclude || unique.has(container)) {
        return;
      }
      if (!isEditablePlacement(container)) {
        return;
      }
      unique.add(container);
      collected.push(container);
    });

    return collected;
  };

  const getContainerWorldPosition = (container, target) => {
    if (!container?.isObject3D || !(target instanceof THREE.Vector3)) {
      return null;
    }

    container.updateMatrixWorld(true);
    container.getWorldPosition(target);
    return target;
  };

  const setContainerWorldPosition = (container, worldPosition) => {
    if (!container?.isObject3D || !(worldPosition instanceof THREE.Vector3)) {
      return false;
    }

    const parent = container.parent;
    if (parent?.isObject3D && parent !== scene) {
      parent.updateWorldMatrix(true, false);
      settleLocalTargetPosition.copy(worldPosition);
      parent.worldToLocal(settleLocalTargetPosition);
      container.position.copy(settleLocalTargetPosition);
    } else {
      container.position.copy(worldPosition);
    }

    container.updateMatrixWorld(true);
    return true;
  };

  const isDescriptorOwnedByContainer = (descriptor, container) => {
    if (!descriptor || !container) {
      return false;
    }

    if (descriptor.root === container) {
      return true;
    }

    const descriptorObject = descriptor.object;
    if (!descriptorObject || typeof descriptorObject !== "object") {
      return false;
    }

    return isObjectDescendantOf(descriptorObject, container);
  };

  const resolvePlacementSupportHeight = (
    container,
    bounds,
    worldPosition,
    { extraSupportDescriptors = null } = {}
  ) => {
    const { floorY: roomFloorY } = getRoomDimensions();
    const fallbackHeight = Number.isFinite(roomFloorY) ? roomFloorY : 0;

    if (!container || !bounds || bounds.isEmpty() || !worldPosition) {
      return fallbackHeight;
    }

    const currentBottom = worldPosition.y + bounds.min.y;
    const currentTop = worldPosition.y + bounds.max.y;
    let supportHeight = fallbackHeight;

    supportHeight = Math.max(
      supportHeight,
      resolveGroundSupportHeightForBounds(worldPosition, bounds, fallbackHeight, {
        // Terrain support should always be allowed to push objects up to the
        // surface so settle logic does not sink wide models into slopes.
        allowRaise: true,
        currentBottom,
      })
    );

    const footprintMinX = worldPosition.x + bounds.min.x;
    const footprintMaxX = worldPosition.x + bounds.max.x;
    const footprintMinZ = worldPosition.z + bounds.min.z;
    const footprintMaxZ = worldPosition.z + bounds.max.z;

    const evaluateSupportDescriptor = (descriptor) => {
      const box = descriptor?.box;
      if (!box || box.isEmpty()) {
        return;
      }

      if (isTerrainColliderDescriptor(descriptor)) {
        return;
      }

      if (!isColliderDescriptorCollisionEnabled(descriptor)) {
        return;
      }

      if (isDescriptorOwnedByContainer(descriptor, container)) {
        return;
      }

      const descriptorFootprint = getDescriptorHorizontalFootprint(descriptor);
      if (!descriptorFootprint) {
        return;
      }

      if (
        footprintMaxX <= descriptorFootprint.minX ||
        footprintMinX >= descriptorFootprint.maxX ||
        footprintMaxZ <= descriptorFootprint.minZ ||
        footprintMinZ >= descriptorFootprint.maxZ
      ) {
        return;
      }

      const paddingY =
        descriptor.padding instanceof THREE.Vector3
          ? descriptor.padding.y
          : 0;
      const colliderBottom = box.min.y + paddingY;
      const colliderTop = box.max.y - paddingY;

      if (!Number.isFinite(colliderTop)) {
        return;
      }

      if (
        !Number.isFinite(colliderBottom) ||
        colliderBottom >= currentTop - PLACEMENT_VERTICAL_TOLERANCE
      ) {
        return;
      }

      if (colliderTop > currentBottom + STACKING_VERTICAL_TOLERANCE) {
        return;
      }

      if (colliderTop > supportHeight) {
        supportHeight = colliderTop;
      }
    };

    colliderDescriptors.forEach(evaluateSupportDescriptor);

    if (
      Array.isArray(extraSupportDescriptors) &&
      extraSupportDescriptors.length > 0
    ) {
      extraSupportDescriptors.forEach(evaluateSupportDescriptor);
    }

    return supportHeight;
  };

  const settlePlacementsDownward = (
    candidates = [],
    { exclude = null, maxIterations = 10, extraSupportDescriptors = null } = {}
  ) => {
    const placements = gatherPlacementContainers(candidates, { exclude });
    if (placements.length === 0) {
      return [];
    }

    const changedContainers = [];
    const changedSet = new Set();
    const epsilon = 1e-4;
    const iterationLimit = Math.max(1, Math.floor(maxIterations));

    for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
      let iterationChanged = false;

      placements.sort((first, second) => {
        const firstPosition =
          getContainerWorldPosition(first, settleSortPositionA) ?? settleSortPositionA.set(0, 0, 0);
        const secondPosition =
          getContainerWorldPosition(second, settleSortPositionB) ?? settleSortPositionB.set(0, 0, 0);
        return firstPosition.y - secondPosition.y;
      });

      if (typeof rebuildStaticColliders === "function") {
        rebuildStaticColliders();
      }

      placements.forEach((container) => {
        const bounds = computeManifestPlacementBounds(container);
        if (bounds.isEmpty()) {
          return;
        }

        const worldPosition = getContainerWorldPosition(container, settleWorldPosition);
        if (!worldPosition) {
          return;
        }

        const supportHeight = resolvePlacementSupportHeight(
          container,
          bounds,
          worldPosition,
          { extraSupportDescriptors }
        );
        const targetWorldY = supportHeight - bounds.min.y;

        if (targetWorldY >= worldPosition.y - epsilon) {
          return;
        }

        settleWorldTargetPosition.copy(worldPosition);
        settleWorldTargetPosition.y = targetWorldY;
        setContainerWorldPosition(container, settleWorldTargetPosition);

        if (!changedSet.has(container)) {
          changedSet.add(container);
          changedContainers.push(container);
        }
        iterationChanged = true;

        if (typeof rebuildStaticColliders === "function") {
          rebuildStaticColliders();
        }
      });

      if (!iterationChanged) {
        break;
      }
    }

    return changedContainers;
  };

  const resolvePlacementPreviewSnap = (placement) => {
    if (!placement?.container || !placement.containerBounds) {
      return false;
    }

    placement.snappedSupportBottom = null;

    const container = placement.container;
    const bounds = placement.containerBounds;
    if (bounds.isEmpty()) {
      return false;
    }

    const snapMode = isWallLikePlacement(container)
      ? "wall"
      : isFloorLikePlacement(container)
        ? "floor"
        : null;
    if (!snapMode) {
      return false;
    }

    const edgeSnapThreshold =
      snapMode === "floor"
        ? PLACEMENT_FLOOR_SNAP_EDGE_THRESHOLD
        : PLACEMENT_WALL_SNAP_EDGE_THRESHOLD;
    const alignSnapThreshold =
      snapMode === "floor"
        ? PLACEMENT_FLOOR_SNAP_ALIGN_THRESHOLD
        : PLACEMENT_WALL_SNAP_ALIGN_THRESHOLD;

    const currentX = container.position.x;
    const currentZ = container.position.z;
    if (!Number.isFinite(currentX) || !Number.isFinite(currentZ)) {
      return false;
    }

    const currentMinX = currentX + bounds.min.x;
    const currentMaxX = currentX + bounds.max.x;
    const currentMinZ = currentZ + bounds.min.z;
    const currentMaxZ = currentZ + bounds.max.z;
    const dependents = Array.isArray(placement.dependents)
      ? placement.dependents
      : [];

    let bestEdgeSnapX = null;
    let bestEdgeSnapZ = null;
    let bestAlignSnapX = null;
    let bestAlignSnapZ = null;

    const considerSnap = (currentCandidate, nextCandidate) => {
      if (!nextCandidate) {
        return currentCandidate;
      }
      if (!currentCandidate) {
        return nextCandidate;
      }
      return nextCandidate.distance < currentCandidate.distance
        ? nextCandidate
        : currentCandidate;
    };

    const isPlacementObject = (target) => {
      if (!target) {
        return false;
      }
      if (target === container || isObjectDescendantOf(target, container)) {
        return true;
      }
      return dependents.some((dependent) => {
        const dependentContainer = dependent?.container ?? null;
        return (
          dependentContainer &&
          (target === dependentContainer ||
            isObjectDescendantOf(target, dependentContainer))
        );
      });
    };

    getEditablePlacements().forEach((candidate) => {
      if (
        !candidate ||
        candidate === container ||
        candidate.visible === false ||
        isPlacementObject(candidate)
      ) {
        return;
      }
      const isSnapCompatibleCandidate =
        snapMode === "floor"
          ? isFloorLikePlacement(candidate)
          : isWallLikePlacement(candidate);
      if (!isSnapCompatibleCandidate) {
        return;
      }

      const candidateBounds = computeManifestPlacementBounds(candidate);
      if (candidateBounds.isEmpty()) {
        return;
      }
      const candidatePosition = getContainerWorldPosition(
        candidate,
        settleWorldTargetPosition
      );
      if (!candidatePosition) {
        return;
      }

      const candidateMinX = candidatePosition.x + candidateBounds.min.x;
      const candidateMaxX = candidatePosition.x + candidateBounds.max.x;
      const candidateMinZ = candidatePosition.z + candidateBounds.min.z;
      const candidateMaxZ = candidatePosition.z + candidateBounds.max.z;

      const overlapX =
        Math.min(currentMaxX, candidateMaxX) -
        Math.max(currentMinX, candidateMinX);
      const overlapZ =
        Math.min(currentMaxZ, candidateMaxZ) -
        Math.max(currentMinZ, candidateMinZ);

      const alignDeltaX = Math.abs(currentX - candidatePosition.x);
      const alignDeltaZ = Math.abs(currentZ - candidatePosition.z);

      if (
        overlapZ >= -alignSnapThreshold ||
        alignDeltaZ <= alignSnapThreshold
      ) {
        const leftDistance = Math.abs(currentMinX - candidateMaxX);
        if (leftDistance <= edgeSnapThreshold) {
          bestEdgeSnapX = considerSnap(bestEdgeSnapX, {
            value: candidateMaxX - bounds.min.x,
            distance: leftDistance,
          });
        }

        const rightDistance = Math.abs(currentMaxX - candidateMinX);
        if (rightDistance <= edgeSnapThreshold) {
          bestEdgeSnapX = considerSnap(bestEdgeSnapX, {
            value: candidateMinX - bounds.max.x,
            distance: rightDistance,
          });
        }
      }

      if (
        overlapX >= -alignSnapThreshold ||
        alignDeltaX <= alignSnapThreshold
      ) {
        const backDistance = Math.abs(currentMinZ - candidateMaxZ);
        if (backDistance <= edgeSnapThreshold) {
          bestEdgeSnapZ = considerSnap(bestEdgeSnapZ, {
            value: candidateMaxZ - bounds.min.z,
            distance: backDistance,
          });
        }

        const frontDistance = Math.abs(currentMaxZ - candidateMinZ);
        if (frontDistance <= edgeSnapThreshold) {
          bestEdgeSnapZ = considerSnap(bestEdgeSnapZ, {
            value: candidateMinZ - bounds.max.z,
            distance: frontDistance,
          });
        }
      }

      if (alignDeltaX <= alignSnapThreshold) {
        bestAlignSnapX = considerSnap(bestAlignSnapX, {
          value: candidatePosition.x,
          distance: alignDeltaX,
        });
      }

      if (alignDeltaZ <= alignSnapThreshold) {
        bestAlignSnapZ = considerSnap(bestAlignSnapZ, {
          value: candidatePosition.z,
          distance: alignDeltaZ,
        });
      }
    });

    let nextX = currentX;
    let nextZ = currentZ;
    let didSnap = false;

    if (bestEdgeSnapX) {
      nextX = bestEdgeSnapX.value;
      didSnap = true;
    } else if (bestAlignSnapX) {
      nextX = bestAlignSnapX.value;
      didSnap = true;
    }

    if (bestEdgeSnapZ) {
      nextZ = bestEdgeSnapZ.value;
      didSnap = true;
    } else if (bestAlignSnapZ) {
      nextZ = bestAlignSnapZ.value;
      didSnap = true;
    }

    if (!didSnap) {
      return false;
    }

    container.position.x = nextX;
    container.position.z = nextZ;

    if (snapMode === "floor") {
      const snappedMinX = nextX + bounds.min.x;
      const snappedMaxX = nextX + bounds.max.x;
      const snappedMinZ = nextZ + bounds.min.z;
      const snappedMaxZ = nextZ + bounds.max.z;

      let bestLevelSnap = null;
      getEditablePlacements().forEach((candidate) => {
        if (
          !candidate ||
          candidate === container ||
          candidate.visible === false ||
          isPlacementObject(candidate) ||
          !isFloorLikePlacement(candidate)
        ) {
          return;
        }

        const candidateBounds = computeManifestPlacementBounds(candidate);
        if (candidateBounds.isEmpty()) {
          return;
        }

        const candidatePosition = getContainerWorldPosition(
          candidate,
          settleWorldTargetPosition
        );
        if (!candidatePosition) {
          return;
        }

        const candidateMinX = candidatePosition.x + candidateBounds.min.x;
        const candidateMaxX = candidatePosition.x + candidateBounds.max.x;
        const candidateMinZ = candidatePosition.z + candidateBounds.min.z;
        const candidateMaxZ = candidatePosition.z + candidateBounds.max.z;

        const overlapX =
          Math.min(snappedMaxX, candidateMaxX) -
          Math.max(snappedMinX, candidateMinX);
        const overlapZ =
          Math.min(snappedMaxZ, candidateMaxZ) -
          Math.max(snappedMinZ, candidateMinZ);
        const alignDeltaX = Math.abs(nextX - candidatePosition.x);
        const alignDeltaZ = Math.abs(nextZ - candidatePosition.z);
        const edgeGapX = Math.min(
          Math.abs(snappedMinX - candidateMaxX),
          Math.abs(snappedMaxX - candidateMinX)
        );
        const edgeGapZ = Math.min(
          Math.abs(snappedMinZ - candidateMaxZ),
          Math.abs(snappedMaxZ - candidateMinZ)
        );

        const nearByX =
          (overlapZ >= -alignSnapThreshold && edgeGapX <= edgeSnapThreshold) ||
          (alignDeltaZ <= alignSnapThreshold && edgeGapX <= edgeSnapThreshold);
        const nearByZ =
          (overlapX >= -alignSnapThreshold && edgeGapZ <= edgeSnapThreshold) ||
          (alignDeltaX <= alignSnapThreshold && edgeGapZ <= edgeSnapThreshold);
        const centerAligned =
          alignDeltaX <= alignSnapThreshold && alignDeltaZ <= alignSnapThreshold;

        if (!nearByX && !nearByZ && !centerAligned) {
          return;
        }

        const snapDistance = Math.min(
          Math.max(0, edgeGapX),
          Math.max(0, edgeGapZ),
          Math.hypot(alignDeltaX, alignDeltaZ)
        );
        const candidateBottom = candidatePosition.y + candidateBounds.min.y;
        const levelCandidate = {
          distance: snapDistance,
          bottom: candidateBottom,
        };

        if (!bestLevelSnap || levelCandidate.distance < bestLevelSnap.distance) {
          bestLevelSnap = levelCandidate;
        }
      });

      if (bestLevelSnap && Number.isFinite(bestLevelSnap.bottom)) {
        const snappedBottom = bestLevelSnap.bottom;
        container.position.y = snappedBottom - bounds.min.y;
        placement.snappedSupportBottom = snappedBottom;
        placement.supportHeight = snappedBottom;
      }
    }

    container.updateMatrixWorld(true);
    return true;
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
    const supportingContainers = Array.isArray(placement.supportContainers)
      ? placement.supportContainers
      : null;

    placementCollisionBox.min.copy(bounds.min).add(position);
    placementCollisionBox.max.copy(bounds.max).add(position);
    const placementSupportHeight = Number.isFinite(placement.supportHeight)
      ? placement.supportHeight
      : placementCollisionBox.min.y;

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

    const isSupportingContainerDescriptor = (descriptor) => {
      if (!supportingContainers || supportingContainers.length === 0) {
        return false;
      }

      for (let index = 0; index < supportingContainers.length; index += 1) {
        const supportContainer = supportingContainers[index];
        if (isDescriptorOwnedByContainer(descriptor, supportContainer)) {
          return true;
        }
      }

      return false;
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

        if (isTerrainColliderDescriptor(descriptor)) {
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

        const descriptorFootprint = getDescriptorHorizontalFootprint(descriptor);
        if (!descriptorFootprint) {
          continue;
        }

        const overlapX =
          Math.min(placementCollisionBox.max.x, descriptorFootprint.maxX) -
          Math.max(placementCollisionBox.min.x, descriptorFootprint.minX);
        const overlapZ =
          Math.min(placementCollisionBox.max.z, descriptorFootprint.maxZ) -
          Math.max(placementCollisionBox.min.z, descriptorFootprint.minZ);
        const overlapY =
          Math.min(placementCollisionBox.max.y, box.max.y) -
          Math.max(placementCollisionBox.min.y, box.min.y);

        if (
          (supportingColliders && supportingColliders.includes(descriptor)) ||
          isSupportingContainerDescriptor(descriptor)
        ) {
          const paddingY =
            descriptor.padding instanceof THREE.Vector3
              ? descriptor.padding.y
              : 0;
          const effectiveTop = box.max.y - paddingY;
          const placementBottomY = placementCollisionBox.min.y;
          const supportGap =
            Number.isFinite(effectiveTop) && Number.isFinite(placementSupportHeight)
              ? Math.max(0, placementSupportHeight - effectiveTop)
              : 0;
          const allowedOverlap =
            paddingY + STACKING_VERTICAL_TOLERANCE + supportGap;
          const isPlacedOnSupportSurface =
            Number.isFinite(effectiveTop) &&
            placementBottomY >=
              effectiveTop - (paddingY + STACKING_VERTICAL_TOLERANCE);

          // Only ignore tiny vertical overlap when the placement is actually
          // resting on the support surface (stacking), not intersecting it.
          if (overlapY <= allowedOverlap && isPlacedOnSupportSurface) {
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
          const overlapLeft =
            placementCollisionBox.max.x - descriptorFootprint.minX;
          const overlapRight =
            descriptorFootprint.maxX - placementCollisionBox.min.x;
          let shiftX = 0;

          if (previousBox && previousBox.max.x <= descriptorFootprint.minX) {
            shiftX = descriptorFootprint.minX - placementCollisionBox.max.x;
          } else if (
            previousBox &&
            previousBox.min.x >= descriptorFootprint.maxX
          ) {
            shiftX = descriptorFootprint.maxX - placementCollisionBox.min.x;
          } else if (overlapLeft < overlapRight) {
            shiftX = descriptorFootprint.minX - placementCollisionBox.max.x;
          } else {
            shiftX = descriptorFootprint.maxX - placementCollisionBox.min.x;
          }

          if (shiftX !== 0) {
            applyOffset(shiftX, 0);
            iterationAdjusted = true;
          }
        } else {
          const overlapBack =
            placementCollisionBox.max.z - descriptorFootprint.minZ;
          const overlapFront =
            descriptorFootprint.maxZ - placementCollisionBox.min.z;
          let shiftZ = 0;

          if (previousBox && previousBox.max.z <= descriptorFootprint.minZ) {
            shiftZ = descriptorFootprint.minZ - placementCollisionBox.max.z;
          } else if (
            previousBox &&
            previousBox.min.z >= descriptorFootprint.maxZ
          ) {
            shiftZ = descriptorFootprint.maxZ - placementCollisionBox.min.z;
          } else if (overlapBack < overlapFront) {
            shiftZ = descriptorFootprint.minZ - placementCollisionBox.max.z;
          } else {
            shiftZ = descriptorFootprint.maxZ - placementCollisionBox.min.z;
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

  const registerManifestPlacement = (
    container,
    colliderEntries = [],
    { floorId = null } = {}
  ) => {
    if (!container) {
      return;
    }

    externalEditablePlacements.delete(container);
    manifestPlacements.add(container);
    setPlacementFloorId(
      container,
      floorId ?? getPlacementFloorId(container) ?? activeManifestFloorId
    );
    applyPlacementColliderEntries(container, colliderEntries);

    const shouldBeVisible = shouldShowPlacementOnActiveFloor(container);
    container.visible = shouldBeVisible;

    if (!shouldBeVisible && clearManifestPlacementColliders(container)) {
      if (typeof rebuildStaticColliders === "function") {
        rebuildStaticColliders();
      }
    }
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

    const settledPlacements = settlePlacementsDownward(getEditablePlacements(), {
      exclude: container,
    });

    if (settledPlacements.length > 0 && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }
    const { manifestChanged: realignedManifestChanged } =
      persistRealignedPlacementChanges(settledPlacements);

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

    if (isStoredManifestPlacement && !realignedManifestChanged) {
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

    const collidersWereRemoved = clearManifestPlacementColliders(container);

    const containerBounds = computeManifestPlacementBounds(container);

    const previousState = {
      position: container.position.clone(),
      quaternion: container.quaternion.clone(),
      scale: container.scale.clone(),
    };
    const previewBaselinePositions = new Map();
    getEditablePlacements().forEach((candidate) => {
      if (!candidate || candidate === container) {
        return;
      }
      previewBaselinePositions.set(candidate, candidate.position.clone());
    });

    const reparentedContainers = [];
    const reparentedContainer = reparentPlacementContainerForEditing(container);
    if (reparentedContainer) {
      reparentedContainers.push(reparentedContainer);
      container.updateMatrixWorld(true);
    }

    const playerPosition = controls.getObject().position;
    camera.getWorldDirection(placementRepositionDirection);
    placementRepositionDirection.y = 0;
    if (placementRepositionDirection.lengthSq() < 1e-6) {
      placementRepositionDirection.set(0, 0, -1);
    } else {
      placementRepositionDirection.normalize();
    }

    placementRepositionVectorToObject
      .copy(container.position)
      .sub(playerPosition);
    const projectedDistance = placementRepositionVectorToObject.dot(
      placementRepositionDirection
    );
    const placementDistance = Number.isFinite(projectedDistance)
      ? Math.max(MIN_MANIFEST_PLACEMENT_DISTANCE, projectedDistance)
      : MIN_MANIFEST_PLACEMENT_DISTANCE;
    placementRepositionCenterline
      .copy(playerPosition)
      .addScaledVector(placementRepositionDirection, placementDistance);
    const previewFollowOffset = container.position
      .clone()
      .sub(placementRepositionCenterline);

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
      previewBasePosition: container.position.clone(),
      previewFollowOffset,
      pointerHandler: null,
      wheelHandler: null,
      keydownHandler: null,
      isReposition: true,
      previousState,
      skipEventTypes: new Set(placementPointerEvents),
      dependents: [],
      collidersWereRemoved,
      reparentedContainers,
      moveDependentsWithPlacement: false,
      previewBaselinePositions,
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

    placement.wheelHandler = (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }

      if (!event.deltaY) {
        return;
      }

      const delta =
        -Math.sign(event.deltaY) * MANIFEST_PLACEMENT_DISTANCE_STEP;
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
      if (event.code === "KeyQ" || event.code === "KeyE") {
        event.preventDefault();
        event.stopPropagation();
        const rotationDelta =
          event.code === "KeyQ"
            ? MANIFEST_PLACEMENT_ROTATION_STEP
            : -MANIFEST_PLACEMENT_ROTATION_STEP;
        placement.container.rotation.y = snapManifestPlacementRotation(
          placement.container.rotation.y + rotationDelta
        );
        placement.container.updateMatrixWorld(true);
        placement.containerBounds = computeManifestPlacementBounds(
          placement.container
        );
        updateActivePlacementPreview();
        return;
      }

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
    canvas?.addEventListener("wheel", placement.wheelHandler, {
      passive: false,
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
    updateManifestEditSelectionHighlight();

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
    updateManifestEditSelectionHighlight();

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

  const restoreRepositionPreviewBaseline = (placement) => {
    if (!placement?.isReposition) {
      return false;
    }

    const baselinePositions = placement.previewBaselinePositions;
    if (!(baselinePositions instanceof Map) || baselinePositions.size === 0) {
      return false;
    }

    let restoredAny = false;

    baselinePositions.forEach((baselinePosition, container) => {
      if (
        !container?.isObject3D ||
        container === placement.container ||
        !(baselinePosition instanceof THREE.Vector3)
      ) {
        return;
      }

      if (container.position.distanceToSquared(baselinePosition) <= 1e-10) {
        return;
      }

      container.position.copy(baselinePosition);
      container.updateMatrixWorld(true);
      restoredAny = true;
    });

    if (restoredAny && typeof rebuildStaticColliders === "function") {
      rebuildStaticColliders();
    }

    return restoredAny;
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
      restoreRepositionPreviewBaseline(placement);
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

    if (placement.isReposition) {
      restoreRepositionPreviewBaseline(placement);
      placement.container.updateMatrixWorld(true);
    }

    const finalPosition = computePlacementPosition(
      placement,
      placement.previewPosition
    );

    if (
      isFloorLikePlacement(placement.container) &&
      Number.isFinite(placement.snappedSupportBottom) &&
      placement.containerBounds &&
      !placement.containerBounds.isEmpty()
    ) {
      finalPosition.y =
        placement.snappedSupportBottom - placement.containerBounds.min.y;
      placement.supportHeight = placement.snappedSupportBottom;
    }

    placement.previewPosition.copy(finalPosition);
    placement.container.position.copy(placement.previewPosition);
    placement.container.updateMatrixWorld(true);

    if (placement.isReposition) {
      restoreReparentedPlacementContainers(placement);
      placement.container.updateMatrixWorld(true);
    }

    const resolvedPlacementFloorId =
      getPlacementFloorId(placement.container) ?? activeManifestFloorId;
    setPlacementFloorId(placement.container, resolvedPlacementFloorId);

    let colliderEntries = [];
    if (typeof registerCollidersForImportedRoot === "function") {
      colliderEntries = registerCollidersForImportedRoot(placement.container, {
        padding: manifestPlacementPadding,
      });
    }
    if (placement.isReposition) {
      applyPlacementColliderEntries(placement.container, colliderEntries);
    } else {
      registerManifestPlacement(placement.container, colliderEntries, {
        floorId: resolvedPlacementFloorId,
      });
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

    if (manifestPlacements.has(placement.container)) {
      syncManifestPlacementFloorVisibility();
    }

    if (placement.isReposition) {
      const settledPlacements = settlePlacementsDownward(
        getEditablePlacements()
      );

      if (
        settledPlacements.length > 0 &&
        typeof rebuildStaticColliders === "function"
      ) {
        rebuildStaticColliders();
      }

      persistRealignedPlacementChanges(settledPlacements);
    }

    if (placement.isReposition) {
      setSelectedManifestPlacement(null);
      setHoveredManifestPlacement(null);
      updateManifestEditModeHover();

      notifyExternalPlacementTransform(placement.container);
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
    if (
      placement.isReposition &&
      placement.previewFollowOffset instanceof THREE.Vector3
    ) {
      placementPreviewBasePosition.add(placement.previewFollowOffset);
    }

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

    const previousRotationY = Number.isFinite(placement.lastPreviewRotationY)
      ? placement.lastPreviewRotationY
      : placement.container.rotation.y;
    const previewInputChanged =
      !(placement.lastPreviewBasePosition instanceof THREE.Vector3) ||
      placement.lastPreviewBasePosition.distanceToSquared(
        placementPreviewBasePosition
      ) > PLACEMENT_PREVIEW_INPUT_POSITION_EPSILON_SQ ||
      !(placement.lastPreviewDirection instanceof THREE.Vector3) ||
      placement.lastPreviewDirection.distanceToSquared(directionVector) >
        PLACEMENT_PREVIEW_INPUT_DIRECTION_EPSILON_SQ ||
      Math.abs((placement.lastPreviewDistance ?? placement.distance) - placement.distance) >
        1e-6 ||
      Math.abs(placement.container.rotation.y - previousRotationY) >
        PLACEMENT_PREVIEW_INPUT_ROTATION_EPSILON;

    if (!previewInputChanged) {
      updateManifestEditSelectionHighlight();
      return;
    }

    if (placement.isReposition) {
      restoreRepositionPreviewBaseline(placement);
    }

    placementPreviousPreviewPosition.copy(placement.previewPosition);

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

    placementSnapPreviousPosition.copy(placement.container.position);
    const snappedToNeighbor = resolvePlacementPreviewSnap(placement);
    if (snappedToNeighbor) {
      resolvePlacementPreviewCollisions(
        placement,
        placementSnapPreviousPosition
      );
      placement.previewPosition.copy(placement.container.position);
    }

    placement.container.updateMatrixWorld(true);

    if (!(placement.lastPreviewBasePosition instanceof THREE.Vector3)) {
      placement.lastPreviewBasePosition = new THREE.Vector3();
    }
    placement.lastPreviewBasePosition.copy(placementPreviewBasePosition);

    if (!(placement.lastPreviewDirection instanceof THREE.Vector3)) {
      placement.lastPreviewDirection = new THREE.Vector3();
    }
    placement.lastPreviewDirection.copy(directionVector);

    placement.lastPreviewDistance = placement.distance;
    placement.lastPreviewRotationY = placement.container.rotation.y;

    if (
      placement.moveDependentsWithPlacement &&
      Array.isArray(placement.dependents) &&
      placement.dependents.length > 0
    ) {
      const previewBasePosition =
        placement.previewBasePosition ??
        placement.previousState?.position ??
        placement.container.position;
      placementDependentOffset
        .copy(placement.container.position)
        .sub(previewBasePosition);

      placement.dependents.forEach((dependent) => {
        if (!dependent?.container) {
          return;
        }

        const dependentBasePosition =
          dependent.previewBasePosition ?? dependent.initialPosition ?? null;
        if (!dependentBasePosition) {
          return;
        }

        const previewPosition =
          dependent.previewPosition ??
          (dependent.previewPosition = new THREE.Vector3());
        previewPosition
          .copy(dependentBasePosition)
          .add(placementDependentOffset);

        const previousResolvedPosition = dependent.lastResolvedPosition
          ? placementDependentPreviousPosition.copy(
              dependent.lastResolvedPosition
            )
          : placementDependentPreviousPosition
              .copy(dependentBasePosition)
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

    if (placement.isReposition) {
      const now =
        typeof performance !== "undefined" && Number.isFinite(performance.now())
          ? performance.now()
          : Date.now();
      const lastSettleAt = Number.isFinite(placement.lastPreviewSettleAt)
        ? placement.lastPreviewSettleAt
        : -Infinity;
      const lastSettlePosition =
        placement.lastPreviewSettlePosition instanceof THREE.Vector3
          ? placement.lastPreviewSettlePosition
          : null;
      const movedSinceSettle =
        !lastSettlePosition ||
        placement.container.position.distanceToSquared(lastSettlePosition) >
          PLACEMENT_PREVIEW_SETTLE_MOVE_EPSILON_SQ;
      const shouldRunPreviewSettle =
        movedSinceSettle &&
        now - lastSettleAt >= PLACEMENT_PREVIEW_SETTLE_INTERVAL_MS;

      if (shouldRunPreviewSettle) {
        const previewSupportDescriptors = [];
        const supportBounds = computeManifestPlacementBounds(placement.container);
        const supportWorldPosition = getContainerWorldPosition(
          placement.container,
          settleWorldPosition
        );

        if (supportWorldPosition && !supportBounds.isEmpty()) {
          placementPreviewSupportBox.min
            .copy(supportBounds.min)
            .add(supportWorldPosition);
          placementPreviewSupportBox.max
            .copy(supportBounds.max)
            .add(supportWorldPosition);
          previewSupportDescriptors.push({
            root: placement.container,
            object: placement.container,
            box: placementPreviewSupportBox,
            padding: manifestPlacementPadding,
          });
        }

        const previewSettledPlacements = settlePlacementsDownward(
          getEditablePlacements(),
          {
            maxIterations: PLACEMENT_PREVIEW_SETTLE_MAX_ITERATIONS,
            extraSupportDescriptors: previewSupportDescriptors,
          }
        );

        if (
          previewSettledPlacements.length > 0 &&
          typeof rebuildStaticColliders === "function"
        ) {
          rebuildStaticColliders();
        }

        placement.previewPosition.copy(placement.container.position);
        placement.lastPreviewSettleAt = now;
        if (!(placement.lastPreviewSettlePosition instanceof THREE.Vector3)) {
          placement.lastPreviewSettlePosition = new THREE.Vector3();
        }
        placement.lastPreviewSettlePosition.copy(placement.container.position);
      }
    }

    updateManifestEditSelectionHighlight();
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
    const restoredContainers = [];

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
        const snapshotFloorId = normalizeManifestPlacementFloorId(
          snapshot?.floorId
        );
        const resolvedFloorId =
          snapshotFloorId ??
          resolvePlacementFloorIdForPosition(basePosition) ??
          activeManifestFloorId;
        setPlacementFloorId(container, resolvedFloorId);
        const computedPosition = computePlacementPosition(
          { container, containerBounds },
          basePosition
        );
        const hasStoredY = Number.isFinite(storedPosition?.y);
        container.position.set(
          computedPosition.x,
          hasStoredY ? storedPosition.y : computedPosition.y,
          computedPosition.z
        );
        container.updateMatrixWorld(true);
        scene?.add(container);

        let colliderEntries = [];
        if (typeof registerCollidersForImportedRoot === "function") {
          colliderEntries = registerCollidersForImportedRoot(container, {
            padding: manifestPlacementPadding,
          });
        }

        registerManifestPlacement(container, colliderEntries, {
          floorId: resolvedFloorId,
        });
        restoredContainers.push(container);

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

    const settledRestoredPlacements = settlePlacementsDownward(
      restoredContainers.filter((container) => container?.visible !== false),
      { maxIterations: 12 }
    );
    if (
      settledRestoredPlacements.length > 0 &&
      typeof rebuildStaticColliders === "function"
    ) {
      rebuildStaticColliders();
    }

    syncManifestPlacementFloorVisibility();

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
      setPlacementFloorId(container, activeManifestFloorId);
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
            -Math.sign(event.deltaY) * MANIFEST_PLACEMENT_DISTANCE_STEP;
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
          if (event.code === "KeyQ" || event.code === "KeyE") {
            event.preventDefault();
            event.stopPropagation();
            const rotationDelta =
              event.code === "KeyQ"
                ? MANIFEST_PLACEMENT_ROTATION_STEP
                : -MANIFEST_PLACEMENT_ROTATION_STEP;
            placement.container.rotation.y = snapManifestPlacementRotation(
              placement.container.rotation.y + rotationDelta
            );
            placement.container.updateMatrixWorld(true);
            placement.containerBounds = computeManifestPlacementBounds(
              placement.container
            );
            updateActivePlacementPreview();
            return;
          }

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
    if (
      editHighlightMesh.parent &&
      typeof editHighlightMesh.parent.remove === "function"
    ) {
      editHighlightMesh.parent.remove(editHighlightMesh);
    }
    editHighlightGeometry.dispose();
    editHighlightMaterial.dispose();
  };

  const setActiveFloorId = (floorId) => {
    const normalizedFloorId = normalizeManifestPlacementFloorId(floorId);
    if (normalizedFloorId === activeManifestFloorId) {
      return activeManifestFloorId;
    }

    activeManifestFloorId = normalizedFloorId;
    syncManifestPlacementFloorVisibility();
    return activeManifestFloorId;
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
    setActiveFloorId,
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
