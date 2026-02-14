import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { Reflector } from "https://unpkg.com/three@0.161.0/examples/jsm/objects/Reflector.js";
import { PointerLockControls } from "./pointer-lock-controls.js";
import {
  DEFAULT_CAMERA_PITCH,
  DEFAULT_PLAYER_HEIGHT,
  loadStoredPlayerHeight,
  loadStoredPlayerState,
  normalizePitchForPersistence,
  persistPlayerHeight,
  persistPlayerState,
  resetPlayerStateCache,
} from "./player-state-storage.js";
import {
  loadStoredDroneState,
  persistDroneSceneState,
} from "./drone-state-storage.js";
import {
  PlacementCancelledError,
  createManifestPlacementManager,
} from "./manifest/placements.js";
import {
  resolveAssetUrl,
  loadGLTFModel,
  loadOBJModel,
  loadModelFromManifestEntry,
} from "./assets/model-loader.js";
import {
  colliderDescriptors,
  registerCollidersForImportedRoot,
  registerColliderDescriptors,
  unregisterColliderDescriptors,
  rebuildStaticColliders,
} from "./physics/colliders.js";
import {
  createDefaultOutsideMap,
  loadOutsideMapFromStorage,
  normalizeOutsideMap,
  saveOutsideMapToStorage,
  OUTSIDE_TERRAIN_ELEMENTS_BY_ID,
  getOutsideTerrainById,
  getOutsideTerrainDefaultTileId,
  getOutsideTerrainTilePath,
} from "./outside-map.js";
import { getTerrainLifeKey, loadStoredTerrainLife } from "./terrain-life-storage.js";
import {
  loadStoredGeoVisorRevealState,
  persistGeoVisorRevealState,
} from "./geo-visor-storage.js";

const PLAYER_STATE_SAVE_INTERVAL = 1; // seconds
const DEFAULT_ELEMENT_WEIGHT = 1;
const TERRAIN_LAYER = 1;
const REFLECTION_PLAYER_LAYER = 2;
const GEO_VISOR_REVEAL_SAVE_DELAY_MS = 120;

const getElementWeightFromAtomicNumber = (number) => {
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_ELEMENT_WEIGHT;
  }

  return number;
};

const sampleTerrainElement = (terrainId, randomFn = Math.random) => {
  if (typeof terrainId !== "string" || !terrainId) {
    return null;
  }

  const elements = OUTSIDE_TERRAIN_ELEMENTS_BY_ID.get(terrainId) ?? [];
  if (elements.length === 0) {
    return null;
  }

  const weights = elements.map((element) => {
    if (!element || !Number.isFinite(element.number) || element.number <= 0) {
      return 0;
    }
    return 1 / element.number;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return null;
  }

  const randomValue = randomFn();
  const clampedRandom =
    Number.isFinite(randomValue) && randomValue >= 0 && randomValue <= 1
      ? randomValue
      : Math.random();
  const target = clampedRandom * totalWeight;
  let cumulative = 0;

  for (let index = 0; index < elements.length; index += 1) {
    cumulative += weights[index];
    if (target <= cumulative) {
      const element = elements[index];
      return element ? { ...element } : null;
    }
  }

  const fallback = elements[elements.length - 1];
  return fallback ? { ...fallback } : null;
};

export const initScene = (
  canvas,
  {
    onControlsLocked,
    onControlsUnlocked,
    onTerminalOptionSelected,
    onTerminalInteractableChange,
    onLiftControlInteract,
    onLiftInteractableChange,
    onLiftTravel,
    onManifestPlacementHoverChange,
    onManifestEditModeChange,
    onManifestPlacementRemoved,
    onResourceCollected,
    onResourceSessionCancelled,
    onResourceUnavailable,
    onDroneReturnComplete,
    settings,
  } = {}
) => {
  const BASE_MAX_STEP_HEIGHT = 2;
  const BASE_JUMP_VELOCITY = 7.2;
  const STEP_CLIMB_SPEED = 6;
  const STEP_CLIMB_SPEED_MULTIPLIER = 10;
  const STEP_HEIGHT_TOLERANCE = 0.05;
  const performanceSettings = {
    maxPixelRatio: Number.isFinite(settings?.maxPixelRatio)
      ? Math.max(0.5, settings.maxPixelRatio)
      : 1.25,
  };

  const sceneSettings = {
    showStars: settings?.showStars !== false,
  };

  const normalizeSpeedMultiplier = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 1;
    }

    return Math.max(1, Math.min(10, numericValue));
  };

  const normalizeJumpMultiplier = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 1;
    }

    return Math.max(1, numericValue);
  };

  const normalizeJumpApexSmoothing = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 6;
    }

    return Math.max(0, Math.min(12, numericValue));
  };

  const normalizeJumpApexVelocity = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 1.4;
    }

    return Math.max(0.1, Math.min(5, numericValue));
  };

  const normalizeViewDistance = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0.2;
    }

    return Math.max(0.01, Math.min(3, numericValue));
  };

  const normalizeReflectorResolutionScale = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 1;
    }

    return Math.max(0.25, Math.min(1, numericValue));
  };

  const parseStarSetting = (value, fallback) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return numericValue;
  };

  const normalizeTimeOffset = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.min(14, Math.max(-12, numericValue));
  };

  const getStarPlaneHeight = () => 75 * starSettings.height;

  const starSettings = {
    size: parseStarSetting(settings?.starSize, 1),
    density: parseStarSetting(settings?.starDensity, 1),
    opacity: parseStarSetting(settings?.starOpacity, 1),
    extent: parseStarSetting(settings?.skyExtent, 1),
    height: parseStarSetting(settings?.skyDomeHeight, 1),
    followPlayer: settings?.starFollowPlayer !== false,
  };

  const timeSettings = {
    gmtOffsetHours: normalizeTimeOffset(settings?.timeZoneOffsetHours),
  };

  const speedSettings = {
    playerSpeedMultiplier: normalizeSpeedMultiplier(
      settings?.playerSpeedMultiplier
    ),
  };
  const jumpSettings = {
    playerJumpMultiplier: normalizeJumpMultiplier(
      settings?.playerJumpMultiplier
    ),
    jumpApexSmoothing: normalizeJumpApexSmoothing(
      settings?.jumpApexSmoothing
    ),
    jumpApexVelocity: normalizeJumpApexVelocity(
      settings?.jumpApexVelocity
    ),
  };
  const BASE_VIEW_DISTANCE = 200;
  const VIEW_DISTANCE_CULLING_BUFFER = 2.0;
  const BASE_SKY_DOME_RADIUS = 650;
  const BASE_FOG_DENSITY = 0.006;
  const MIN_FOG_DENSITY = 0.002;
  const viewSettings = {
    distanceMultiplier: normalizeViewDistance(settings?.viewDistance),
  };
  let godModeEnabled = settings?.godMode === true;
  const BASE_SUN_SCALE = 18;
  const MIN_SUN_SCALE = 6;
  let sunSprite = null;
  let updateFogForDistance = () => {};
  let updateViewDistanceCulling = () => {};
  const getSkyDomeRadius = (distanceMultiplier = viewSettings.distanceMultiplier) => {
    const multiplier = Number.isFinite(distanceMultiplier)
      ? distanceMultiplier
      : viewSettings.distanceMultiplier;

    return Math.max(
      BASE_SKY_DOME_RADIUS,
      BASE_VIEW_DISTANCE * multiplier * 1.2
    );
  };
  const getFogDensity = (
    distanceMultiplier = viewSettings.distanceMultiplier
  ) => {
    const normalizedDistance = normalizeViewDistance(distanceMultiplier);
    return Math.max(MIN_FOG_DENSITY, BASE_FOG_DENSITY / normalizedDistance);
  };
  const getJumpVelocity = () =>
    BASE_JUMP_VELOCITY * jumpSettings.playerJumpMultiplier;
  const updateSunSpriteScale = () => {
    if (!sunSprite) {
      return;
    }

    const scaledSize = Math.max(
      MIN_SUN_SCALE,
      BASE_SUN_SCALE / viewSettings.distanceMultiplier
    );
    sunSprite.scale.set(scaledSize, scaledSize, 1);
  };

  const applyViewDistance = (nextSettings = {}) => {
    const nextDistance = normalizeViewDistance(
      nextSettings.viewDistance ?? nextSettings.distanceMultiplier
    );
    const forceUpdate = nextSettings.force === true;

    if (!forceUpdate && nextDistance === viewSettings.distanceMultiplier) {
      return viewSettings.distanceMultiplier;
    }

    viewSettings.distanceMultiplier = nextDistance;
    const targetSkyRadius = getSkyDomeRadius(viewSettings.distanceMultiplier);
    camera.far = Math.max(
      BASE_VIEW_DISTANCE * viewSettings.distanceMultiplier,
      targetSkyRadius * 1.05
    );
    camera.updateProjectionMatrix();
    updateSunSpriteScale();
    updateFogForDistance(viewSettings.distanceMultiplier);
    updateViewDistanceCulling({ force: true });
    return viewSettings.distanceMultiplier;
  };

  const starSpriteTexture = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    const center = canvas.width / 2;
    const gradient = context.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center
    );

    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;

    return texture;
  })();

  const createTerrainDepthTarget = () => {
    const pixelRatio = renderer.getPixelRatio();
    const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
    const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));
    const target = new THREE.WebGLRenderTarget(width, height);
    target.texture.minFilter = THREE.NearestFilter;
    target.texture.magFilter = THREE.NearestFilter;
    target.texture.generateMipmaps = false;
    target.depthTexture = new THREE.DepthTexture(width, height);
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.type = THREE.UnsignedShortType;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
    return target;
  };

  const terrainDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });
  terrainDepthMaterial.blending = THREE.NoBlending;

  const registeredStarFields = new Set();
  let allowStarsForTimeOfDay = true;
  let starVisibilityForTime = 1;
  const registerStarField = (starField) => {
    if (!starField?.isObject3D) {
      return;
    }

    starField.visible = Boolean(sceneSettings.showStars);
    registeredStarFields.add(starField);
  };

  const unregisterStarFields = (fields = []) => {
    fields.forEach((field) => {
      registeredStarFields.delete(field);
    });
  };

  const refreshStarField = (starField) => {
    const config = starField?.userData?.starConfig ?? null;
    const parent = starField?.parent ?? null;

    if (!config || !parent) {
      return null;
    }

    const yOffset = Number.isFinite(starField.userData?.starYOffset)
      ? starField.userData.starYOffset
      : null;

    unregisterStarFields([starField]);
    parent.remove(starField);
    starField.geometry?.dispose?.();
    starField.material?.dispose?.();

    const refreshed = createStarField(config);
    applyStarDepthMaterial(refreshed);

    if (refreshed) {
      if (Number.isFinite(yOffset)) {
        if (!refreshed.userData) {
          refreshed.userData = {};
        }

        refreshed.userData.starYOffset = yOffset;
      }

      parent.add(refreshed);
    }

    return refreshed;
  };

  const refreshAllStarFields = () => {
    const starFields = Array.from(registeredStarFields);
    starFields.forEach((field) => refreshStarField(field));
    applyStarVisibility();
    updateStarFieldPositions();
  };

  const applyStarSettings = (nextSettings = {}) => {
    const nextSize = parseStarSetting(
      nextSettings.starSize ?? nextSettings.size,
      starSettings.size
    );
    const nextDensity = parseStarSetting(
      nextSettings.starDensity ?? nextSettings.density,
      starSettings.density
    );
    const nextOpacity = parseStarSetting(
      nextSettings.starOpacity ?? nextSettings.opacity,
      starSettings.opacity
    );
    const nextExtent = parseStarSetting(
      nextSettings.skyExtent ?? nextSettings.extent,
      starSettings.extent
    );
    const nextHeight = parseStarSetting(
      nextSettings.skyDomeHeight ?? nextSettings.height,
      starSettings.height
    );
    const nextFollow =
      nextSettings.starFollowPlayer === undefined
        ? starSettings.followPlayer
        : nextSettings.starFollowPlayer !== false;

    const changed =
      nextSize !== starSettings.size ||
      nextDensity !== starSettings.density ||
      nextOpacity !== starSettings.opacity ||
      nextExtent !== starSettings.extent ||
      nextHeight !== starSettings.height ||
      nextFollow !== starSettings.followPlayer;

    if (!changed) {
      return false;
    }

    starSettings.size = nextSize;
    starSettings.density = nextDensity;
    starSettings.opacity = nextOpacity;
    starSettings.extent = nextExtent;
    starSettings.height = nextHeight;
    starSettings.followPlayer = nextFollow;

    const starPlaneY = getStarPlaneHeight();
    const starYOffset = starPlaneY - roomFloorY;
    registeredStarFields.forEach((starField) => {
      if (!starField?.userData) {
        return;
      }

      starField.userData.starYOffset = starYOffset;

      if (starField.userData.starConfig) {
        starField.userData.starConfig.center = (
          starField.userData.starConfig.center?.clone?.() ??
          starField.userData.starConfig.center ??
          new THREE.Vector3()
        ).setY(starPlaneY);
        starField.userData.starConfig.planeY = starPlaneY;
      }
    });

    refreshAllStarFields();
    return true;
  };

  const applyStarVisibility = () => {
    const starsAllowed = Boolean(sceneSettings.showStars) && allowStarsForTimeOfDay;
    const effectiveVisibility = starsAllowed
      ? THREE.MathUtils.clamp(starVisibilityForTime, 0, 1)
      : 0;

    registeredStarFields.forEach((starField) => {
      if (!starField) {
        return;
      }

      const material = starField.material ?? null;
      const baseOpacity = starField.userData?.baseOpacity;
      let sourceOpacity = Number.isFinite(baseOpacity)
        ? baseOpacity
        : Number.isFinite(material?.opacity)
          ? material.opacity
          : 1;

      if (!Number.isFinite(baseOpacity) && material) {
        if (!starField.userData) {
          starField.userData = {};
        }

        starField.userData.baseOpacity = sourceOpacity;
      }

      if (material) {
        material.opacity = sourceOpacity * effectiveVisibility;
      }

      starField.visible = effectiveVisibility > 0.01;
    });
  };

  const setStarsEnabledForTimeOfDay = (enabled = true) => {
    allowStarsForTimeOfDay = Boolean(enabled);
    applyStarVisibility();
  };

  const setStarVisibilityForTimeOfDay = (visibility = 1) => {
    starVisibilityForTime = THREE.MathUtils.clamp(visibility, 0, 1);
    applyStarVisibility();
  };

  const updateStarFieldPositions = () => {
    const playerPosition = playerObject?.position;

    if (!playerPosition) {
      return;
    }

    registeredStarFields.forEach((starField) => {
      if (!starField?.position) {
        return;
      }

      const baseCenter = starField?.userData?.starConfig?.center ?? null;
      const targetBaseX = Number.isFinite(baseCenter?.x) ? baseCenter.x : 0;
      const targetBaseZ = Number.isFinite(baseCenter?.z) ? baseCenter.z : 0;
      const planeY = Number.isFinite(starField?.userData?.starConfig?.planeY)
        ? starField.userData.starConfig.planeY
        : Number.isFinite(baseCenter?.y)
          ? baseCenter.y
          : playerPosition.y;
      const hasStoredOffset = Number.isFinite(starField?.userData?.starYOffset);

      if (!hasStoredOffset) {
        const offsetY = planeY - playerPosition.y;

        if (!starField.userData) {
          starField.userData = {};
        }

        starField.userData.starYOffset = offsetY;
      }

      const yOffset = Number.isFinite(starField.userData?.starYOffset)
        ? starField.userData.starYOffset
        : 0;

      if (starSettings.followPlayer) {
        starField.position.set(
          playerPosition.x,
          playerPosition.y + yOffset,
          playerPosition.z
        );
      } else {
        starField.position.set(targetBaseX, planeY, targetBaseZ);
      }
    });
  };

  const createStarField = ({
    radius,
    count = 1400,
    center = new THREE.Vector3(),
    size = 0.06,
    opacity = 0.78,
    colorVariance = 0.08,
    distribution = "spherical",
    planeY = center?.y ?? 0,
  } = {}) => {
    const baseCenter = center?.clone?.() ?? center ?? new THREE.Vector3();
    const baseCount = Number.isFinite(count) ? count : 1400;
    const appliedRadius =
      Math.max(1, Number.isFinite(radius) && radius > 0 ? radius : 1) * starSettings.extent;
    const appliedCount = Math.max(24, Math.round(baseCount * starSettings.density));
    const appliedSize = Math.max(0.01, size * starSettings.size);
    const appliedOpacity = Math.min(1, Math.max(0.05, opacity * starSettings.opacity));

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(appliedCount * 3);
    const starColors = new Float32Array(appliedCount * 3);
    const tempColor = new THREE.Color();
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const offset = 2 / appliedCount;
    const planarHeight = Number.isFinite(planeY) ? planeY : baseCenter?.y ?? 0;
    const effectiveRadius = appliedRadius;

    for (let i = 0; i < appliedCount; i += 1) {
      const index = i * 3;
      const isDome = distribution === "dome" || distribution === "planar";

      if (isDome) {
        const phi = Math.random() * Math.PI * 2;
        const cosTheta = Math.random();
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const distanceMultiplier = Math.min(1, 0.2 + Math.random() * 0.9);
        const distance = effectiveRadius * distanceMultiplier;

        starPositions[index] = distance * sinTheta * Math.cos(phi);
        starPositions[index + 1] = planarHeight + Math.abs(distance * cosTheta);
        starPositions[index + 2] = distance * sinTheta * Math.sin(phi);
      } else {
        const y = i * offset - 1 + offset / 2;
        const radiusFactor = Math.sqrt(1 - y * y);
        const phi = i * goldenAngle;
        const distance = appliedRadius * (0.55 + Math.random() * 0.45);

        starPositions[index] = distance * Math.cos(phi) * radiusFactor;
        starPositions[index + 1] = distance * y;
        starPositions[index + 2] = distance * Math.sin(phi) * radiusFactor;
      }

      const hue = 0.58 + (Math.random() - 0.5) * colorVariance;
      const saturation = 0.08 + Math.random() * 0.12;
      const lightness = 0.7 + Math.random() * 0.2;
      tempColor.setHSL(hue, saturation, lightness);

      starColors[index] = tempColor.r;
      starColors[index + 1] = tempColor.g;
      starColors[index + 2] = tempColor.b;
    }

    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: appliedSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: appliedOpacity,
      depthTest: true,
      depthWrite: false,
      alphaTest: 0.01,
      map: starSpriteTexture,
      vertexColors: true,
    });

    const starField = new THREE.Points(starGeometry, starMaterial);
    if (distribution === "dome" || distribution === "planar") {
      starField.position.set(baseCenter.x, 0, baseCenter.z);
    } else {
      starField.position.copy(baseCenter);
    }
    starField.frustumCulled = false;
    starField.renderOrder = -1;

    starField.userData = {
      ...(starField.userData ?? {}),
      starConfig: {
        radius,
        count: baseCount,
        center: baseCenter.clone?.() ?? baseCenter,
        size,
        opacity,
        colorVariance,
        distribution,
        planeY,
      },
      baseOpacity: appliedOpacity,
    };

    registerStarField(starField);

    return starField;
  };

  const createStarDepthMaterial = (sourceMaterial) => {
    const size = Number.isFinite(sourceMaterial?.size)
      ? sourceMaterial.size
      : 0.06;
    const opacity = Number.isFinite(sourceMaterial?.opacity)
      ? sourceMaterial.opacity
      : 1;
    const alphaTest = Number.isFinite(sourceMaterial?.alphaTest)
      ? sourceMaterial.alphaTest
      : 0.01;
    const map = sourceMaterial?.map ?? starSpriteTexture;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: {
        uSize: { value: size },
        uOpacity: { value: opacity },
        uAlphaTest: { value: alphaTest },
        uPointTexture: { value: map },
        uDepthTexture: { value: null },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far },
        uProjectionMatrix: { value: new THREE.Matrix4() },
        uViewMatrix: { value: new THREE.Matrix4() },
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
        uniform float uSize;
        uniform float uPixelRatio;
        uniform mat4 uProjectionMatrix;
        uniform mat4 uViewMatrix;
        varying vec3 vColor;
        varying vec2 vScreenUv;

        void main() {
          vColor = color;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vec4 viewPosition = uViewMatrix * worldPosition;
          vec4 clipPosition = uProjectionMatrix * viewPosition;
          gl_Position = clipPosition;
          vScreenUv = clipPosition.xy / clipPosition.w * 0.5 + 0.5;
          float perspectiveScale = viewPosition.z < 0.0 ? (1.0 / -viewPosition.z) : 1.0;
          gl_PointSize = uSize * perspectiveScale * uPixelRatio;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uAlphaTest;
        uniform sampler2D uPointTexture;
        uniform sampler2D uDepthTexture;
        uniform float uCameraNear;
        uniform float uCameraFar;
        varying vec3 vColor;
        varying vec2 vScreenUv;

        float perspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {
          return (near * far) / ((far - near) * depth - far);
        }

        void main() {
          vec4 texColor = texture2D(uPointTexture, gl_PointCoord);
          vec4 color = vec4(vColor, uOpacity) * texColor;
          if (color.a <= uAlphaTest) {
            discard;
          }
          if (
            vScreenUv.x >= 0.0 &&
            vScreenUv.x <= 1.0 &&
            vScreenUv.y >= 0.0 &&
            vScreenUv.y <= 1.0
          ) {
            float terrainDepth = texture2D(uDepthTexture, vScreenUv).r;
            if (terrainDepth < 1.0) {
              float terrainViewZ = perspectiveDepthToViewZ(terrainDepth, uCameraNear, uCameraFar);
              float starViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, uCameraNear, uCameraFar);
              float terrainLinear = -terrainViewZ;
              float starLinear = -starViewZ;
              if (starLinear > terrainLinear + 0.05) {
                discard;
              }
            }
          }
          gl_FragColor = color;
        }
      `,
    });

    material.opacity = opacity;

    return material;
  };

  const applyStarDepthMaterial = (starField) => {
    if (!starField?.material) {
      return;
    }

    if (
      starField.material?.isShaderMaterial &&
      starField.material?.uniforms?.uDepthTexture
    ) {
      return;
    }

    const sourceMaterial = starField.material;
    const depthMaterial = createStarDepthMaterial(sourceMaterial);
    starField.material = depthMaterial;
    sourceMaterial.dispose?.();
  };

  const updateStarDepthUniforms = () => {
    registeredStarFields.forEach((starField) => {
      const material = starField?.material;
      if (
        !material?.isShaderMaterial ||
        !material.uniforms?.uDepthTexture
      ) {
        return;
      }

      material.uniforms.uDepthTexture.value = terrainDepthTarget.depthTexture;
      material.uniforms.uCameraNear.value = camera.near;
      material.uniforms.uCameraFar.value = camera.far;
      material.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
      material.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      material.uniforms.uOpacity.value = material.opacity;
    });
  };

  const enableTerrainLayerForTiles = (tiles = []) => {
    tiles.forEach((tile) => {
      if (!tile) {
        return;
      }

      tile.layers.enable(TERRAIN_LAYER);
      tile.traverse?.((child) => {
        child.layers.enable(TERRAIN_LAYER);
      });
    });
  };

  const updateTerrainDepthTexture = () => {
    if (!terrainDepthTarget) {
      return;
    }

    const previousRenderTarget = renderer.getRenderTarget();
    const previousOverrideMaterial = scene.overrideMaterial;
    const previousLayerMask = camera.layers.mask;

    camera.layers.set(TERRAIN_LAYER);
    scene.overrideMaterial = terrainDepthMaterial;
    renderer.setRenderTarget(terrainDepthTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(previousRenderTarget);
    scene.overrideMaterial = previousOverrideMaterial;
    camera.layers.mask = previousLayerMask;
  };

  const createRenderer = () => {
    const testCanvas = document.createElement("canvas");
    const webglContextTypes = ["webgl2", "webgl", "experimental-webgl"];
    const contextOptions = [
      { powerPreference: "high-performance", failIfMajorPerformanceCaveat: false },
      { powerPreference: "default", failIfMajorPerformanceCaveat: false },
      { powerPreference: "default", failIfMajorPerformanceCaveat: true },
    ];

    const hasWebglSupport = webglContextTypes.some((contextType) =>
      contextOptions.some((options) => {
        const context = testCanvas.getContext(contextType, options);

        if (context) {
          return true;
        }

        return false;
      })
    );

    if (!hasWebglSupport) {
      throw new Error(
        "WebGL is not available. Enable hardware acceleration or use a browser with WebGL support."
      );
    }

    const rendererOptions = [
      {
        canvas,
        antialias: true,
        powerPreference: "high-performance",
      },
      {
        canvas,
        antialias: false,
        powerPreference: "high-performance",
      },
      {
        canvas,
        antialias: false,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
      },
    ];

    let lastError = null;

    for (const options of rendererOptions) {
      try {
        return new THREE.WebGLRenderer(options);
      } catch (error) {
        lastError = error;
        console.warn("WebGLRenderer init failed", options, error);
      }
    }

    const error = new Error(
      "Could not create a WebGL context. Try enabling hardware acceleration or updating your graphics drivers."
    );

    if (lastError) {
      error.cause = lastError;
    }

    throw error;
  };

  const renderer = createRenderer();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  const effectivePixelRatioCap = performanceSettings.maxPixelRatio;
  const devicePixelRatio =
    typeof window.devicePixelRatio === "number" && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, Math.max(0.5, effectivePixelRatioCap))
  );
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const terrainDepthTarget = createTerrainDepthTarget();

  const scene = new THREE.Scene();
  const skyBackgroundColor = new THREE.Color(0x000000);
  scene.background = skyBackgroundColor;
  scene.fog = new THREE.FogExp2(
    skyBackgroundColor,
    getFogDensity(viewSettings.distanceMultiplier)
  );

  updateFogForDistance = (
    distanceMultiplier = viewSettings.distanceMultiplier
  ) => {
    if (!scene.fog) {
      return;
    }

    scene.fog.density = getFogDensity(distanceMultiplier);
    scene.fog.color.copy(skyBackgroundColor);
  };

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    // Use a tighter near clip plane so nearby objects (like the terminal
    // monitor) don't disappear when the player gets close to interact.
    0.05,
    BASE_VIEW_DISTANCE * viewSettings.distanceMultiplier
  );
  const MIN_PLAYER_HEIGHT = 0.1;
  const ROOM_SCALE_FACTOR = 0.25;
  camera.position.set(0, 0, 8 * ROOM_SCALE_FACTOR);

  const textureLoader = new THREE.TextureLoader();
  const TOWER_RADIO_SOUND_SOURCE = "sounds/radio.mp3";
  const TOWER_RADIO_MIN_DISTANCE = 4;
  const TOWER_RADIO_MAX_DISTANCE = 78;
  const TOWER_RADIO_MAX_VOLUME = 0.55;
  const towerRadioAudio = new Audio();
  towerRadioAudio.preload = "auto";
  towerRadioAudio.loop = true;
  towerRadioAudio.src = TOWER_RADIO_SOUND_SOURCE;
  towerRadioAudio.volume = 0;
  towerRadioAudio.load();
  let towerRadioUnlocked = false;
  let towerRadioPlaying = false;
  let operationsExteriorRadioTower = null;
  const towerRadioWorldPosition = new THREE.Vector3();
  const unlockTowerRadioAudio = () => {
    if (towerRadioUnlocked) {
      return;
    }

    towerRadioUnlocked = true;
    const previousMutedState = towerRadioAudio.muted;
    towerRadioAudio.muted = true;
    const resetSound = () => {
      towerRadioAudio.pause();
      towerRadioAudio.currentTime = 0;
      towerRadioAudio.muted = previousMutedState;
    };
    const unlockPromise = towerRadioAudio.play();
    if (unlockPromise) {
      unlockPromise.then(resetSound).catch(() => {
        towerRadioAudio.muted = previousMutedState;
      });
    } else {
      resetSound();
    }
  };
  const startTowerRadioAudio = () => {
    if (!towerRadioUnlocked || towerRadioPlaying) {
      return;
    }

    towerRadioPlaying = true;
    const playPromise = towerRadioAudio.play();
    if (playPromise) {
      playPromise.catch((error) => {
        console.warn("Unable to play tower radio audio", error);
      });
    }
  };
  const stopTowerRadioAudio = () => {
    if (!towerRadioPlaying) {
      return;
    }

    towerRadioAudio.pause();
    towerRadioPlaying = false;
  };
  const updateTowerRadioAudio = () => {
    const activeFloor = getActiveLiftFloor();
    const isExteriorActive = activeFloor?.id === "operations-exterior";
    if (
      !isExteriorActive ||
      !controls.isLocked ||
      !operationsExteriorRadioTower
    ) {
      towerRadioAudio.volume = 0;
      stopTowerRadioAudio();
      return;
    }

    operationsExteriorRadioTower.getWorldPosition(towerRadioWorldPosition);
    const distance = towerRadioWorldPosition.distanceTo(playerObject.position);
    if (distance >= TOWER_RADIO_MAX_DISTANCE) {
      towerRadioAudio.volume = 0;
      stopTowerRadioAudio();
      return;
    }

    const normalized = (distance - TOWER_RADIO_MIN_DISTANCE) /
      (TOWER_RADIO_MAX_DISTANCE - TOWER_RADIO_MIN_DISTANCE);
    const clamped = THREE.MathUtils.clamp(normalized, 0, 1);
    const falloff = 1 - clamped;
    const volume = falloff * falloff * TOWER_RADIO_MAX_VOLUME;
    towerRadioAudio.volume = volume;

    if (volume > 0.01) {
      startTowerRadioAudio();
    } else {
      stopTowerRadioAudio();
    }
  };

  const TIME_OF_DAY_REFRESH_SECONDS = 5;

  const createSunSprite = () => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");

    if (context) {
      const gradient = context.createRadialGradient(
        size / 2,
        size / 2,
        size * 0.1,
        size / 2,
        size / 2,
        size * 0.5
      );
      gradient.addColorStop(0, "rgba(255, 244, 199, 0.95)");
      gradient.addColorStop(0.35, "rgba(255, 221, 138, 0.8)");
      gradient.addColorStop(1, "rgba(255, 193, 94, 0)");

      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    material.fog = false;

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(BASE_SUN_SCALE, BASE_SUN_SCALE, 1);
    sprite.renderOrder = -1;

    return sprite;
  };

  const skyGradientUniforms = {
    topColor: { value: new THREE.Color("#0b1024") },
    bottomColor: { value: new THREE.Color("#0f172a") },
    brightness: { value: 1 },
    opacity: { value: 0 },
    exponent: { value: 1.45 },
  };

  const createSkyPaletteEntry = ({ top, bottom, brightness, sunVisibility }) => ({
    topColor: new THREE.Color(top),
    bottomColor: new THREE.Color(bottom),
    brightness,
    sunVisibility,
  });

  const hourlySkyPalette = [
    createSkyPaletteEntry({
      top: "#130b0b",
      bottom: "#1a0f0f",
      brightness: 0.1,
      sunVisibility: 0,
    }),
    createSkyPaletteEntry({
      top: "#150d0d",
      bottom: "#1d1210",
      brightness: 0.1,
      sunVisibility: 0,
    }),
    createSkyPaletteEntry({
      top: "#1a0f0d",
      bottom: "#210f0d",
      brightness: 0.11,
      sunVisibility: 0,
    }),
    createSkyPaletteEntry({
      top: "#1f120c",
      bottom: "#24150c",
      brightness: 0.12,
      sunVisibility: 0.01,
    }),
    createSkyPaletteEntry({
      top: "#2a1a0c",
      bottom: "#2b1a0e",
      brightness: 0.18,
      sunVisibility: 0.05,
    }),
    createSkyPaletteEntry({
      top: "#3a240d",
      bottom: "#35200f",
      brightness: 0.28,
      sunVisibility: 0.12,
    }),
    createSkyPaletteEntry({
      top: "#55310f",
      bottom: "#4a2810",
      brightness: 0.4,
      sunVisibility: 0.32,
    }),
    createSkyPaletteEntry({
      top: "#734017",
      bottom: "#5b3212",
      brightness: 0.55,
      sunVisibility: 0.5,
    }),
    createSkyPaletteEntry({
      top: "#8f521b",
      bottom: "#7a4216",
      brightness: 0.68,
      sunVisibility: 0.65,
    }),
    createSkyPaletteEntry({
      top: "#a96a22",
      bottom: "#8e5318",
      brightness: 0.78,
      sunVisibility: 0.78,
    }),
    createSkyPaletteEntry({
      top: "#c7852e",
      bottom: "#a56a23",
      brightness: 0.86,
      sunVisibility: 0.88,
    }),
    createSkyPaletteEntry({
      top: "#dba042",
      bottom: "#b7802c",
      brightness: 0.94,
      sunVisibility: 0.95,
    }),
    createSkyPaletteEntry({
      top: "#e6b857",
      bottom: "#c49a3b",
      brightness: 1,
      sunVisibility: 1,
    }),
    createSkyPaletteEntry({
      top: "#eac36b",
      bottom: "#cda54b",
      brightness: 0.98,
      sunVisibility: 0.97,
    }),
    createSkyPaletteEntry({
      top: "#e4b862",
      bottom: "#c59b45",
      brightness: 0.93,
      sunVisibility: 0.9,
    }),
    createSkyPaletteEntry({
      top: "#d7a451",
      bottom: "#b4863c",
      brightness: 0.85,
      sunVisibility: 0.82,
    }),
    createSkyPaletteEntry({
      top: "#c48a3f",
      bottom: "#9d6c32",
      brightness: 0.74,
      sunVisibility: 0.7,
    }),
    createSkyPaletteEntry({
      top: "#f2b974",
      bottom: "#f2aa80",
      brightness: 0.62,
      sunVisibility: 0.5,
    }),
    createSkyPaletteEntry({
      top: "#e38a58",
      bottom: "#ed7c67",
      brightness: 0.5,
      sunVisibility: 0.32,
    }),
    createSkyPaletteEntry({
      top: "#c86363",
      bottom: "#a04c5b",
      brightness: 0.38,
      sunVisibility: 0.18,
    }),
    createSkyPaletteEntry({
      top: "#6d3f33",
      bottom: "#3b2622",
      brightness: 0.26,
      sunVisibility: 0.08,
    }),
    createSkyPaletteEntry({
      top: "#402822",
      bottom: "#241712",
      brightness: 0.18,
      sunVisibility: 0.03,
    }),
    createSkyPaletteEntry({
      top: "#291b16",
      bottom: "#1b120e",
      brightness: 0.13,
      sunVisibility: 0.01,
    }),
    createSkyPaletteEntry({
      top: "#190f0c",
      bottom: "#1a0f0e",
      brightness: 0.1,
      sunVisibility: 0,
    }),
  ];

  const interpolateSkyPalette = (current, next, alpha) => {
    const mix = THREE.MathUtils.clamp(alpha, 0, 1);

    return {
      topColor: current.topColor.clone().lerp(next.topColor, mix),
      bottomColor: current.bottomColor.clone().lerp(next.bottomColor, mix),
      brightness: THREE.MathUtils.lerp(current.brightness, next.brightness, mix),
      sunVisibility: THREE.MathUtils.lerp(
        current.sunVisibility,
        next.sunVisibility,
        mix
      ),
    };
  };

  const defaultSkyState = interpolateSkyPalette(
    hourlySkyPalette[0],
    hourlySkyPalette[0],
    0
  );

  const timeOfDayState = {
    hour: null,
    minute: null,
    mixToNextHour: 0,
    skyState: defaultSkyState,
  };

  const createSkyDome = () => {
    const geometry = new THREE.SphereGeometry(BASE_SKY_DOME_RADIUS, 48, 32);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: skyGradientUniforms,
      vertexShader: `
        varying float vGradientStrength;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vec3 normalizedPosition = normalize(worldPosition.xyz);
          vGradientStrength = clamp(normalizedPosition.y * 0.5 + 0.5, 0.0, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float brightness;
        uniform float opacity;
        uniform float exponent;
        varying float vGradientStrength;

        void main() {
          float gradient = pow(vGradientStrength, exponent);
          vec3 baseColor = mix(bottomColor, topColor, gradient);
          gl_FragColor = vec4(baseColor * brightness, opacity);
        }
      `,
    });
    material.fog = false;
    material.toneMapped = true;
    const dome = new THREE.Mesh(geometry, material);
    dome.renderOrder = -2;
    return dome;
  };

  const skyDome = createSkyDome();
  skyDome.visible = false;
  scene.add(skyDome);

  sunSprite = createSunSprite();
  sunSprite.visible = false;
  scene.add(sunSprite);
  updateSunSpriteScale();

  const applyTimeOfDayVisuals = () => {
    const skyState = timeOfDayState.skyState ?? defaultSkyState;
    const topColor = skyGradientUniforms.topColor.value;
    const bottomColor = skyGradientUniforms.bottomColor.value;

    const brightness = THREE.MathUtils.clamp(
      Number.isFinite(skyState.brightness)
        ? skyState.brightness
        : defaultSkyState.brightness,
      0,
      1
    );

    const sunVisibility = THREE.MathUtils.clamp(
      Number.isFinite(skyState.sunVisibility)
        ? skyState.sunVisibility
        : defaultSkyState.sunVisibility,
      0,
      1
    );

    topColor.copy(skyState.topColor ?? defaultSkyState.topColor);
    bottomColor.copy(skyState.bottomColor ?? defaultSkyState.bottomColor);

    const gradientBrightness = THREE.MathUtils.lerp(0.05, 1.05, brightness);
    const gradientOpacity = THREE.MathUtils.clamp(
      0.25 + brightness * 0.75,
      0.2,
      1
    );

    skyGradientUniforms.brightness.value = gradientBrightness;
    skyGradientUniforms.opacity.value = gradientOpacity;

    const toneMappingExposure = THREE.MathUtils.lerp(0.25, 1.15, brightness);
    renderer.toneMappingExposure = toneMappingExposure;

    if (sunSprite.material) {
      sunSprite.material.opacity = sunVisibility;
    }

    skyDome.visible = gradientOpacity > 0.01;
    sunSprite.visible = false;

    const starVisibility = THREE.MathUtils.clamp(1 - sunVisibility * 1.05, 0, 1);
    setStarVisibilityForTimeOfDay(starVisibility);

    const horizonBlend = THREE.MathUtils.clamp(
      Math.pow(0.5, skyGradientUniforms.exponent.value),
      0,
      1
    );
    skyBackgroundColor
      .copy(bottomColor)
      .lerp(topColor, horizonBlend)
      .multiplyScalar(gradientBrightness);
    scene.background = skyBackgroundColor;
    if (scene.fog) {
      scene.fog.color.copy(skyBackgroundColor);
    }
  };

  let lastTimeOfDayCheck = 0;

  const getAdjustedTimeParts = () => {
    const now = new Date();
    const adjustedMilliseconds =
      now.getTime() + timeSettings.gmtOffsetHours * 60 * 60 * 1000;
    const adjusted = new Date(adjustedMilliseconds);
    const hour = adjusted.getUTCHours();
    const minute = adjusted.getUTCMinutes();
    const second = adjusted.getUTCSeconds();
    const fractionalHour = hour + minute / 60 + second / 3600;

    return {
      hour,
      minute,
      second,
      hourValue: ((fractionalHour % 24) + 24) % 24,
      minuteFraction: (minute + second / 60) / 60,
    };
  };

  const updateTimeOfDay = (force = false) => {
    const nowSeconds = performance.now() / 1000;

    if (!force && nowSeconds - lastTimeOfDayCheck < TIME_OF_DAY_REFRESH_SECONDS) {
      return;
    }

    lastTimeOfDayCheck = nowSeconds;

    const timeParts = getAdjustedTimeParts();
    const currentHourIndex = Math.floor(timeParts.hourValue) % 24;
    const nextHourIndex = (currentHourIndex + 1) % 24;
    const mixToNextHour = THREE.MathUtils.clamp(timeParts.minuteFraction, 0, 1);

    const interpolatedSky = interpolateSkyPalette(
      hourlySkyPalette[currentHourIndex],
      hourlySkyPalette[nextHourIndex],
      mixToNextHour
    );

    const previousSky = timeOfDayState.skyState ?? defaultSkyState;
    const brightnessChanged =
      Math.abs(interpolatedSky.brightness - (previousSky.brightness ?? 0)) > 0.001;
    const sunChanged =
      Math.abs(interpolatedSky.sunVisibility - (previousSky.sunVisibility ?? 0)) > 0.001;
    const topColorChanged = !previousSky.topColor?.equals?.(interpolatedSky.topColor);
    const bottomColorChanged =
      !previousSky.bottomColor?.equals?.(interpolatedSky.bottomColor);
    const hourChanged =
      timeOfDayState.hour !== timeParts.hour || timeOfDayState.minute !== timeParts.minute;

    if (
      force ||
      hourChanged ||
      brightnessChanged ||
      sunChanged ||
      topColorChanged ||
      bottomColorChanged
    ) {
      timeOfDayState.hour = timeParts.hour;
      timeOfDayState.minute = timeParts.minute;
      timeOfDayState.mixToNextHour = mixToNextHour;
      timeOfDayState.skyState = interpolatedSky;
      applyTimeOfDayVisuals();
    }
  };

  const updateSkyBackdrop = () => {
    const playerPosition = playerObject?.position;

    if (!playerPosition) {
      return;
    }

    const sunVisibility = THREE.MathUtils.clamp(
      Number.isFinite(timeOfDayState.skyState?.sunVisibility)
        ? timeOfDayState.skyState.sunVisibility
        : defaultSkyState.sunVisibility,
      0,
      1
    );
    const sunHeight = THREE.MathUtils.lerp(18, 72, sunVisibility);
    const sunDepth = THREE.MathUtils.lerp(140, 90, sunVisibility);

    const targetRadius = getSkyDomeRadius();
    const domeScale = targetRadius / BASE_SKY_DOME_RADIUS;

    skyDome.position.copy(playerPosition);
    skyDome.scale.setScalar(domeScale);
    sunSprite.position.set(
      playerPosition.x,
      playerPosition.y + sunHeight,
      playerPosition.z - sunDepth
    );
  };

  updateTimeOfDay(true);

  const reflectionSettings = {
    enabled: settings?.reflectionsEnabled !== false,
    resolutionScale: normalizeReflectorResolutionScale(
      settings?.reflectorResolutionScale
    ),
  };

  const liftInteractables = [];
  const liftUiControllers = new Set();
  let notifyLiftUiControllersChanged = () => {};
  const registeredLiftDoors = [];
  const environmentHeightAdjusters = [];
  const resourceTargetsByEnvironment = new Map();
  const terrainTilesByEnvironment = new Map();
  const viewDistanceTargetsByEnvironment = new Map();
  let activeResourceTargets = [];
  let activeTerrainTiles = [];
  let activeViewDistanceTargets = [];
  let hasStoredOutsideMap = false;
  let geoVisorEnabled = false;
  let geoVisorLastRow = null;
  let geoVisorLastColumn = null;
  let geoVisorLastEnabled = null;
  let geoVisorRevealMapKey = null;
  const geoVisorRevealedTileIndices = new Set();
  let geoVisorRevealPersistTimeoutId = 0;
  const geoVisorPlayerWorldPosition = new THREE.Vector3();
  const geoVisorTileWorldPosition = new THREE.Vector3();
  const geoVisorRevealOrigin = new THREE.Vector3();

  const getGeoVisorRevealIndicesSnapshot = () =>
    Array.from(geoVisorRevealedTileIndices).sort((a, b) => a - b);

  const persistGeoVisorRevealStateNow = (force = false) => {
    if (!geoVisorRevealMapKey) {
      return false;
    }

    if (geoVisorRevealPersistTimeoutId) {
      window.clearTimeout(geoVisorRevealPersistTimeoutId);
      geoVisorRevealPersistTimeoutId = 0;
    }

    return persistGeoVisorRevealState(
      {
        mapKey: geoVisorRevealMapKey,
        revealedIndices: getGeoVisorRevealIndicesSnapshot(),
      },
      { force }
    );
  };

  const schedulePersistGeoVisorRevealState = ({ force = false } = {}) => {
    if (!geoVisorRevealMapKey) {
      return;
    }

    if (force) {
      persistGeoVisorRevealStateNow(true);
      return;
    }

    if (geoVisorRevealPersistTimeoutId) {
      return;
    }

    geoVisorRevealPersistTimeoutId = window.setTimeout(() => {
      geoVisorRevealPersistTimeoutId = 0;
      persistGeoVisorRevealStateNow();
    }, GEO_VISOR_REVEAL_SAVE_DELAY_MS);
  };

  const restoreGeoVisorRevealStateForMapKey = (mapKey) => {
    geoVisorRevealedTileIndices.clear();

    if (!mapKey) {
      return false;
    }

    const storedRevealState = loadStoredGeoVisorRevealState();
    if (
      !storedRevealState ||
      storedRevealState.mapKey !== mapKey ||
      !Array.isArray(storedRevealState.revealedIndices)
    ) {
      return false;
    }

    storedRevealState.revealedIndices.forEach((tileIndex) => {
      if (Number.isInteger(tileIndex) && tileIndex >= 0) {
        geoVisorRevealedTileIndices.add(tileIndex);
      }
    });

    return true;
  };

  const getResourceTargetsForFloor = (floorId) => {
    if (!floorId) {
      return [];
    }

    const targets = resourceTargetsByEnvironment.get(floorId);
    if (!Array.isArray(targets)) {
      return [];
    }

    return targets;
  };

  const getTerrainTilesForFloor = (floorId) => {
    if (!floorId) {
      return [];
    }

    const tiles = terrainTilesByEnvironment.get(floorId);

    if (!Array.isArray(tiles)) {
      return [];
    }

    return tiles;
  };

  const getViewDistanceTargetsForFloor = (floorId) => {
    if (!floorId) {
      return [];
    }

    const targets = viewDistanceTargetsByEnvironment.get(floorId);
    if (!Array.isArray(targets)) {
      return [];
    }

    return targets;
  };
  const syncViewDistanceBaseMaterial = (tile, baseMaterial) => {
    if (!tile?.userData || !baseMaterial?.isMaterial) {
      return;
    }

    if (tile.userData.viewDistanceBaseMaterial === baseMaterial) {
      return;
    }

    tile.userData.viewDistanceBaseMaterial = baseMaterial;
    tile.userData.viewDistanceBaseOpacity = Number.isFinite(baseMaterial.opacity)
      ? baseMaterial.opacity
      : 1;

    const fadeMaterial = tile.userData.viewDistanceFadeMaterial;
    if (
      fadeMaterial?.isMaterial &&
      fadeMaterial !== baseMaterial &&
      typeof fadeMaterial.dispose === "function"
    ) {
      fadeMaterial.dispose();
    }

    tile.userData.viewDistanceFadeMaterial = null;
  };

  const applyGeoVisorMaterialToTile = (tile, shouldReveal) => {
    if (!tile?.userData) {
      return;
    }

    const tileIndex = Number.isFinite(tile.userData.tileVariantIndex)
      ? tile.userData.tileVariantIndex
      : null;
    let revealSetChanged = false;
    if (Number.isInteger(tileIndex) && tileIndex >= 0) {
      if (shouldReveal) {
        if (!geoVisorRevealedTileIndices.has(tileIndex)) {
          geoVisorRevealedTileIndices.add(tileIndex);
          revealSetChanged = true;
        }
      } else if (geoVisorRevealedTileIndices.delete(tileIndex)) {
        revealSetChanged = true;
      }
    }
    if (revealSetChanged) {
      schedulePersistGeoVisorRevealState();
    }

    if (!tile.userData.geoVisorRevealedMaterial) {
      const terrainId = tile.userData.terrainId;
      const tileId = tile.userData.tileId;
      if (terrainId && tileId) {
        const variantIndex = Number.isFinite(tile.userData.tileVariantIndex)
          ? tile.userData.tileVariantIndex
          : 0;
        const baseMaterial = getRuntimeTerrainMaterial(
          terrainId,
          tileId,
          variantIndex
        );
        if (baseMaterial) {
          tile.userData.geoVisorRevealedMaterial = baseMaterial;
        }
      }
    }

    const fallbackMaterial =
      tile.userData.geoVisorRevealedMaterial ??
      tile.userData.geoVisorConcealedMaterial;
    // Keep revealed terrain tinted even when Geo Visor is toggled off.
    const revealedMaterial = tile.userData.geoVisorVisorMaterial ?? fallbackMaterial;
    const targetMaterial = shouldReveal
      ? revealedMaterial
      : tile.userData.geoVisorConcealedMaterial;

    syncViewDistanceBaseMaterial(tile, targetMaterial);

    if (!targetMaterial || tile.material === targetMaterial) {
      tile.userData.geoVisorRevealed = shouldReveal;
      return;
    }

    tile.material = targetMaterial;
    tile.userData.geoVisorRevealed = shouldReveal;
  };

  const getAllTerrainTilesForGeoVisor = () => {
    const allTiles = [];
    const seenTiles = new Set();

    terrainTilesByEnvironment.forEach((tiles) => {
      if (!Array.isArray(tiles)) {
        return;
      }

      tiles.forEach((tile) => {
        if (!tile?.userData || seenTiles.has(tile)) {
          return;
        }

        seenTiles.add(tile);
        allTiles.push(tile);
      });
    });

    if (Array.isArray(activeTerrainTiles)) {
      activeTerrainTiles.forEach((tile) => {
        if (!tile?.userData || seenTiles.has(tile)) {
          return;
        }

        seenTiles.add(tile);
        allTiles.push(tile);
      });
    }

    return allTiles;
  };

  const getNonVisorTerrainMaterialForTile = (tile) => {
    if (!tile?.userData) {
      return null;
    }

    const terrainId = tile.userData.terrainId;
    const tileId = tile.userData.tileId;
    const tileVariantIndex = Number.isFinite(tile.userData.tileVariantIndex)
      ? tile.userData.tileVariantIndex
      : 0;

    const runtimeMaterial =
      terrainId && tileId
        ? getRuntimeTerrainMaterial(terrainId, tileId, tileVariantIndex)
        : null;

    if (
      runtimeMaterial &&
      runtimeMaterial !== tile.userData.geoVisorVisorMaterial
    ) {
      return runtimeMaterial;
    }

    if (
      tile.userData.geoVisorConcealedMaterial &&
      tile.userData.geoVisorConcealedMaterial !==
        tile.userData.geoVisorVisorMaterial
    ) {
      return tile.userData.geoVisorConcealedMaterial;
    }

    if (
      tile.userData.geoVisorPreviousMaterial &&
      tile.userData.geoVisorPreviousMaterial !==
        tile.userData.geoVisorVisorMaterial
    ) {
      return tile.userData.geoVisorPreviousMaterial;
    }

    if (tile.material !== tile.userData.geoVisorVisorMaterial) {
      return tile.material;
    }

    return null;
  };

  const updateGeoVisorTerrainVisibility = ({ force = false } = {}) => {
    const allTerrainTiles = getAllTerrainTilesForGeoVisor();

    if (allTerrainTiles.length === 0) {
      geoVisorLastRow = null;
      geoVisorLastColumn = null;
      geoVisorLastEnabled = geoVisorEnabled;
      return;
    }

    if (!geoVisorEnabled) {
      geoVisorLastRow = null;
      geoVisorLastColumn = null;
      geoVisorLastEnabled = false;
      return;
    }

    if (playerObject?.isObject3D) {
      playerObject.getWorldPosition(geoVisorPlayerWorldPosition);
    } else if (camera?.isObject3D) {
      camera.getWorldPosition(geoVisorPlayerWorldPosition);
    } else {
      geoVisorPlayerWorldPosition.set(0, 0, 0);
    }

    const terrainIntersection = findTerrainIntersection();
    const hasIntersectionPoint =
      Number.isFinite(terrainIntersection?.position?.x) &&
      Number.isFinite(terrainIntersection?.position?.z);

    if (hasIntersectionPoint) {
      geoVisorRevealOrigin.set(
        terrainIntersection.position.x,
        terrainIntersection.position.y ?? geoVisorPlayerWorldPosition.y,
        terrainIntersection.position.z
      );
    } else {
      geoVisorRevealOrigin.copy(geoVisorPlayerWorldPosition);
    }

    const sampleTile = activeTerrainTiles.find(
      (tile) =>
        tile?.userData &&
        Number.isFinite(tile.userData.geoVisorCellSize) &&
        Number.isFinite(tile.userData.geoVisorMapLeftEdge) &&
        Number.isFinite(tile.userData.geoVisorMapNearEdge)
    );
    const playerColumn = sampleTile
      ? Math.floor(
          (geoVisorRevealOrigin.x -
            sampleTile.userData.geoVisorMapLeftEdge) /
            sampleTile.userData.geoVisorCellSize
        )
      : null;
    const playerRow = sampleTile
      ? Math.floor(
          (geoVisorRevealOrigin.z -
            sampleTile.userData.geoVisorMapNearEdge) /
            sampleTile.userData.geoVisorCellSize
        )
      : null;

    if (
      !force &&
      geoVisorLastEnabled === true &&
      geoVisorLastRow === playerRow &&
      geoVisorLastColumn === playerColumn
    ) {
      return;
    }

    const maxDistanceSquared = GEO_VISOR_MAX_DISTANCE ** 2;

    activeTerrainTiles.forEach((tile) => {
      if (tile?.userData && !tile.userData.geoVisorPreviousMaterial) {
        tile.userData.geoVisorPreviousMaterial = tile.material;
      }

      if (!tile?.isObject3D) {
        return;
      }

      tile.getWorldPosition(geoVisorTileWorldPosition);
      const tileSize =
        Number.isFinite(tile.userData?.geoVisorCellSize) &&
        tile.userData.geoVisorCellSize > 0
          ? tile.userData.geoVisorCellSize
          : 0;
      const halfTileSize = tileSize * 0.5;
      const deltaX =
        Math.abs(geoVisorTileWorldPosition.x - geoVisorRevealOrigin.x) -
        halfTileSize;
      const deltaZ =
        Math.abs(geoVisorTileWorldPosition.z - geoVisorRevealOrigin.z) -
        halfTileSize;
      const clampedDeltaX = Math.max(0, deltaX);
      const clampedDeltaZ = Math.max(0, deltaZ);
      const distanceSquared =
        clampedDeltaX * clampedDeltaX + clampedDeltaZ * clampedDeltaZ;
      if (distanceSquared > maxDistanceSquared) {
        return;
      }

      applyGeoVisorMaterialToTile(tile, true);
    });

    geoVisorLastRow = playerRow;
    geoVisorLastColumn = playerColumn;
    geoVisorLastEnabled = true;
  };

  const runGeoVisorTerrainVisibilityRegressionCheck = () => {
    const initialState = geoVisorEnabled;
    geoVisorEnabled = true;
    updateGeoVisorTerrainVisibility({ force: true });

    const terrainTiles = getAllTerrainTilesForGeoVisor();
    const revealedBeforeDisable = terrainTiles.filter((tile) => {
      if (!tile?.userData?.geoVisorVisorMaterial) {
        return false;
      }

      return tile.material === tile.userData.geoVisorVisorMaterial;
    });

    geoVisorEnabled = false;
    updateGeoVisorTerrainVisibility({ force: true });

    const retainedVisorTiles = terrainTiles.filter((tile) => {
      if (!tile?.userData?.geoVisorVisorMaterial) {
        return false;
      }

      return tile.material === tile.userData.geoVisorVisorMaterial;
    });

    const onToOffTransitionRetainedVisorMaterial =
      retainedVisorTiles.length === revealedBeforeDisable.length;

    geoVisorEnabled = initialState;
    updateGeoVisorTerrainVisibility({ force: true });

    return {
      ok: onToOffTransitionRetainedVisorMaterial,
      checkedTiles: terrainTiles.length,
      retainedVisorTiles: retainedVisorTiles.length,
      onToOffTransitionRetainedVisorMaterial,
    };
  };

  const doorMarkersById = new Map();

  const registerEnvironmentHeightAdjuster = (adjuster) => {
    if (typeof adjuster !== "function") {
      return () => {};
    }

    environmentHeightAdjusters.push(adjuster);

    return () => {
      const index = environmentHeightAdjusters.indexOf(adjuster);
      if (index >= 0) {
        environmentHeightAdjusters.splice(index, 1);
      }
    };
  };

  const registerLiftDoor = (door) => {
    if (!door || registeredLiftDoors.includes(door)) {
      return () => {};
    }

    registeredLiftDoors.push(door);

    const controller = door.userData?.liftUi ?? null;
    let registeredControls = [];

    if (controller) {
      liftUiControllers.add(controller);
      const controls = [controller.control]
        .concat(Array.isArray(controller.controls) ? controller.controls : [])
        .filter(Boolean);

      controls.forEach((control) => {
        if (liftInteractables.includes(control)) {
          registeredControls.push(control);
          return;
        }

        liftInteractables.push(control);
        registeredControls.push(control);
      });

      try {
        notifyLiftUiControllersChanged();
      } catch (error) {
        console.warn("Unable to sync lift UI state", error);
      }
    }

    return () => {
      const doorIndex = registeredLiftDoors.indexOf(door);
      if (doorIndex >= 0) {
        registeredLiftDoors.splice(doorIndex, 1);
      }

      if (controller) {
        liftUiControllers.delete(controller);
      }

      registeredControls
        .filter(Boolean)
        .forEach((control) => {
          const controlIndex = liftInteractables.indexOf(control);
          if (controlIndex >= 0) {
            liftInteractables.splice(controlIndex, 1);
          }
        });

      try {
        notifyLiftUiControllersChanged();
      } catch (error) {
        console.warn("Unable to sync lift UI state", error);
      }
    };
  };

  const createFloorBounds = (
    width,
    depth,
    { paddingX = 1, paddingZ = 1 } = {}
  ) => {
    const safePaddingX = Number.isFinite(paddingX) ? paddingX : 0;
    const safePaddingZ = Number.isFinite(paddingZ) ? paddingZ : 0;
    const halfWidth = Math.max(0, width / 2 - safePaddingX);
    const halfDepth = Math.max(0, depth / 2 - safePaddingZ);

    return {
      minX: -halfWidth,
      maxX: halfWidth,
      minZ: -halfDepth,
      maxZ: halfDepth,
    };
  };

  const translateBoundsToWorld = (bounds, origin) => {
    if (!bounds) {
      return null;
    }

    const offsetX = Number.isFinite(origin?.x) ? origin.x : 0;
    const offsetZ = Number.isFinite(origin?.z) ? origin.z : 0;

    const minX = Number.isFinite(bounds.minX) ? bounds.minX + offsetX : null;
    const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX + offsetX : null;
    const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ + offsetZ : null;
    const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ + offsetZ : null;

    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(minZ) ||
      !Number.isFinite(maxZ)
    ) {
      return null;
    }

    return { minX, maxX, minZ, maxZ };
  };

  const disposeObject3D = (object) => {
    if (!object) {
      return;
    }

    const disposedMaterials = new Set();

    object.traverse((child) => {
      if (!child) {
        return;
      }

      if (typeof child.userData?.dispose === "function") {
        try {
          child.userData.dispose();
        } catch (error) {
          console.warn("Failed to dispose object userData", error);
        }
      }

      const { geometry, material } = child;

      if (geometry && typeof geometry.dispose === "function") {
        geometry.dispose();
      }

      if (Array.isArray(material)) {
        material.forEach((entry) => {
          if (
            entry &&
            typeof entry.dispose === "function" &&
            !disposedMaterials.has(entry)
          ) {
            entry.dispose();
            disposedMaterials.add(entry);
          }
        });
      } else if (
        material &&
        typeof material.dispose === "function" &&
        !disposedMaterials.has(material)
      ) {
        material.dispose();
        disposedMaterials.add(material);
      }
    });
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

  const createQuickAccessFallbackTexture = () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1200" viewBox="0 0 1024 1200">
  <defs>
    <linearGradient id="screen-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#051120" />
      <stop offset="100%" stop-color="#020a16" />
    </linearGradient>
    <radialGradient id="screen-vignette" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#1f2937" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#020610" stop-opacity="0.98" />
    </radialGradient>
    <linearGradient id="option-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f76d2" stop-opacity="0.42" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.18" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1200" fill="url(#screen-bg)" />
  <rect width="1024" height="1200" fill="url(#screen-vignette)" />
  <g fill="none" stroke="#60a5fa" stroke-width="3" opacity="0.28">
    <rect x="40" y="40" width="944" height="1120" rx="36" ry="36" />
  </g>
  <g>
    <text x="96" y="181" fill="#94a3b8" fill-opacity="0.82" font-size="44" font-family="'Segoe UI', 'Inter', sans-serif" font-weight="600" letter-spacing="6">TERMINAL</text>
  </g>
  <line x1="84" y1="260" x2="940" y2="260" stroke="#334155" stroke-opacity="0.55" stroke-width="3" />
  <g font-family="'Segoe UI', 'Inter', sans-serif">
    <g transform="translate(96 128)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">NEWS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Latest mission intelligence</text>
    </g>
    <g transform="translate(96 296)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">WEATHER</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Atmospheric reports</text>
    </g>
    <g transform="translate(96 464)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">MISSIONS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Active assignments</text>
    </g>
    <g transform="translate(96 632)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">MAP</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Expedition routes &amp; caches</text>
    </g>
  </g>
</svg>`;

    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const texture = textureLoader.load(dataUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  const loadClampedTexture = (path, onLoad) => {
    const resolvedUrl = resolveAssetUrl(path);

    if (!resolvedUrl) {
      throw new Error("Unable to resolve texture path");
    }

    const texture = textureLoader.load(
      resolvedUrl,
      (loadedTexture) => {
        if (typeof onLoad === "function") {
          onLoad(loadedTexture);
        }
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  const runtimeTerrainTextures = new Map();
  const runtimeTerrainMaterials = new Map();
  const runtimeGeoVisorMaterials = new Map();

  const getRuntimeTerrainTexture = (tileId, variantIndex) => {
    const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);

    if (!texturePath) {
      return null;
    }

    if (!runtimeTerrainTextures.has(texturePath)) {
      const texture = loadClampedTexture(texturePath);
      runtimeTerrainTextures.set(texturePath, texture);
    }

    return runtimeTerrainTextures.get(texturePath);
  };

  const getRuntimeTerrainMaterial = (terrainId, tileId, variantIndex) => {
    if (CONCEAL_OUTSIDE_TERRAIN_TILES) {
      return null;
    }

    const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);
    const materialKey = `${terrainId}:${texturePath ?? "none"}`;

    if (runtimeTerrainMaterials.has(materialKey)) {
      return runtimeTerrainMaterials.get(materialKey);
    }

    const terrainStyle = OUTSIDE_TERRAIN_TILE_STYLES.get("default") ||
      DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE;
    const terrain = getOutsideTerrainById(terrainId);
    const texture = getRuntimeTerrainTexture(tileId, variantIndex);
    const baseColor = texture
      ? 0xffffff
      : terrainId === "void"
        ? terrainStyle.color ??
          terrain?.color ??
          DEFAULT_OUTSIDE_TERRAIN_COLOR
        : 0xffffff;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor),
      roughness: terrainStyle.roughness,
      metalness: terrainStyle.metalness,
      emissive: new THREE.Color(terrainStyle.emissive),
      emissiveIntensity: terrainStyle.emissiveIntensity ?? 1,
      map: texture ?? null,
      vertexColors: true,
      transparent: false,
      opacity: terrainStyle.opacity,
    });
    runtimeTerrainMaterials.set(materialKey, material);
    return material;
  };

  const getRuntimeGeoVisorMaterial = (terrainId, tileId, variantIndex) => {
    const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);
    const materialKey = `${terrainId}:${texturePath ?? "none"}`;

    if (runtimeGeoVisorMaterials.has(materialKey)) {
      return runtimeGeoVisorMaterials.get(materialKey);
    }

    const terrainStyle = OUTSIDE_TERRAIN_TILE_STYLES.get("default") ||
      DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE;
    const terrain = getOutsideTerrainById(terrainId);
    const terrainColor = terrain?.color ?? DEFAULT_OUTSIDE_TERRAIN_COLOR;
    const texture = getRuntimeTerrainTexture(tileId, variantIndex);
    const baseColor = texture ? 0xffffff : terrainColor;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor),
      roughness: terrainStyle.roughness,
      metalness: terrainStyle.metalness,
      emissive: new THREE.Color(terrainColor),
      emissiveIntensity: Math.max(
        0.65,
        terrainStyle.emissiveIntensity ?? 0
      ),
      map: texture ?? null,
      vertexColors: true,
      transparent: true,
      opacity: terrainStyle.opacity ?? 1,
    });
    runtimeGeoVisorMaterials.set(materialKey, material);
    return material;
  };

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(5 * ROOM_SCALE_FACTOR, 8 * ROOM_SCALE_FACTOR, 4 * ROOM_SCALE_FACTOR);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(
    0x7dd3fc,
    0.4,
    50 * ROOM_SCALE_FACTOR,
    2
  );
  fillLight.position.set(
    -6 * ROOM_SCALE_FACTOR,
    4 * ROOM_SCALE_FACTOR,
    -5 * ROOM_SCALE_FACTOR
  );
  scene.add(fillLight);

  const storedPlayerHeight = loadStoredPlayerHeight();
  const initialPlayerHeight = Number.isFinite(storedPlayerHeight)
    ? storedPlayerHeight
    : DEFAULT_PLAYER_HEIGHT;
  let playerHeight = initialPlayerHeight;

  const BASE_ROOM_WIDTH = 20 * ROOM_SCALE_FACTOR;
  const BASE_ROOM_HEIGHT = 15 * ROOM_SCALE_FACTOR;
  const BASE_ROOM_DEPTH = 60 * ROOM_SCALE_FACTOR;
  const BASE_DOOR_WIDTH = 8.5 * ROOM_SCALE_FACTOR;
  const BASE_DOOR_HEIGHT = 13.5 * ROOM_SCALE_FACTOR;
  const OUTSIDE_DOOR_TERRAIN_PADDING = 1.4;
  const OUTSIDE_DOOR_SURFACE_CLEARANCE = 0.28;
  const DEFAULT_DOOR_THEME = {
    accentColor: 0x991b1b,
    accentEmissiveColor: 0x240303,
    seamGlowColor: 0xf87171,
    doorLightColor: 0xf97316,
    overheadLightColor: 0xf97316,
    emblemColor: 0x991b1b,
    emblemEmissiveColor: 0x250404,
  };
  const COMMAND_CENTER_DOOR_THEME = {
    accentColor: 0x2563eb,
    accentEmissiveColor: 0x10243f,
    seamGlowColor: 0x38bdf8,
    doorLightColor: 0x38bdf8,
    overheadLightColor: 0x2563eb,
    emblemColor: 0x2563eb,
    emblemEmissiveColor: 0x10243f,
  };
  const EXTERIOR_PORTAL_DOOR_THEME = {
    accentColor: 0x0d9488,
    accentEmissiveColor: 0x043d3d,
    seamGlowColor: 0x5eead4,
    doorLightColor: 0x5eead4,
    overheadLightColor: 0x0f766e,
    emblemColor: 0x0f766e,
    emblemEmissiveColor: 0x052926,
  };
  const liftIndicatorLights = [];
  const BASE_MIRROR_WIDTH = 12 * ROOM_SCALE_FACTOR;
  const BASE_MIRROR_HEIGHT = 12 * ROOM_SCALE_FACTOR;
  const MIRROR_VERTICAL_OFFSET = 0.7;
  const MIRROR_WALL_INSET = 0.45 * ROOM_SCALE_FACTOR;

  const DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE = {
    roughness: 0.92,
    metalness: 0.2,
    emissive: 0x000000,
    emissiveIntensity: 0,
    opacity: 1,
    height: 0.001,
  };

  const CONCEAL_OUTSIDE_TERRAIN_TILES = false;
  const CONCEALED_OUTSIDE_TERRAIN_COLOR = 0x202736;
  const DEFAULT_OUTSIDE_TERRAIN_COLOR = 0x1f2937;

  const OUTSIDE_TERRAIN_CLEARANCE = 0.05;
  const OUTSIDE_HEIGHT_MIN = 0;
  const OUTSIDE_HEIGHT_MAX = 255;
  const OUTSIDE_HEIGHT_FLOOR = 0.05;
  const OUTSIDE_HEIGHT_UNITS_PER_PLAYER = 3;
  const OUTSIDE_HEIGHT_SCALE =
    ((DEFAULT_PLAYER_HEIGHT - OUTSIDE_HEIGHT_FLOOR) * OUTSIDE_HEIGHT_MAX) /
    OUTSIDE_HEIGHT_UNITS_PER_PLAYER;

  const clampOutsideHeight = (value) => {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) {
      return OUTSIDE_HEIGHT_MIN;
    }
    return Math.min(
      OUTSIDE_HEIGHT_MAX,
      Math.max(OUTSIDE_HEIGHT_MIN, Math.floor(numeric))
    );
  };

  const getOutsideTerrainElevation = (value = OUTSIDE_HEIGHT_MIN) =>
    OUTSIDE_HEIGHT_FLOOR +
    (OUTSIDE_HEIGHT_SCALE * clampOutsideHeight(value)) / OUTSIDE_HEIGHT_MAX;

  const OUTSIDE_HEIGHT_ELEVATION_MAX = getOutsideTerrainElevation(
    OUTSIDE_HEIGHT_MAX
  );

  const getMaxStepHeight = () => OUTSIDE_HEIGHT_ELEVATION_MAX;
  const getClimbSpeed = (distance) => {
    const climbDistance = Number(distance);
    if (!Number.isFinite(climbDistance) || climbDistance <= 0) {
      return STEP_CLIMB_SPEED * STEP_CLIMB_SPEED_MULTIPLIER;
    }

    const climbRatio = climbDistance / BASE_MAX_STEP_HEIGHT;
    const slowdownFactor = 1 + climbRatio * climbRatio * 6;
    return (STEP_CLIMB_SPEED * STEP_CLIMB_SPEED_MULTIPLIER) / slowdownFactor;
  };

  const OUTSIDE_TERRAIN_TILE_STYLES = new Map([
    ["default", DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE],
  ]);

  const roomWidth = BASE_ROOM_WIDTH;
  const roomDepth = BASE_ROOM_DEPTH;
  let roomHeight = BASE_ROOM_HEIGHT * (playerHeight / DEFAULT_PLAYER_HEIGHT);
  const terminalBackOffset = 4 * ROOM_SCALE_FACTOR;
  let roomFloorY = -roomHeight / 2;

  const createWallMaterial = (hexColor) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      side: THREE.BackSide,
      roughness: 0.72,
      metalness: 0.12,
      emissive: new THREE.Color(0x0b1414),
      emissiveIntensity: 0.25,
    });

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x161f1f),
    side: THREE.BackSide,
    roughness: 0.92,
    metalness: 0.06,
  });

  const hangarDeckEnvironmentGroup = new THREE.Group();
  hangarDeckEnvironmentGroup.name = "HangarDeckEnvironment";
  scene.add(hangarDeckEnvironmentGroup);

  const roomGeometry = new THREE.BoxGeometry(
    roomWidth,
    BASE_ROOM_HEIGHT,
    roomDepth
  );

  const ceilingGroupIndex = 2;
  const includeRoomCeiling = true;

  if (!includeRoomCeiling) {
    // Remove the ceiling faces from the room geometry so the room is open from above.
    const roomGeometryGroupsWithoutCeiling = roomGeometry.groups.filter(
      ({ materialIndex }) => materialIndex !== ceilingGroupIndex
    );

    roomGeometry.clearGroups();

    roomGeometryGroupsWithoutCeiling.forEach(
      ({ start, count, materialIndex }) => {
        const adjustedMaterialIndex =
          materialIndex > ceilingGroupIndex
            ? materialIndex - 1
            : materialIndex;

        roomGeometry.addGroup(start, count, adjustedMaterialIndex);
      }
    );
  }

  const roomMaterials = includeRoomCeiling
    ? [
        createWallMaterial(0x213331),
        createWallMaterial(0x273c39),
        createWallMaterial(0x1a2826),
        floorMaterial,
        createWallMaterial(0x213331),
        createWallMaterial(0x273c39),
      ]
    : [
        createWallMaterial(0x213331),
        createWallMaterial(0x273c39),
        floorMaterial,
        createWallMaterial(0x213331),
        createWallMaterial(0x273c39),
      ];

  const roomMesh = new THREE.Mesh(roomGeometry, roomMaterials);
  roomMesh.scale.set(1, roomHeight / BASE_ROOM_HEIGHT, 1);
  hangarDeckEnvironmentGroup.add(roomMesh);

  const createHangarDoor = (themeOverrides = {}, options = {}) => {
    const theme = { ...DEFAULT_DOOR_THEME, ...themeOverrides };
    const { includeBackWall = false } = options;
    const group = new THREE.Group();

    const doorWidth = BASE_DOOR_WIDTH;
    const doorHeight = BASE_DOOR_HEIGHT;
    const panelDepth = 0.2;
    const frameDepth = 0.42;
    const frameWidth = 0.48;
    const lintelHeight = 0.42;
    const thresholdHeight = 0.28;
    const seamGap = 0.22;

    const createPanelLabelTexture = (textLines, options = {}) => {
      const {
        backgroundColor = "#0b1214",
        borderColor = "#1f2937",
        textColor = "#cbd5f5",
      } = options;
      const canvasSize = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvasSize, canvasSize);

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 12;
      ctx.strokeRect(10, 10, canvasSize - 20, canvasSize - 20);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;

      const lines = Array.isArray(textLines) ? textLines : [textLines];
      const totalLines = lines.length;
      const baseFontSize = 74 / 1.5;
      const lineSpacingReduction = 8 / 1.5;

      lines.forEach((line, index) => {
        const fontSize =
          totalLines > 1
            ? baseFontSize - (totalLines - 1) * lineSpacingReduction
            : baseFontSize;
        ctx.font = `700 ${fontSize}px sans-serif`;
        const yOffset =
          canvasSize / 2 + (index - (totalLines - 1) / 2) * (fontSize + 4);
        ctx.fillText(line.toUpperCase(), canvasSize / 2, yOffset);
      });

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    };

    const createGrungeTexture = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(size, size);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const value = 32 + Math.random() * 180;
        imageData.data[i] = value;
        imageData.data[i + 1] = value * 0.92;
        imageData.data[i + 2] = value * 0.85;
        imageData.data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    };

    const grungeTexture = createGrungeTexture();

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x131a1c),
      roughness: 0.52,
      metalness: 0.58,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
    });

    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + frameWidth * 2.2, lintelHeight, frameDepth),
      frameMaterial
    );
    topFrame.position.y = doorHeight / 2 + lintelHeight / 2;
    group.add(topFrame);

    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + frameWidth * 2.2, thresholdHeight, frameDepth),
      frameMaterial
    );
    bottomFrame.position.y = -doorHeight / 2 - thresholdHeight / 2 + 0.12;
    group.add(bottomFrame);

    const sideFrameGeometry = new THREE.BoxGeometry(frameWidth, doorHeight + lintelHeight * 0.35, frameDepth);
    const leftFrame = new THREE.Mesh(sideFrameGeometry, frameMaterial);
    leftFrame.position.x = -doorWidth / 2 - frameWidth / 2;
    group.add(leftFrame);

    const rightFrame = leftFrame.clone();
    rightFrame.position.x = doorWidth / 2 + frameWidth / 2;
    group.add(rightFrame);

    const backWallDepth = 0.18;

    if (includeBackWall) {
      const backWallMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0b1113),
        roughness: 0.68,
        metalness: 0.32,
        map: grungeTexture,
        roughnessMap: grungeTexture,
        metalnessMap: grungeTexture,
      });
      const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(
          doorWidth + frameWidth * 2.2,
          doorHeight + lintelHeight + thresholdHeight,
          backWallDepth
        ),
        backWallMaterial
      );
      backWall.position.set(
        0,
        0,
        -frameDepth / 2 - backWallDepth / 2 - 0.02
      );
      group.add(backWall);
    }

    const trimMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x7f1d1d),
      metalness: 0.42,
      roughness: 0.36,
      emissive: new THREE.Color(0x1f0303),
      emissiveIntensity: 0.32,
    });

    const trimWidth = 0.22;
    const trimDepth = 0.12;
    const verticalTrimGeometry = new THREE.BoxGeometry(trimWidth, doorHeight * 0.92, trimDepth);
    const leftTrim = new THREE.Mesh(verticalTrimGeometry, trimMaterial);
    leftTrim.position.set(-doorWidth / 2 + trimWidth / 2 + 0.08, 0, panelDepth / 2 + trimDepth / 2);
    group.add(leftTrim);

    const rightTrim = leftTrim.clone();
    rightTrim.position.x *= -1;
    group.add(rightTrim);

    const horizontalTrimGeometry = new THREE.BoxGeometry(doorWidth * 0.9, trimWidth, trimDepth);
    const topTrim = new THREE.Mesh(horizontalTrimGeometry, trimMaterial);
    topTrim.position.set(0, doorHeight / 2 - trimWidth / 2 - 0.12, panelDepth / 2 + trimDepth / 2);
    group.add(topTrim);

    const bottomTrim = topTrim.clone();
    bottomTrim.position.y = -doorHeight / 2 + trimWidth / 2 + 0.18;
    group.add(bottomTrim);

    const panelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x202b2b),
      roughness: 0.48,
      metalness: 0.62,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
      normalScale: new THREE.Vector2(0.3, 0.3),
      emissive: new THREE.Color(0x050d0e),
      emissiveIntensity: 0.4,
    });

    const panelWidth = (doorWidth - seamGap) / 2;
    const windowWidth = panelWidth * 0.36;
    const windowHeight = doorHeight * 0.22;
    const windowDepth = 0.16;
    const windowY = doorHeight * 0.22;
    const windowOpeningWidth = windowWidth * 0.92;
    const windowOpeningHeight = windowHeight * 0.88;
    const windowOffsetWithinPanel = panelWidth * 0.25 + seamGap / 2;

    const createPanel = (direction = 1) => {
      const shape = new THREE.Shape();
      const halfWidth = panelWidth / 2;
      const halfHeight = doorHeight / 2;

      shape.moveTo(-halfWidth, -halfHeight);
      shape.lineTo(halfWidth, -halfHeight);
      shape.lineTo(halfWidth, halfHeight);
      shape.lineTo(-halfWidth, halfHeight);
      shape.lineTo(-halfWidth, -halfHeight);

      const windowCenterX = windowOffsetWithinPanel * direction;
      const windowHalfWidth = windowOpeningWidth / 2;
      const windowHalfHeight = windowOpeningHeight / 2;

      const windowPath = new THREE.Path();
      windowPath.moveTo(
        windowCenterX - windowHalfWidth,
        windowY - windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX - windowHalfWidth,
        windowY + windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX + windowHalfWidth,
        windowY + windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX + windowHalfWidth,
        windowY - windowHalfHeight
      );
      windowPath.lineTo(
        windowCenterX - windowHalfWidth,
        windowY - windowHalfHeight
      );

      shape.holes.push(windowPath);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: panelDepth,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -panelDepth / 2);

      return new THREE.Mesh(geometry, panelMaterial);
    };

    const leftPanel = createPanel(1);
    leftPanel.position.x = -(panelWidth / 2 + seamGap / 2);
    group.add(leftPanel);

    const rightPanel = createPanel(-1);
    rightPanel.position.x = panelWidth / 2 + seamGap / 2;
    group.add(rightPanel);

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111a1b),
      roughness: 0.38,
      metalness: 0.52,
      map: grungeTexture,
      roughnessMap: grungeTexture,
      metalnessMap: grungeTexture,
    });
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(seamGap * 0.35, doorHeight, panelDepth * 0.6),
      seamMaterial
    );
    group.add(seam);

    const seamGlowMaterial = new THREE.MeshBasicMaterial({
      color: theme.seamGlowColor,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const seamGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(seamGap * 0.48, doorHeight * 0.82),
      seamGlowMaterial
    );
    seamGlow.position.z = panelDepth / 2 + 0.06;
    group.add(seamGlow);

    const indicatorGlowGeometry = new THREE.PlaneGeometry(panelWidth * 0.82, 0.16);
    const topPanelGlow = new THREE.Mesh(indicatorGlowGeometry, seamGlowMaterial);
    topPanelGlow.position.set(0, doorHeight * 0.44, panelDepth / 2 + 0.05);
    group.add(topPanelGlow);

    const bottomPanelGlow = topPanelGlow.clone();
    bottomPanelGlow.position.y = -doorHeight * 0.44;
    group.add(bottomPanelGlow);

    const windowFrameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1c2527),
      metalness: 0.6,
      roughness: 0.32,
      map: grungeTexture,
    });

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xb7e3ff),
      emissive: new THREE.Color(0x9bdcfb),
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const createWindowFrameGeometry = () => {
      const outerWidth = windowWidth * 1.12;
      const outerHeight = windowHeight * 1.12;
      const innerWidth = windowOpeningWidth * 1.02;
      const innerHeight = windowOpeningHeight * 1.02;

      const shape = new THREE.Shape();
      shape.moveTo(-outerWidth / 2, -outerHeight / 2);
      shape.lineTo(outerWidth / 2, -outerHeight / 2);
      shape.lineTo(outerWidth / 2, outerHeight / 2);
      shape.lineTo(-outerWidth / 2, outerHeight / 2);
      shape.lineTo(-outerWidth / 2, -outerHeight / 2);

      const hole = new THREE.Path();
      hole.moveTo(-innerWidth / 2, -innerHeight / 2);
      hole.lineTo(-innerWidth / 2, innerHeight / 2);
      hole.lineTo(innerWidth / 2, innerHeight / 2);
      hole.lineTo(innerWidth / 2, -innerHeight / 2);
      hole.lineTo(-innerWidth / 2, -innerHeight / 2);

      shape.holes.push(hole);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: windowDepth,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -windowDepth / 2);

      return geometry;
    };

    const windowFrameGeometry = createWindowFrameGeometry();
    const windowGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const createWindow = (centerX) => {
      const frontFrame = new THREE.Mesh(
        windowFrameGeometry,
        windowFrameMaterial
      );
      frontFrame.position.set(
        centerX,
        windowY,
        panelDepth / 2 - windowDepth / 2 + 0.01
      );
      group.add(frontFrame);

      const rearFrame = frontFrame.clone();
      rearFrame.position.z = -panelDepth / 2 + windowDepth / 2 - 0.01;
      group.add(rearFrame);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(
          windowOpeningWidth * 0.96,
          windowOpeningHeight * 0.96
        ),
        windowMaterial
      );
      glass.position.set(centerX, windowY, 0);
      glass.renderOrder = 2;
      group.add(glass);

      const frontGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(
          windowOpeningWidth * 0.76,
          windowOpeningHeight * 0.76
        ),
        windowGlowMaterial
      );
      frontGlow.position.set(centerX, windowY, panelDepth / 2 - 0.02);
      group.add(frontGlow);

      const rearGlow = frontGlow.clone();
      rearGlow.position.z = -panelDepth / 2 + 0.02;
      group.add(rearGlow);

      const windowHaloMaterial = new THREE.MeshBasicMaterial({
        color: 0x9bdcfb,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const windowHalo = new THREE.Mesh(
        new THREE.PlaneGeometry(windowOpeningWidth * 0.95, windowOpeningHeight * 0.95),
        windowHaloMaterial
      );
      windowHalo.position.set(centerX, windowY, 0.25);
      group.add(windowHalo);

      const rearHalo = windowHalo.clone();
      rearHalo.position.z = -0.25;
      group.add(rearHalo);
    };

    createWindow(-panelWidth * 0.25);
    createWindow(panelWidth * 0.25);

    const ventMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111a1a),
      metalness: 0.4,
      roughness: 0.55,
      map: grungeTexture,
    });

    const ventWidth = panelWidth * 0.42;
    const ventHeight = doorHeight * 0.22;
    const ventDepth = 0.14;

    const createVent = (centerX) => {
      const vent = new THREE.Mesh(
        new THREE.BoxGeometry(ventWidth, ventHeight, ventDepth),
        ventMaterial
      );
      vent.position.set(centerX, -doorHeight * 0.32, panelDepth / 2 + ventDepth / 2);
      group.add(vent);

      const slatMaterial = new THREE.MeshBasicMaterial({
        color: 0x2d3a3a,
        side: THREE.DoubleSide,
      });
      const slatGeometry = new THREE.PlaneGeometry(ventWidth * 0.92, 0.04);
      const slatCount = 5;
      for (let i = 0; i < slatCount; i += 1) {
        const slat = new THREE.Mesh(slatGeometry, slatMaterial);
        slat.position.set(0, ventHeight * 0.4 - (i * ventHeight) / (slatCount - 1), ventDepth / 2 + 0.01);
        vent.add(slat);
      }
    };

    createVent(-panelWidth * 0.25);
    createVent(panelWidth * 0.25);

    const emblemMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.emblemColor),
      metalness: 0.45,
      roughness: 0.35,
      emissive: new THREE.Color(theme.emblemEmissiveColor),
      emissiveIntensity: 0.25,
    });

    const emblemGeometry = new THREE.CircleGeometry(panelWidth * 0.16, 48);
    const leftEmblem = new THREE.Mesh(emblemGeometry, emblemMaterial);
    leftEmblem.position.set(-panelWidth * 0.25, -doorHeight * 0.02, panelDepth / 2 + 0.045);
    group.add(leftEmblem);

    const rightEmblem = leftEmblem.clone();
    rightEmblem.position.x *= -1;
    group.add(rightEmblem);

    const boltMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0e1516),
      metalness: 0.6,
      roughness: 0.3,
    });

    const boltGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    const boltPositions = [];
    const boltOffsetX = doorWidth / 2 + frameWidth * 0.25;
    const boltOffsetY = doorHeight / 2 - 0.35;
    const boltSpacingY = doorHeight / 3;
    for (let i = -1; i <= 1; i += 1) {
      boltPositions.push([-boltOffsetX, boltOffsetY - boltSpacingY * i]);
      boltPositions.push([boltOffsetX, boltOffsetY - boltSpacingY * i]);
    }

    boltPositions.forEach(([x, y]) => {
      const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(x, y, frameDepth / 2 + 0.02);
      group.add(bolt);
    });

    const controlPanelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111b1f),
      roughness: 0.42,
      metalness: 0.48,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.45,
    });

    const controlPanelWidth = 0.6;
    const controlPanelHeight = 1.4;
    const controlPanel = new THREE.Mesh(
      new THREE.BoxGeometry(controlPanelWidth, controlPanelHeight, 0.18),
      controlPanelMaterial
    );
    const controlPanelFrontOffset = frameDepth / 2 + 0.08;
    controlPanel.position.set(
      doorWidth / 2 + frameWidth * 0.95,
      0.1,
      controlPanelFrontOffset
    );
    group.add(controlPanel);

    const controlPanelEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(controlPanel.geometry),
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      })
    );
    controlPanelEdges.scale.setScalar(1.01);
    controlPanel.add(controlPanelEdges);

    const controlPanelGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 1.62),
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    controlPanelGlow.position.set(0, 0, 0.1);
    controlPanelGlow.renderOrder = 2;
    controlPanel.add(controlPanelGlow);

    const liftAccessStyles = {
      area: {
        label: ["AREA", "SELECT"],
        labelTextColor: "#bae6fd",
        labelBorderColor: "#1e3a8a",
        edgeColor: 0x38bdf8,
        glowColor: 0x0ea5e9,
        lightColor: 0x38bdf8,
      },
      direct: {
        label: ["DIRECT", "ACCESS"],
        labelTextColor: "#fda4af",
        labelBorderColor: "#831843",
        edgeColor: 0xf472b6,
        glowColor: 0xec4899,
        lightColor: 0xf472b6,
      },
    };

    const panelLabelMaterial = new THREE.MeshBasicMaterial({
      map: createPanelLabelTexture(liftAccessStyles.area.label, {
        textColor: liftAccessStyles.area.labelTextColor,
        borderColor: liftAccessStyles.area.labelBorderColor,
      }),
      transparent: true,
    });
    panelLabelMaterial.toneMapped = false;
    const panelLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(controlPanelWidth * 1.1, 0.4),
      panelLabelMaterial
    );
    panelLabel.position.set(0, controlPanelHeight / 2 + 0.3, 0.115);
    controlPanel.add(panelLabel);

    const createLiftDisplayTexture = () => {
      const width = 320;
      const height = 480;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      if (!context) {
        return {
          texture,
          update: () => {},
        };
      }

      const fitText = (
        text,
        {
          weight = "400",
          baseSize = 28,
          minSize = 18,
          maxWidth = width - 64,
        } = {}
      ) => {
        const content = typeof text === "string" ? text : String(text || "");
        let fontSize = Number.isFinite(baseSize) ? baseSize : 28;
        const minimum = Math.max(10, minSize || 10);
        const resolvedMaxWidth = Number.isFinite(maxWidth)
          ? maxWidth
          : width - 64;

        const setFont = () => {
          context.font = `${weight} ${fontSize}px sans-serif`;
        };

        setFont();

        if (!content) {
          return fontSize;
        }

        while (
          fontSize > minimum &&
          context.measureText(content).width > resolvedMaxWidth
        ) {
          fontSize -= 2;
          setFont();
        }

        return fontSize;
      };

      const drawDescription = (text, busyState) => {
        const descriptionWords =
          typeof text === "string"
            ? text
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((word) => word.toUpperCase())
            : [];

        if (descriptionWords.length === 0) {
          return;
        }

        const longestDescriptionWord = descriptionWords.reduce(
          (longest, word) => (longest.length >= word.length ? longest : word),
          descriptionWords[0]
        );
        const descriptionFontSize = fitText(longestDescriptionWord, {
          weight: "500",
          baseSize: 30,
          minSize: 20,
          maxWidth: width - 72,
        });

        context.font = `500 ${descriptionFontSize}px sans-serif`;
        context.fillStyle = busyState ? "#fbbf24" : "#38bdf8";
        const totalLines = descriptionWords.length;
        descriptionWords.forEach((word, index) => {
          const lineOffset = index - (totalLines - 1) / 2;
          const lineY =
            height * 0.58 + lineOffset * descriptionFontSize * 1.1;
          context.fillText(word, width / 2, lineY);
        });
      };

      const update = ({ current, next, busy, mapName }) => {
        const gradient = context.createLinearGradient(0, 0, width, height);
        if (busy) {
          gradient.addColorStop(0, "#1f2937");
          gradient.addColorStop(1, "#111827");
        } else {
          gradient.addColorStop(0, "#0e1b2b");
          gradient.addColorStop(1, "#0b1220");
        }

        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        context.fillStyle = busy
          ? "rgba(249, 115, 22, 0.12)"
          : "rgba(34, 197, 94, 0.12)";
        context.fillRect(12, 12, width - 24, height - 24);

        const trimmedMapName =
          typeof mapName === "string" ? mapName.trim() : "";
        const rawTitle =
          current?.title ||
          current?.id ||
          next?.title ||
          next?.id ||
          trimmedMapName ||
          "Surface Access";
        const titleWords = rawTitle
          .toString()
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => word.toUpperCase());
        const resolvedTitleWords =
          titleWords.length > 0 ? titleWords : ["SURFACE", "ACCESS"];
        const status = busy ? "TRANSIT" : "";

        context.textAlign = "center";
        context.textBaseline = "middle";

        if (status) {
          const statusFontSize = fitText(status, {
            weight: "600",
            baseSize: 36,
            minSize: 24,
          });
          context.fillStyle = busy ? "#f97316" : "#22c55e";
          context.font = `600 ${statusFontSize}px sans-serif`;
          context.fillText(status, width / 2, height * 0.18);
        }

        const longestTitleWord = resolvedTitleWords.reduce(
          (longest, word) => (longest.length >= word.length ? longest : word),
          resolvedTitleWords[0]
        );
        const titleFontSize = fitText(longestTitleWord, {
          weight: "700",
          baseSize: 60,
          minSize: 34,
        });
        context.fillStyle = "#e2e8f0";
        context.font = `700 ${titleFontSize}px sans-serif`;
        const totalTitleLines = resolvedTitleWords.length;
        resolvedTitleWords.forEach((word, index) => {
          const lineOffset = index - (totalTitleLines - 1) / 2;
          const lineY = height * 0.36 + lineOffset * titleFontSize * 1.15;
          context.fillText(word, width / 2, lineY);
        });

        drawDescription(current?.description ?? "", busy);

        texture.needsUpdate = true;
      };

      return { texture, update };
    };

    const { texture: liftDisplayTexture, update: updateLiftDisplayTexture } =
      createLiftDisplayTexture();

    const controlScreenInset = 0.02;
    const controlScreenWidth = controlPanelWidth - controlScreenInset * 2;
    const controlScreenHeight = controlPanelHeight - controlScreenInset * 2;
    const controlScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(controlScreenWidth, controlScreenHeight),
      new THREE.MeshBasicMaterial({
        map: liftDisplayTexture,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      })
    );
    controlScreen.position.set(0, 0, 0.11);
    controlPanel.add(controlScreen);

    const liftControlHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(
        controlScreenWidth + 0.04,
        controlScreenHeight + 0.04
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    liftControlHitArea.position.set(0, 0, 0.115);
    liftControlHitArea.userData.isLiftControl = true;
    controlPanel.add(liftControlHitArea);

    const doorSurfaceHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(doorWidth * 0.98, doorHeight * 0.94),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    doorSurfaceHitArea.position.set(0, 0, panelDepth / 2 + 0.08);
    doorSurfaceHitArea.userData.isLiftControl = true;
    group.add(doorSurfaceHitArea);

    const panelLight = new THREE.PointLight(
      liftAccessStyles.area.lightColor,
      0.85,
      5.5 * ROOM_SCALE_FACTOR,
      1.6
    );
    panelLight.position.set(
      controlPanel.position.x,
      controlPanel.position.y + 0.3,
      0.42
    );
    group.add(panelLight);

    const applyLiftUiState = ({ current, next, busy, mapName } = {}) => {
      updateLiftDisplayTexture({
        current,
        next,
        busy: Boolean(busy),
        mapName,
      });
    };

    applyLiftUiState({ busy: false });

    const setLiftAccessType = (type) => {
      const resolvedType =
        typeof type === "string" && type in liftAccessStyles ? type : "area";
      const style = liftAccessStyles[resolvedType];
      panelLabelMaterial.map = createPanelLabelTexture(style.label, {
        textColor: style.labelTextColor,
        borderColor: style.labelBorderColor,
      });
      panelLabelMaterial.needsUpdate = true;
      if (controlPanelEdges.material?.color) {
        controlPanelEdges.material.color.setHex(style.edgeColor);
      }
      if (controlPanelGlow.material?.color) {
        controlPanelGlow.material.color.setHex(style.glowColor);
      }
      panelLight.color.setHex(style.lightColor);
      group.userData.liftAccessType = resolvedType;
    };

    setLiftAccessType("area");

    group.userData.liftUi = {
      control: liftControlHitArea,
      controls: [liftControlHitArea, doorSurfaceHitArea],
      updateState: applyLiftUiState,
      setAccessType: setLiftAccessType,
    };

    group.userData.height = doorHeight;
    group.userData.width = doorWidth;
    const baseDepth =
      frameDepth + (includeBackWall ? backWallDepth + 0.02 : 0);
    group.userData.baseDimensions = {
      height: doorHeight,
      width: doorWidth,
      depth: baseDepth,
    };

    return group;
  };

  const hangarDoor = createHangarDoor(COMMAND_CENTER_DOOR_THEME, {
    includeBackWall: true,
  });
  hangarDoor.position.set(
    0,
    -roomHeight / 2 + (hangarDoor.userData.height ?? 0) / 2,
    roomDepth / 2 - 0.32 * ROOM_SCALE_FACTOR
  );
  hangarDoor.rotation.y = Math.PI;
  hangarDeckEnvironmentGroup.add(hangarDoor);
  hangarDoor.userData.floorOffset = 0;
  registerLiftDoor(hangarDoor);

  const createComputerSetup = () => {
    const group = new THREE.Group();

    let collidersChangedCallback = null;

    const notifyCollidersChanged = () => {
      if (typeof collidersChangedCallback === "function") {
        collidersChangedCallback();
      }
    };

    group.userData.setCollidersChangedCallback = (callback) => {
      collidersChangedCallback = callback;
    };

    group.userData.notifyCollidersChanged = notifyCollidersChanged;

    let quickAccessTextureSize = { width: 1024, height: 1200 };
    let quickAccessZones = [];

    const deskHeight = 0.78 * 1.3;
    const deskTopThickness = 0.08;
    const deskWidth = 3.2;
    const deskDepth = 1.4;

    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.7,
      metalness: 0.15,
    });

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(deskWidth, deskTopThickness, deskDepth),
      deskMaterial
    );
    deskTop.position.set(0, deskHeight + deskTopThickness / 2, 0);
    group.add(deskTop);

    const deskCollisionVolume = new THREE.Mesh(
      new THREE.BoxGeometry(
        deskWidth,
        deskHeight + deskTopThickness,
        deskDepth
      ),
      deskMaterial
    );
    deskCollisionVolume.visible = false;
    deskCollisionVolume.position.set(
      0,
      (deskHeight + deskTopThickness) / 2,
      0
    );
    group.add(deskCollisionVolume);

    const legGeometry = new THREE.BoxGeometry(0.14, deskHeight, 0.14);
    const legPositions = [
      [-deskWidth / 2 + 0.22, deskHeight / 2, -deskDepth / 2 + 0.22],
      [deskWidth / 2 - 0.22, deskHeight / 2, -deskDepth / 2 + 0.22],
      [-deskWidth / 2 + 0.22, deskHeight / 2, deskDepth / 2 - 0.22],
      [deskWidth / 2 - 0.22, deskHeight / 2, deskDepth / 2 - 0.22],
    ];

    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeometry, deskMaterial);
      leg.position.set(x, y, z);
      group.add(leg);
    });

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0.08, deskHeight + deskTopThickness + 0.02, -0.12);

    const monitorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.35,
      roughness: 0.35,
    });

    const createMonitorDisplayTexture = () => {
      const width = 1024;
      const height = 1200;

      quickAccessTextureSize = { width, height };

      const quickAccessOptionDefinitions = [
        {
          id: "news",
          title: "NEWS",
          description: "Latest mission intelligence",
        },
        {
          id: "weather",
          title: "WEATHER",
          description: "Atmospheric reports",
        },
        {
          id: "missions",
          title: "MISSIONS",
          description: "Active assignments",
        },
        {
          id: "research",
          title: "RESEARCH",
          description: "Lab projects & prototypes",
        },
        {
          id: "market",
          title: "MARKET",
          description: "Trade hub & requisitions",
        },
        {
          id: "map",
          title: "MAP",
          description: "Expedition routes & caches",
        },
      ];

      const bezelInset = 56;
      const optionHeight = 148;
      const optionStartOffset = bezelInset + 72;
      const optionSpacing = 12;

      const computeQuickAccessZones = () => {
        const optionX = bezelInset + 40;
        const optionWidth = width - optionX * 2;
        let optionY = optionStartOffset;

        return quickAccessOptionDefinitions.map((definition) => {
          const zone = {
            id: definition.id,
            title: definition.title,
            description: definition.description,
            minX: optionX,
            maxX: optionX + optionWidth,
            minY: optionY,
            maxY: optionY + optionHeight,
          };

          optionY += optionHeight + optionSpacing;
          return zone;
        });
      };

      quickAccessZones = computeQuickAccessZones();

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        const fallbackTexture = createQuickAccessFallbackTexture();
        return {
          texture: fallbackTexture,
          setHoveredZone: () => {},
          update: () => {},
        };
      }

      const drawRoundedRect = (x, y, rectWidth, rectHeight, radius) => {
        const clampedRadius = Math.min(radius, rectWidth / 2, rectHeight / 2);
        context.beginPath();
        context.moveTo(x + clampedRadius, y);
        context.lineTo(x + rectWidth - clampedRadius, y);
        context.quadraticCurveTo(
          x + rectWidth,
          y,
          x + rectWidth,
          y + clampedRadius
        );
        context.lineTo(x + rectWidth, y + rectHeight - clampedRadius);
        context.quadraticCurveTo(
          x + rectWidth,
          y + rectHeight,
          x + rectWidth - clampedRadius,
          y + rectHeight
        );
        context.lineTo(x + clampedRadius, y + rectHeight);
        context.quadraticCurveTo(
          x,
          y + rectHeight,
          x,
          y + rectHeight - clampedRadius
        );
        context.lineTo(x, y + clampedRadius);
        context.quadraticCurveTo(x, y, x + clampedRadius, y);
        context.closePath();
      };

      try {
        const baseStartColor = { r: 15, g: 118, b: 210, a: 0.28 };
        const baseEndColor = { r: 56, g: 189, b: 248, a: 0.12 };
        const highlightStartColor = { r: 34, g: 197, b: 94, a: 0.85 };
        const highlightEndColor = { r: 14, g: 184, b: 166, a: 0.78 };
        const baseTitleColor = { r: 226, g: 232, b: 240, a: 1 };
        const highlightTitleColor = { r: 2, g: 44, b: 34, a: 1 };
        const baseDescriptionColor = { r: 148, g: 163, b: 184, a: 0.85 };
        const highlightDescriptionColor = { r: 12, g: 84, b: 73, a: 0.88 };

        const lerp = (start, end, t) => start + (end - start) * t;
        const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
        const mixColor = (startColor, endColor, t) => ({
          r: lerp(startColor.r, endColor.r, t),
          g: lerp(startColor.g, endColor.g, t),
          b: lerp(startColor.b, endColor.b, t),
          a: lerp(startColor.a, endColor.a, t),
        });
        const toRgba = ({ r, g, b, a }) =>
          `rgba(${Math.round(Math.min(Math.max(r, 0), 255))}, ${Math.round(
            Math.min(Math.max(g, 0), 255)
          )}, ${Math.round(Math.min(Math.max(b, 0), 255))}, ${clamp01(a).toFixed(
            3
          )})`;

        const innerInset = bezelInset + 24;
        const innerWidth = width - innerInset * 2;
        const innerHeight = height - innerInset * 2;

        const zoneStates = quickAccessZones.map((zone, index) => ({
          id: zone.id,
          progress: 0,
          target: 0,
          pulseOffset: index * 0.75,
        }));
        const zoneStateMap = new Map(zoneStates.map((state) => [state.id, state]));

        let hoveredZoneId = null;
        let needsRedraw = true;
        let lastRenderedElapsedTime = 0;

        const renderMatrixOverlay = () => {
          context.save();
          drawRoundedRect(innerInset, innerInset, innerWidth, innerHeight, 28);
          context.clip();

          const overlayGradient = context.createLinearGradient(
            innerInset,
            innerInset,
            innerInset,
            innerInset + innerHeight
          );
          overlayGradient.addColorStop(0, "rgba(45, 212, 191, 0.14)");
          overlayGradient.addColorStop(0.45, "rgba(45, 212, 191, 0.06)");
          overlayGradient.addColorStop(1, "rgba(14, 116, 144, 0.12)");

          context.fillStyle = overlayGradient;
          context.fillRect(innerInset, innerInset, innerWidth, innerHeight);

          context.fillStyle = "rgba(2, 6, 23, 0.4)";
          context.fillRect(innerInset, innerInset, innerWidth, innerHeight);
          context.restore();
        };

        const render = (elapsedTime = 0) => {
          context.clearRect(0, 0, width, height);

          const backgroundGradient = context.createLinearGradient(0, 0, width, height);
          backgroundGradient.addColorStop(0, "#071122");
          backgroundGradient.addColorStop(1, "#041320");

          context.fillStyle = backgroundGradient;
          context.fillRect(0, 0, width, height);

          const vignetteGradient = context.createRadialGradient(
            width * 0.5,
            height * 0.45,
            Math.min(width, height) * 0.15,
            width * 0.5,
            height * 0.5,
            Math.max(width, height) * 0.75
          );
          vignetteGradient.addColorStop(0, "rgba(30, 41, 59, 0.9)");
          vignetteGradient.addColorStop(1, "rgba(2, 6, 14, 0.95)");

          context.fillStyle = vignetteGradient;
          context.fillRect(0, 0, width, height);

          drawRoundedRect(
            bezelInset,
            bezelInset,
            width - bezelInset * 2,
            height - bezelInset * 2,
            36
          );
          context.fillStyle = "rgba(14, 20, 34, 0.88)";
          context.fill();
          context.lineWidth = 3;
          context.strokeStyle = "rgba(148, 163, 184, 0.35)";
          context.stroke();

          context.save();
          context.shadowColor = "rgba(56, 189, 248, 0.35)";
          context.shadowBlur = 26;
          context.shadowOffsetX = 0;
          context.shadowOffsetY = 0;
          context.fillStyle = "rgba(56, 189, 248, 0.08)";
          drawRoundedRect(innerInset, innerInset, innerWidth, innerHeight, 28);
          context.fill();
          context.restore();

          renderMatrixOverlay();

          context.fillStyle = "rgba(148, 163, 184, 0.7)";
          context.font = "600 28px 'Segoe UI', 'Inter', sans-serif";
          context.textBaseline = "middle";
          context.fillText("TERMINAL", bezelInset + 36, bezelInset + 48);

          const optionZones = quickAccessZones;

          optionZones.forEach((zone) => {
            const optionX = zone.minX;
            const optionY = zone.minY;
            const optionWidth = zone.maxX - zone.minX;
            const zoneState = zoneStateMap.get(zone.id);
            const progress = zoneState ? zoneState.progress : 0;
            const pulse = 0.6 + 0.4 * Math.sin(elapsedTime * 3 + (zoneState?.pulseOffset ?? 0));
            const highlight = progress * pulse;

            const gradientStart = mixColor(baseStartColor, highlightStartColor, progress);
            const gradientEnd = mixColor(baseEndColor, highlightEndColor, progress);

            const optionGradient = context.createLinearGradient(
              optionX,
              optionY,
              optionX + optionWidth,
              optionY + optionHeight
            );
            optionGradient.addColorStop(0, toRgba(gradientStart));
            optionGradient.addColorStop(1, toRgba(gradientEnd));

            context.save();
            context.shadowColor = `rgba(34, 197, 94, ${(0.25 + highlight * 0.45).toFixed(3)})`;
            context.shadowBlur = 24 * highlight;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;

            drawRoundedRect(optionX, optionY, optionWidth, optionHeight, 32);
            context.fillStyle = optionGradient;
            context.fill();

            context.shadowColor = "transparent";
            context.lineWidth = 3 + progress;
            context.strokeStyle = `rgba(148, 163, 184, ${(0.35 + progress * 0.35).toFixed(3)})`;
            context.stroke();

            if (progress > 0.01) {
              const innerGlow = context.createLinearGradient(
                optionX,
                optionY,
                optionX + optionWidth,
                optionY + optionHeight
              );
              innerGlow.addColorStop(0, `rgba(16, 185, 129, ${(0.12 + highlight * 0.2).toFixed(3)})`);
              innerGlow.addColorStop(1, `rgba(6, 182, 212, ${(0.08 + highlight * 0.15).toFixed(3)})`);
              drawRoundedRect(
                optionX + 6,
                optionY + 6,
                optionWidth - 12,
                optionHeight - 12,
                28
              );
              context.strokeStyle = `rgba(94, 234, 212, ${(0.18 + highlight * 0.22).toFixed(3)})`;
              context.lineWidth = 2;
              context.stroke();
            }

            context.restore();

            const titleColor = mixColor(baseTitleColor, highlightTitleColor, progress);
            context.fillStyle = toRgba(titleColor);
            context.font = "700 64px 'Segoe UI', 'Inter', sans-serif";
            context.fillText(zone.title, optionX + 48, optionY + 54);

            const descriptionColor = mixColor(
              baseDescriptionColor,
              highlightDescriptionColor,
              progress
            );
            context.fillStyle = toRgba(descriptionColor);
            context.font = "500 34px 'Segoe UI', 'Inter', sans-serif";
            context.fillText(zone.description, optionX + 48, optionY + 94);
          });
        };

        render();
        needsRedraw = false;

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        return {
          texture,
          setHoveredZone: (zoneId) => {
            if (hoveredZoneId === zoneId) {
              return;
            }

            hoveredZoneId = zoneId ?? null;

            zoneStates.forEach((state) => {
              state.target = state.id === hoveredZoneId ? 1 : 0;
            });
            needsRedraw = true;
          },
          update: (delta = 0, elapsedTime = 0) => {
            zoneStates.forEach((state) => {
              const previousProgress = state.progress;
              if (Math.abs(state.target - state.progress) > 0.001) {
                const step = clamp01(delta * 8);
                state.progress = lerp(state.progress, state.target, step);
              }

              if (Math.abs(previousProgress - state.progress) > 0.001) {
                needsRedraw = true;
              }
            });

            if (!needsRedraw && Math.abs(elapsedTime - lastRenderedElapsedTime) >= 1 / 30) {
              needsRedraw = true;
            }

            if (!needsRedraw) {
              return;
            }

            render(elapsedTime);
            texture.needsUpdate = true;
            needsRedraw = false;
            lastRenderedElapsedTime = elapsedTime;
          },
        };
      } catch (error) {
        console.warn("Falling back to SVG quick access texture", error);
        const fallbackTexture = createQuickAccessFallbackTexture();
        return {
          texture: fallbackTexture,
          setHoveredZone: () => {},
          update: () => {},
        };
      }
    };

    const screenSize = 0.98 * 2; // Double the diagonal of the square screen
    const screenHeight = screenSize;
    const screenWidth = screenSize;
    const screenFillScale = 1.08;
    const bezelPadding = 0.02;
    const bezelWidth = screenWidth + bezelPadding * 2;
    const bezelHeight = screenHeight + bezelPadding * 2;
    const bezelDepth = 0.04;
    const housingBorder = 0.05;
    const housingWidth = bezelWidth + housingBorder * 2;
    const housingHeight = bezelHeight + housingBorder * 2;
    const housingDepth = 0.12;
    const monitorStandNeckHeight = 0.1;
    const monitorStandNeckPositionY = 0.44;
    const monitorAttachmentHeight =
      monitorStandNeckPositionY + monitorStandNeckHeight / 2;
    const monitorCenterY = monitorAttachmentHeight + housingHeight / 2;
    const monitorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth),
      monitorMaterial
    );
    monitorHousing.position.y = monitorCenterY;
    monitorHousing.position.z = 0.12;
    monitorGroup.add(monitorHousing);

    const monitorBezel = new THREE.Mesh(
      new THREE.BoxGeometry(bezelWidth, bezelHeight, bezelDepth),
      new THREE.MeshStandardMaterial({
        color: 0x111c2b,
        metalness: 0.25,
        roughness: 0.45,
      })
    );
    monitorBezel.position.y = monitorCenterY;
    monitorBezel.position.z = 0.14;
    monitorGroup.add(monitorBezel);

    let pendingScreenAspectRatio;
    let applyMonitorAspectRatio;

    const monitorDisplay = createMonitorDisplayTexture();
    const screenTexture =
      monitorDisplay?.texture ??
      loadClampedTexture("../images/index/monitor2.png", (loadedTexture) => {
        const { image } = loadedTexture;
        if (image && image.width && image.height) {
          const aspectRatio = image.width / image.height;

          if (typeof applyMonitorAspectRatio === "function") {
            applyMonitorAspectRatio(aspectRatio);
          } else {
            pendingScreenAspectRatio = aspectRatio;
          }
        }
      });
    const monitorScreenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      // Prevent tone mapping from dimming the UI colours rendered on the
      // monitor and ensure the texture isn't affected by surrounding lights.
      toneMapped: false,
    });

    const monitorScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      monitorScreenMaterial
    );
    monitorScreen.position.set(
      0,
      monitorCenterY,
      monitorHousing.position.z + housingDepth / 2 + 0.005
    );
    monitorScreen.scale.y = screenFillScale;
    monitorScreen.renderOrder = 1;
    monitorScreen.userData.getQuickAccessZones = () => quickAccessZones;
    monitorScreen.userData.getQuickAccessTextureSize = () =>
      quickAccessTextureSize;
    monitorScreen.userData.setHoveredZone = monitorDisplay?.setHoveredZone;
    monitorScreen.userData.updateDisplayTexture = monitorDisplay?.update;
    monitorGroup.add(monitorScreen);

    const originalScreenWidth = screenWidth;
    const originalBezelWidth = bezelWidth;
    const originalHousingWidth = housingWidth;
    const powerButtonEdgeOffset = 0.22;

    const updateMonitorLayout = (aspectRatio) => {
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
        return;
      }

      const adjustedScreenWidth = screenHeight * aspectRatio;
      const adjustedBezelWidth = adjustedScreenWidth + bezelPadding * 2;
      const adjustedHousingWidth = adjustedBezelWidth + housingBorder * 2;

      monitorScreen.scale.x =
        (adjustedScreenWidth / originalScreenWidth) * screenFillScale;
      monitorScreen.scale.y = screenFillScale;
      monitorBezel.scale.x = adjustedBezelWidth / originalBezelWidth;
      monitorHousing.scale.x = adjustedHousingWidth / originalHousingWidth;
      monitorPowerButton.position.x =
        adjustedHousingWidth / 2 - powerButtonEdgeOffset;

      notifyCollidersChanged();
    };

    const monitorStandColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.45, 24),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.4,
        roughness: 0.35,
      })
    );
    monitorStandColumn.position.set(0, 0.25, 0);
    monitorGroup.add(monitorStandColumn);

    const monitorStandNeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, monitorStandNeckHeight, 0.18),
      monitorMaterial
    );
    monitorStandNeck.position.set(0, monitorStandNeckPositionY, 0.09);
    monitorGroup.add(monitorStandNeck);

    const monitorBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.02, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.35,
        roughness: 0.4,
      })
    );
    monitorBase.position.set(0, 0.01, 0);
    monitorGroup.add(monitorBase);

    const monitorPowerButton = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    monitorPowerButton.position.set(
      housingWidth / 2 - powerButtonEdgeOffset,
      monitorCenterY - housingHeight / 2 + 0.2,
      monitorHousing.position.z + housingDepth / 2 - 0.02
    );
    monitorGroup.add(monitorPowerButton);

    applyMonitorAspectRatio = updateMonitorLayout;

    if (
      screenTexture.image &&
      screenTexture.image.width &&
      screenTexture.image.height
    ) {
      applyMonitorAspectRatio(
        screenTexture.image.width / screenTexture.image.height
      );
    } else if (pendingScreenAspectRatio) {
      applyMonitorAspectRatio(pendingScreenAspectRatio);
      pendingScreenAspectRatio = undefined;
    }

    group.add(monitorGroup);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.05, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.2,
        roughness: 0.6,
      })
    );
    keyboard.position.set(-0.08, deskHeight + deskTopThickness + 0.04, 0.28);
    group.add(keyboard);

    const keyboardFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.27, 0.02, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    keyboardFrame.position.set(-0.08, deskHeight + deskTopThickness + 0.05, 0.28);
    group.add(keyboardFrame);

    const mouse = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    mouse.position.set(0.95, deskHeight + deskTopThickness + 0.05, 0.3);
    mouse.rotation.y = Math.PI / 8;
    group.add(mouse);

    const mousePad = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.01, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 })
    );
    mousePad.position.set(0.9, deskHeight + deskTopThickness + 0.035, 0.28);
    group.add(mousePad);

    const towerWidth = 0.5;
    const towerHeight = 0.82;
    const towerDepth = 0.56;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth),
      new THREE.MeshStandardMaterial({
        color: 0x0b1120,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    const towerX = -deskWidth / 2 + 0.45;
    const towerZ = 0.18;
    tower.position.set(towerX, towerHeight / 2, towerZ);
    group.add(tower);

    const frontPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(towerWidth - 0.08, towerHeight - 0.18),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        emissive: new THREE.Color(0x1f2937),
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      })
    );
    frontPanel.position.set(
      towerX + 0.02,
      tower.position.y + 0.06,
      towerZ + towerDepth / 2 + 0.001
    );
    group.add(frontPanel);

    const ventGeometry = new THREE.BoxGeometry(towerWidth - 0.12, 0.02, 0.02);
    const ventMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.2,
    });

    for (let i = 0; i < 5; i += 1) {
      const vent = new THREE.Mesh(ventGeometry, ventMaterial);
      vent.position.set(towerX + 0.02, 0.16 + i * 0.075, towerZ + 0.34);
      group.add(vent);
    }

    const powerLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    powerLight.position.set(
      towerX + 0.16,
      tower.position.y + 0.22,
      towerZ + towerDepth / 2 + 0.006
    );
    group.add(powerLight);

    const leftSpeaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.36, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
    );
    leftSpeaker.rotation.x = Math.PI / 2;
    leftSpeaker.position.set(-0.9, deskHeight + deskTopThickness + 0.18, -0.28);
    group.add(leftSpeaker);

    const rightSpeaker = leftSpeaker.clone();
    rightSpeaker.position.x = 1.1;
    group.add(rightSpeaker);

    const speakerGrillMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.15,
    });

    const speakerGrill = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 24),
      speakerGrillMaterial
    );
    speakerGrill.position.set(-0.9, deskHeight + deskTopThickness + 0.18, -0.1);
    group.add(speakerGrill);

    const speakerGrillRight = speakerGrill.clone();
    speakerGrillRight.position.x = 1.1;
    group.add(speakerGrillRight);

    group.userData.colliderDescriptors = [
      {
        object: deskCollisionVolume,
        padding: new THREE.Vector3(0.08, 0.05, 0.08),
      },
      {
        object: deskTop,
        padding: new THREE.Vector3(0.05, 0.3, 0.05),
      },
      {
        object: monitorGroup,
        padding: new THREE.Vector3(0.08, 0.2, 0.08),
      },
      {
        object: tower,
        padding: new THREE.Vector3(0.06, 0.1, 0.06),
      },
    ];

    group.userData.monitorScreen = monitorScreen;

    const computerSetupScale = (2.5 / 8) * 2;
    group.scale.setScalar(computerSetupScale);

    return group;
  };

  const createOperationsConcourseEnvironment = () => {
    const group = new THREE.Group();

    const deckWidth = roomWidth * 1.35;
    const deckDepth = roomDepth * 0.85;
    const deckThickness = 0.45;

    const minimumWallHeight = BASE_DOOR_HEIGHT + 0.6;
    const wallHeight = Math.max(roomHeight * 0.82, minimumWallHeight);
    const wallThickness = 0.18;

    const bulkheadMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f1f2a),
      roughness: 0.78,
      metalness: 0.22,
      emissive: new THREE.Color(0x0a1b24),
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });

    const roofMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0b1620),
      roughness: 0.82,
      metalness: 0.18,
      emissive: new THREE.Color(0x07101a),
      emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
    });

    const floorBounds = createFloorBounds(deckWidth, deckDepth, {
      paddingX: 0.75,
      paddingZ: 0.75,
    });

    const deckMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f1d33),
      roughness: 0.62,
      metalness: 0.22,
    });

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(deckWidth, deckThickness, deckDepth),
      deckMaterial
    );
    deck.position.y = roomFloorY - deckThickness / 2;
    group.add(deck);

    const wallSpanWidth = deckWidth + 0.9;
    const wallSpanDepth = deckDepth + 0.8;

    const createFramedWallSegments = (
      openingWidth,
      openingHeight,
      direction
    ) => {
      const adjustedOpening = Math.min(
        openingWidth,
        wallSpanWidth - wallThickness * 2.1
      );
      const remainingWidth = Math.max(
        wallSpanWidth - adjustedOpening,
        wallThickness * 2.5
      );
      const segmentWidth = remainingWidth / 2;
      const wallDepth = wallThickness * 1.4;
      const zPosition = (deckDepth / 2 + wallDepth / 2) * direction;

      const segments = [
        new THREE.Mesh(
          new THREE.BoxGeometry(segmentWidth, wallHeight, wallDepth),
          bulkheadMaterial
        ),
        new THREE.Mesh(
          new THREE.BoxGeometry(segmentWidth, wallHeight, wallDepth),
          bulkheadMaterial
        ),
      ];

      segments[0].position.set(
        -(adjustedOpening / 2 + segmentWidth / 2),
        roomFloorY + wallHeight / 2,
        zPosition
      );
      segments[1].position.set(
        adjustedOpening / 2 + segmentWidth / 2,
        roomFloorY + wallHeight / 2,
        zPosition
      );

      segments.forEach((segment) => group.add(segment));

      const remainingHeight = Math.max(wallHeight - openingHeight, 0);
      if (remainingHeight > 0.05) {
        const lintel = new THREE.Mesh(
          new THREE.BoxGeometry(adjustedOpening, remainingHeight, wallDepth),
          bulkheadMaterial
        );
        lintel.position.set(
          0,
          roomFloorY + openingHeight + remainingHeight / 2,
          zPosition
        );
        group.add(lintel);
        segments.push(lintel);
      }

      return segments;
    };

    const sideWallGeometry = new THREE.BoxGeometry(
      wallThickness,
      wallHeight,
      wallSpanDepth
    );

    const leftWall = new THREE.Mesh(sideWallGeometry, bulkheadMaterial);
    leftWall.position.set(
      -wallSpanWidth / 2 - wallThickness / 2,
      roomFloorY + wallHeight / 2,
      0
    );
    group.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.position.x *= -1;
    group.add(rightWall);

    const catwalkWidth = deckWidth * 0.68;
    const catwalkDepth = deckDepth * 0.92;

    const catwalkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f3b5a),
      roughness: 0.45,
      metalness: 0.35,
    });

    const catwalk = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth, 0.12, catwalkDepth),
      catwalkMaterial
    );
    catwalk.position.y = roomFloorY + 0.18;
    group.add(catwalk);

    const railingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x38bdf8),
      emissive: new THREE.Color(0x1d4ed8),
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.25,
    });

    const railHeight = 1.1;
    const railThickness = 0.08;

    const createSideRail = (direction) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(railThickness, railHeight, catwalkDepth),
        railingMaterial
      );
      rail.position.set(
        (catwalkWidth / 2 - railThickness / 2) * direction,
        roomFloorY + 0.55,
        0
      );
      return rail;
    };

    const leftRail = createSideRail(1);
    group.add(leftRail);
    const rightRail = createSideRail(-1);
    group.add(rightRail);

    const frontRail = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth, railHeight, railThickness),
      railingMaterial
    );
    frontRail.position.set(
      0,
      roomFloorY + 0.55,
      catwalkDepth / 2 - railThickness / 2
    );
    group.add(frontRail);

    const rearRail = frontRail.clone();
    rearRail.position.z *= -1;
    group.add(rearRail);

    const holoBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.4, 32),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x111f32),
        roughness: 0.35,
        metalness: 0.6,
      })
    );
    holoBase.position.set(0, roomFloorY + 0.32, -deckDepth * 0.15);
    group.add(holoBase);

    const holoEmitter = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.08, 32),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    holoEmitter.position.set(0, roomFloorY + 0.58, -deckDepth * 0.15);
    group.add(holoEmitter);

    const holoColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.35, 1.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    holoColumn.position.set(0, roomFloorY + 1.25, -deckDepth * 0.15);
    group.add(holoColumn);

    const briefingLight = new THREE.PointLight(0x60a5fa, 1.1, deckDepth * 1.2, 2);
    briefingLight.position.set(0, roomFloorY + 2.2, -deckDepth * 0.18);
    group.add(briefingLight);

    const statusDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(catwalkWidth * 0.9, 1.8),
      new THREE.MeshBasicMaterial({
        color: 0x1d4ed8,
        transparent: true,
        opacity: 0.75,
      })
    );
    statusDisplay.position.set(0, roomFloorY + 1.6, -deckDepth / 2 + 0.05);
    group.add(statusDisplay);

    const statusGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(catwalkWidth * 0.95, 1.9),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    statusGlow.position.set(0, roomFloorY + 1.6, -deckDepth / 2 + 0.07);
    group.add(statusGlow);

    const liftDoor = createHangarDoor(COMMAND_CENTER_DOOR_THEME, {
      includeBackWall: true,
    });
    liftDoor.position.set(
      0,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      deckDepth / 2 - 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.rotation.y = Math.PI;
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    const exteriorExitDoor = createHangarDoor();
    exteriorExitDoor.position.set(
      0,
      roomFloorY + (exteriorExitDoor.userData.height ?? 0) / 2,
      -deckDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    exteriorExitDoor.userData.floorOffset = 0;
    group.add(exteriorExitDoor);

    const exteriorDoorWidth = exteriorExitDoor.userData?.width ?? BASE_DOOR_WIDTH;
    const exteriorDoorHeight =
      exteriorExitDoor.userData?.height ?? BASE_DOOR_HEIGHT;

    const portalTeleportTrigger = {
      destinationFloorId: "operations-exterior",
      localZThreshold: exteriorExitDoor.position.z - 0.6,
      halfWidth: Math.max(exteriorDoorWidth / 2 + 0.45, 1.2),
      minY: roomFloorY - 0.4,
      maxY: roomFloorY + exteriorDoorHeight + 0.4,
    };
    group.userData.portalTeleportTrigger = portalTeleportTrigger;

    const portalLandingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0b171a),
      roughness: 0.64,
      metalness: 0.28,
      emissive: new THREE.Color(0x052e2a),
      emissiveIntensity: 0.2,
    });
    const portalLanding = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth * 0.58, 0.08, catwalkDepth * 0.32),
      portalLandingMaterial
    );
    portalLanding.position.set(0, roomFloorY + 0.04, -deckDepth / 2 - 0.26);
    group.add(portalLanding);

    const portalRamp = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkWidth * 0.36, 0.04, catwalkDepth * 0.12),
      portalLandingMaterial
    );
    portalRamp.position.set(0, roomFloorY + 0.02, -deckDepth / 2 - 0.58);
    group.add(portalRamp);

    const portalGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const portalGlow = new THREE.Mesh(
      new THREE.TorusGeometry(exteriorDoorWidth * 0.55, 0.08, 32, 96),
      portalGlowMaterial
    );
    portalGlow.rotation.x = Math.PI / 2;
    portalGlow.position.set(
      0,
      roomFloorY + exteriorDoorHeight * 0.6,
      -deckDepth / 2 + 0.28
    );
    group.add(portalGlow);

    const portalArchMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x134e4a),
      roughness: 0.42,
      metalness: 0.5,
      emissive: new THREE.Color(0x04302d),
      emissiveIntensity: 0.35,
    });
    const portalArch = new THREE.Mesh(
      new THREE.TorusGeometry(exteriorDoorWidth * 0.62, 0.14, 22, 64, Math.PI),
      portalArchMaterial
    );
    portalArch.rotation.x = Math.PI / 2;
    portalArch.position.set(
      0,
      roomFloorY + exteriorDoorHeight * 0.92,
      -deckDepth / 2 + 0.32
    );
    group.add(portalArch);

    const portalControl = new THREE.Mesh(
      new THREE.PlaneGeometry(
        exteriorDoorWidth * 0.82,
        exteriorDoorHeight * 0.5
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    portalControl.position.set(
      0,
      roomFloorY + exteriorDoorHeight * 0.56,
      -deckDepth / 2 + 0.38
    );
    portalControl.userData.isLiftControl = true;
    portalControl.userData.liftFloorId = "operations-exterior";
    group.add(portalControl);

    const liftDoorOpeningWidth =
      (liftDoor.userData?.width ?? BASE_DOOR_WIDTH) + 0.8;
    const exteriorDoorOpeningWidth =
      (exteriorExitDoor.userData?.width ?? BASE_DOOR_WIDTH) + 0.8;

    const liftDoorOpeningHeight =
      (liftDoor.userData?.height ?? BASE_DOOR_HEIGHT) + 0.35;
    const exteriorDoorOpeningHeight =
      (exteriorExitDoor.userData?.height ?? BASE_DOOR_HEIGHT) + 0.35;

    const frontWallSegments = createFramedWallSegments(
      liftDoorOpeningWidth,
      liftDoorOpeningHeight,
      1
    );
    const rearWallSegments = createFramedWallSegments(
      exteriorDoorOpeningWidth,
      exteriorDoorOpeningHeight,
      -1
    );

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(wallSpanWidth, wallThickness, wallSpanDepth),
      roofMaterial
    );
    roof.position.set(0, roomFloorY + wallHeight + wallThickness / 2, 0);
    group.add(roof);

    const exteriorExitLiftUi = exteriorExitDoor.userData?.liftUi ?? {};
    if (typeof exteriorExitLiftUi.setAccessType === "function") {
      exteriorExitLiftUi.setAccessType("direct");
    }
    const exteriorExitLiftControls = [
      portalControl,
      ...(Array.isArray(exteriorExitLiftUi.controls)
        ? exteriorExitLiftUi.controls
        : []),
    ].filter(Boolean);
    exteriorExitDoor.userData.liftUi = {
      ...exteriorExitLiftUi,
      control: portalControl,
      controls: Array.from(new Set(exteriorExitLiftControls)),
      updateState: ({ current } = {}) => {
        const isActive = current?.id === "operations-exterior";
        portalGlowMaterial.opacity = isActive ? 0.46 : 0.22;
        portalArchMaterial.emissiveIntensity = isActive ? 0.6 : 0.35;
      },
    };

    const adjustableEntries = [
      { object: deck, offset: -deckThickness / 2 },
      { object: catwalk, offset: 0.18 },
      { object: leftRail, offset: 0.55 },
      { object: rightRail, offset: 0.55 },
      { object: frontRail, offset: 0.55 },
      { object: rearRail, offset: 0.55 },
      { object: leftWall, offset: wallHeight / 2 },
      { object: rightWall, offset: wallHeight / 2 },
      ...frontWallSegments.map((segment) => ({
        object: segment,
        offset: wallHeight / 2,
      })),
      ...rearWallSegments.map((segment) => ({
        object: segment,
        offset: wallHeight / 2,
      })),
      { object: roof, offset: wallHeight + wallThickness / 2 },
      { object: holoBase, offset: 0.32 },
      { object: holoEmitter, offset: 0.58 },
      { object: holoColumn, offset: 1.25 },
      { object: statusDisplay, offset: 1.6 },
      { object: statusGlow, offset: 1.6 },
      { object: portalLanding, offset: 0.04 },
      { object: portalRamp, offset: 0.02 },
      { object: portalGlow, offset: exteriorDoorHeight * 0.6 },
      { object: portalArch, offset: exteriorDoorHeight * 0.92 },
      { object: portalControl, offset: exteriorDoorHeight * 0.56 },
    ];

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });
      briefingLight.position.y = roomFloorY + 2.2;
      if (portalTeleportTrigger) {
        const doorWidth = Number.isFinite(exteriorExitDoor.userData?.width)
          ? exteriorExitDoor.userData.width
          : exteriorDoorWidth;
        const doorHeight = Number.isFinite(exteriorExitDoor.userData?.height)
          ? exteriorExitDoor.userData.height
          : exteriorDoorHeight;
        portalTeleportTrigger.halfWidth = Math.max(
          doorWidth / 2 + 0.45,
          doorWidth * 0.6
        );
        portalTeleportTrigger.minY = roomFloorY - 0.4;
        portalTeleportTrigger.maxY = roomFloorY + doorHeight + 0.4;
      }
    };

    const teleportOffset = new THREE.Vector3(0, 0, deckDepth / 2 - 1.8);

    return {
      group,
      liftDoor,
      liftDoors: [liftDoor, exteriorExitDoor],
      updateForRoomHeight,
      teleportOffset,
      bounds: floorBounds,
    };
  };

  const OPERATIONS_EXTERIOR_PLATFORM_WIDTH = roomWidth * 0.82;
  const OPERATIONS_EXTERIOR_PLATFORM_DEPTH = roomDepth * 0.58;
  const operationsExteriorLocalBounds = createFloorBounds(
    OPERATIONS_EXTERIOR_PLATFORM_WIDTH,
    OPERATIONS_EXTERIOR_PLATFORM_DEPTH,
    {
      paddingX: 1,
      paddingZ: 1.35,
    }
  );
  const resolveOperationsExteriorTeleportOffset = () => {
    let mapDefinition = null;
    try {
      mapDefinition = loadOutsideMapFromStorage();
    } catch (error) {
      console.warn("Unable to load stored outside map for spawn", error);
    }
    if (!mapDefinition) {
      mapDefinition = createDefaultOutsideMap();
    }

    let normalizedMap = null;
    try {
      normalizedMap = normalizeOutsideMap(mapDefinition);
    } catch (error) {
      console.warn("Unable to normalize outside map for spawn", error);
      normalizedMap = createDefaultOutsideMap();
    }

    const width = Math.max(1, Number.parseInt(normalizedMap.width, 10));
    const height = Math.max(1, Number.parseInt(normalizedMap.height, 10));
    const desiredWorldWidth = OPERATIONS_EXTERIOR_PLATFORM_WIDTH * 1.4;
    const desiredWorldDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 2.3;
    const minCellSize = ROOM_SCALE_FACTOR * 13.5;
    const maxCellSize = ROOM_SCALE_FACTOR * 36;
    const computedCellSize = Math.min(
      desiredWorldWidth / width,
      desiredWorldDepth / height
    );
    const fallbackCellSize = THREE.MathUtils.clamp(
      Number.isFinite(computedCellSize) && computedCellSize > 0
        ? computedCellSize
        : minCellSize,
      minCellSize,
      maxCellSize
    );
    const desiredCellSize = ROOM_SCALE_FACTOR * 60;
    const cellSize =
      Number.isFinite(desiredCellSize) && desiredCellSize > 0
        ? desiredCellSize
        : fallbackCellSize;

    const mapWorldDepth = height * cellSize;
    const walkwayCenterZ = -OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.08;
    const walkwayDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.42;
    const walkwayFrontEdge = walkwayCenterZ + walkwayDepth / 2;
    const mapCenterZ = walkwayFrontEdge + mapWorldDepth / 2;
    const entranceDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.56;
    const returnDoorZ = mapCenterZ + entranceDepth / 2 - 0.42;
    const platformFrontZ = returnDoorZ - 0.6;
    const platformCenterZ =
      platformFrontZ - OPERATIONS_EXTERIOR_PLATFORM_DEPTH / 2;

    return new THREE.Vector3(0, 0, platformCenterZ);
  };
  const operationsExteriorTeleportOffset =
    resolveOperationsExteriorTeleportOffset();

    const createOperationsExteriorEnvironment = () => {
      const group = new THREE.Group();
      const DOOR_MARKER_PATH = "door-marker";

      const applyDepletedTerrainLife = (mapDefinition) => {
        const storedTerrainLife = loadStoredTerrainLife();
        if (!(storedTerrainLife instanceof Map)) {
          return { map: mapDefinition, changed: false };
        }

        let normalizedMap = null;
        try {
          normalizedMap = normalizeOutsideMap(mapDefinition);
        } catch (error) {
          console.warn("Unable to normalize outside map for terrain life", error);
          return { map: mapDefinition, changed: false };
        }

        let changed = false;
        normalizedMap.cells = normalizedMap.cells.map((cell, index) => {
          const resolvedTerrain = getOutsideTerrainById(cell?.terrainId ?? "void");
          const terrainId = resolvedTerrain?.id ?? "void";
          const cellKey = getTerrainLifeKey(index);
          const terrainLife = cellKey ? storedTerrainLife.get(cellKey) : null;
          if (
            terrainId !== "void" &&
            Number.isFinite(terrainLife) &&
            terrainLife <= 0
          ) {
            changed = true;
            return {
              terrainId: "void",
              tileId: getOutsideTerrainDefaultTileId("void"),
            };
          }
          return cell;
        });

        return { map: normalizedMap, changed };
      };

      const buildOutsideTerrainFromMap = (mapDefinition, walkwayFrontEdge) => {
        if (!mapDefinition || typeof mapDefinition !== "object") {
          return null;
        }

      let normalizedMap = null;
      try {
        normalizedMap = normalizeOutsideMap(mapDefinition);
      } catch (error) {
        console.warn("Unable to normalize outside map definition", error);
        try {
          normalizedMap = createDefaultOutsideMap();
        } catch (fallbackError) {
          console.warn("Unable to create default outside map", fallbackError);
          return null;
        }
      }

      const width = Math.max(1, Number.parseInt(normalizedMap.width, 10));
      const height = Math.max(1, Number.parseInt(normalizedMap.height, 10));
      const normalizedMapName =
        typeof normalizedMap?.name === "string" ? normalizedMap.name.trim() : "";
      const nextGeoVisorMapKey = `${normalizedMapName}|${width}x${height}`;
      if (geoVisorRevealMapKey !== nextGeoVisorMapKey) {
        geoVisorRevealMapKey = nextGeoVisorMapKey;
        const restoredRevealState =
          restoreGeoVisorRevealStateForMapKey(nextGeoVisorMapKey);
        if (!restoredRevealState) {
          schedulePersistGeoVisorRevealState({ force: true });
        }
      }
      const totalCells = width * height;
      const rawCells = Array.isArray(normalizedMap.cells)
        ? normalizedMap.cells.slice(0, totalCells)
        : [];

      while (rawCells.length < totalCells) {
        rawCells.push({
          terrainId: "void",
          tileId: getOutsideTerrainDefaultTileId("void"),
        });
      }

      const desiredWorldWidth = OPERATIONS_EXTERIOR_PLATFORM_WIDTH * 1.4;
      const desiredWorldDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 2.3;
      const minCellSize = ROOM_SCALE_FACTOR * 13.5;
      const maxCellSize = ROOM_SCALE_FACTOR * 36;
      const computedCellSize = Math.min(
        desiredWorldWidth / width,
        desiredWorldDepth / height
      );
      const fallbackCellSize = THREE.MathUtils.clamp(
        Number.isFinite(computedCellSize) && computedCellSize > 0
          ? computedCellSize
          : minCellSize,
        minCellSize,
        maxCellSize
      );
      const desiredCellSize = ROOM_SCALE_FACTOR * 60;
      const cellSize =
        Number.isFinite(desiredCellSize) && desiredCellSize > 0
          ? desiredCellSize
          : fallbackCellSize;

      const mapWorldWidth = width * cellSize;
      const mapWorldDepth = height * cellSize;
      const borderTiles = 0;
      const expandedWorldWidth = mapWorldWidth + borderTiles * 2 * cellSize;
      const expandedWorldDepth = mapWorldDepth + borderTiles * 2 * cellSize;
      const mapNearEdge = walkwayFrontEdge;
      const mapFarEdge = mapNearEdge + mapWorldDepth;
      const mapCenterZ = (mapNearEdge + mapFarEdge) / 2;
      const mapLeftEdge = -mapWorldWidth / 2;
      const mapRightEdge = mapLeftEdge + mapWorldWidth;

      const terrainNoiseAmplitude = Math.min(
        cellSize * 0.08,
        OUTSIDE_HEIGHT_ELEVATION_MAX * 0.35
      );
      const platformBlendDistance = cellSize * 0.85;
      const terrainPlaneSegments = 14;
      const mapGroup = new THREE.Group();
      mapGroup.name = "operations-exterior-outside-map";
      const mapObjectGroup = new THREE.Group();
      mapObjectGroup.name = "operations-exterior-outside-objects";
      mapGroup.add(mapObjectGroup);

      const adjustable = [];
      const colliderDescriptors = [];
      const resourceTargets = [];
      const terrainTiles = [];
      const liftDoors = [];
      const viewDistanceTargets = [];
      const terrainMaterials = new Map();
      const terrainTextures = new Map();
      const geoVisorMaterials = new Map();
      doorMarkersById.clear();
      const objectPlacements = Array.isArray(normalizedMap.objects)
        ? normalizedMap.objects
        : [];

      const concealedTerrainMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(CONCEALED_OUTSIDE_TERRAIN_COLOR),
        roughness: 0.78,
        metalness: 0.18,
        side: THREE.DoubleSide,
      });

      const getTerrainNoise = (x, z) => {
        const primary = Math.sin(x * 0.08 + z * 0.12);
        const secondary = Math.sin(x * 0.14 - z * 0.1) * 0.55;
        const tertiary = Math.sin((x + z) * 0.05) * 0.35;
        return (primary + secondary + tertiary) / 1.9;
      };

      const terrainStyle = OUTSIDE_TERRAIN_TILE_STYLES.get("default") ||
        DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE;
      const tileHeight = terrainStyle.height ?? DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE.height;

      const getSurfaceHeight = (index) => {
        const elevation = getOutsideTerrainElevation(
          normalizedMap.heights?.[index]
        );
        return tileHeight + elevation;
      };

      const OUTSIDE_BORDER_HEIGHT = 60;
      const mapHeightValues = Array.isArray(normalizedMap.heights)
        ? normalizedMap.heights
        : [];
      const maxMapHeightValue = mapHeightValues.reduce(
        (maxHeight, value) => Math.max(maxHeight, clampOutsideHeight(value)),
        OUTSIDE_HEIGHT_MIN
      );
      const borderHeightValue = Math.max(
        OUTSIDE_BORDER_HEIGHT,
        maxMapHeightValue
      );
      const outsideBorderElevation = getOutsideTerrainElevation(
        borderHeightValue
      );

      const baseY = roomFloorY - 0.04;
      const minTerrainSurfaceY =
        roomFloorY +
        OUTSIDE_TERRAIN_CLEARANCE +
        tileHeight +
        getOutsideTerrainElevation(OUTSIDE_HEIGHT_MIN);
      const perimeterTopY =
        roomFloorY +
        OUTSIDE_TERRAIN_CLEARANCE +
        tileHeight +
        outsideBorderElevation +
        terrainNoiseAmplitude;
      const perimeterBottomY = Math.min(baseY, minTerrainSurfaceY);
      const perimeterHeight = Math.max(0.2, perimeterTopY - perimeterBottomY);
      const perimeterThickness = cellSize * 0.6;
      const perimeterMaterialBase = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0b1220),
        roughness: 0.9,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      const perimeterMaterials = new Map();
      const perimeterTexturePath = (() => {
        const firstCellWithData = rawCells.find(
          (cell) => cell?.tileId || cell?.terrainId
        );
        const terrainId = firstCellWithData?.terrainId ?? "nonmetal";
        const tileId =
          firstCellWithData?.tileId ?? getOutsideTerrainDefaultTileId(terrainId);
        return getOutsideTerrainTilePath(tileId, 0);
      })();
      const getPerimeterFaceMaterial = (
        repeatU,
        repeatV,
        { rotateQuarterTurns = 0 } = {}
      ) => {
        if (!perimeterTexturePath) {
          return perimeterMaterialBase;
        }

        const repeatX = Math.max(1, repeatU / cellSize);
        const repeatY = Math.max(1, repeatV / cellSize);
        const materialKey = `${perimeterTexturePath}:${repeatX}:${repeatY}:${rotateQuarterTurns}`;

        if (perimeterMaterials.has(materialKey)) {
          return perimeterMaterials.get(materialKey);
        }

        const texture = loadClampedTexture(perimeterTexturePath);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        if (rotateQuarterTurns) {
          texture.center.set(0.5, 0.5);
          texture.rotation = (Math.PI / 2) * rotateQuarterTurns;
        }
        texture.needsUpdate = true;

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xffffff),
          roughness: terrainStyle.roughness,
          metalness: terrainStyle.metalness,
          emissive: new THREE.Color(terrainStyle.emissive),
          emissiveIntensity: terrainStyle.emissiveIntensity ?? 1,
          map: texture,
          side: THREE.DoubleSide,
        });
        perimeterMaterials.set(materialKey, material);
        return material;
      };
      const getPerimeterBoxMaterials = (
        sizeX,
        sizeY,
        sizeZ,
        {
          rotateRightLeftQuarterTurns = 0,
          rotateFrontBackQuarterTurns = 0,
        } = {}
      ) => {
        if (!perimeterTexturePath) {
          return perimeterMaterialBase;
        }

        return [
          getPerimeterFaceMaterial(sizeZ, sizeY, {
            rotateQuarterTurns: rotateRightLeftQuarterTurns,
          }),
          getPerimeterFaceMaterial(sizeZ, sizeY, {
            rotateQuarterTurns: rotateRightLeftQuarterTurns,
          }),
          getPerimeterFaceMaterial(sizeX, sizeZ),
          getPerimeterFaceMaterial(sizeX, sizeZ),
          getPerimeterFaceMaterial(sizeX, sizeY, {
            rotateQuarterTurns: rotateFrontBackQuarterTurns,
          }),
          getPerimeterFaceMaterial(sizeX, sizeY, {
            rotateQuarterTurns: rotateFrontBackQuarterTurns,
          }),
        ];
      };
      const expandedHalfWidth = expandedWorldWidth / 2;
      const expandedHalfDepth = expandedWorldDepth / 2;
      const perimeterCenterY = (perimeterTopY + perimeterBottomY) / 2;

      const northSouthWallGeometry = new THREE.BoxGeometry(
        expandedWorldWidth,
        perimeterHeight,
        perimeterThickness
      );

      const northWall = new THREE.Mesh(
        northSouthWallGeometry,
        getPerimeterBoxMaterials(
          expandedWorldWidth,
          perimeterHeight,
          perimeterThickness,
          { rotateFrontBackQuarterTurns: -1 }
        )
      );
      northWall.position.set(
        0,
        perimeterCenterY,
        mapCenterZ - expandedHalfDepth + perimeterThickness / 2
      );
      mapGroup.add(northWall);
      adjustable.push({
        object: northWall,
        offset: northWall.position.y - roomFloorY,
      });
      colliderDescriptors.push({ object: northWall });

      const southWall = northWall.clone();
      southWall.position.z = mapCenterZ + expandedHalfDepth - perimeterThickness / 2;
      mapGroup.add(southWall);
      adjustable.push({
        object: southWall,
        offset: southWall.position.y - roomFloorY,
      });
      colliderDescriptors.push({ object: southWall });

      const sideWallDepth = Math.max(
        perimeterThickness,
        expandedWorldDepth - perimeterThickness * 2
      );
      const eastWestWallGeometry = new THREE.BoxGeometry(
        perimeterThickness,
        perimeterHeight,
        sideWallDepth
      );

      const westWall = new THREE.Mesh(
        eastWestWallGeometry,
        getPerimeterBoxMaterials(
          perimeterThickness,
          perimeterHeight,
          sideWallDepth,
          { rotateRightLeftQuarterTurns: -1 }
        ),
      );
      westWall.position.set(
        -expandedHalfWidth + perimeterThickness / 2,
        perimeterCenterY,
        mapCenterZ
      );
      mapGroup.add(westWall);
      adjustable.push({
        object: westWall,
        offset: westWall.position.y - roomFloorY,
      });
      colliderDescriptors.push({ object: westWall });

      const eastWall = westWall.clone();
      eastWall.position.x = expandedHalfWidth - perimeterThickness / 2;
      mapGroup.add(eastWall);
      adjustable.push({
        object: eastWall,
        offset: eastWall.position.y - roomFloorY,
      });
      colliderDescriptors.push({ object: eastWall });
      terrainTiles.push(northWall, southWall, westWall, eastWall);

      const getCellElevation = (column, row) => {
        const clampedColumn = THREE.MathUtils.clamp(column, 0, width - 1);
        const clampedRow = THREE.MathUtils.clamp(row, 0, height - 1);
        const index = clampedRow * width + clampedColumn;
        return getOutsideTerrainElevation(normalizedMap.heights?.[index]);
      };

      const TERRAIN_BLEND_ROUNDING_STRENGTH = 0.28;
      const TERRAIN_CIRCULAR_BLEND_STRENGTH = 0.82;
      const TERRAIN_CIRCULAR_BLEND_RADIUS = 1.65;
      const TERRAIN_CIRCULAR_BLEND_RADIUS_SQUARED =
        TERRAIN_CIRCULAR_BLEND_RADIUS * TERRAIN_CIRCULAR_BLEND_RADIUS;
      const TERRAIN_EDGE_COLOR_TINT_STRENGTH = 0.36;
      const TERRAIN_EDGE_COLOR_BLEND_STRENGTH = 0.46;
      const TERRAIN_EDGE_COLOR_BLEND_INNER_RADIUS = 0.32;
      const cellEdgeTintColors = rawCells.map((cell) => {
        const resolvedTerrain = getOutsideTerrainById(cell?.terrainId ?? "void");
        const terrainColor = new THREE.Color(
          resolvedTerrain?.color ?? DEFAULT_OUTSIDE_TERRAIN_COLOR
        );
        return new THREE.Color(0xffffff).lerp(
          terrainColor,
          TERRAIN_EDGE_COLOR_TINT_STRENGTH
        );
      });
      const getCellEdgeTintColor = (column, row, targetColor) => {
        const clampedColumn = THREE.MathUtils.clamp(column, 0, width - 1);
        const clampedRow = THREE.MathUtils.clamp(row, 0, height - 1);
        const index = clampedRow * width + clampedColumn;
        const color = cellEdgeTintColors[index];
        if (color && color.isColor) {
          return targetColor.copy(color);
        }
        return targetColor.setRGB(1, 1, 1);
      };
      const getRoundedBlendFactor = (value) => {
        const linearBlend = THREE.MathUtils.clamp(value, 0, 1);
        const easedBlend = THREE.MathUtils.smootherstep(linearBlend, 0, 1);
        return THREE.MathUtils.lerp(
          linearBlend,
          easedBlend,
          TERRAIN_BLEND_ROUNDING_STRENGTH
        );
      };

      const getCircularKernelElevation = (sampleColumn, sampleRow) => {
        const baseColumn = Math.floor(sampleColumn);
        const baseRow = Math.floor(sampleRow);
        const sampleRadiusCells = Math.max(
          1,
          Math.ceil(TERRAIN_CIRCULAR_BLEND_RADIUS)
        );
        let weightedElevationSum = 0;
        let totalWeight = 0;

        for (
          let rowOffset = -sampleRadiusCells;
          rowOffset <= sampleRadiusCells;
          rowOffset += 1
        ) {
          for (
            let columnOffset = -sampleRadiusCells;
            columnOffset <= sampleRadiusCells;
            columnOffset += 1
          ) {
            const neighborColumn = baseColumn + columnOffset;
            const neighborRow = baseRow + rowOffset;
            const centerColumn = neighborColumn + 0.5;
            const centerRow = neighborRow + 0.5;
            const deltaColumn = sampleColumn - centerColumn;
            const deltaRow = sampleRow - centerRow;
            const normalizedDistanceSquared =
              (deltaColumn * deltaColumn + deltaRow * deltaRow) /
              TERRAIN_CIRCULAR_BLEND_RADIUS_SQUARED;

            if (normalizedDistanceSquared >= 1) {
              continue;
            }

            const radialFalloff = 1 - normalizedDistanceSquared;
            const easedFalloff = THREE.MathUtils.smootherstep(
              radialFalloff,
              0,
              1
            );
            const weight = easedFalloff * easedFalloff * easedFalloff;
            if (weight <= 0) {
              continue;
            }

            weightedElevationSum +=
              getCellElevation(neighborColumn, neighborRow) * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight <= 0) {
          return getCellElevation(baseColumn, baseRow);
        }

        return weightedElevationSum / totalWeight;
      };

      const circularKernelColorScratch = new THREE.Color(0xffffff);
      const getCircularKernelTerrainColor = (
        sampleColumn,
        sampleRow,
        targetColor
      ) => {
        const baseColumn = Math.floor(sampleColumn);
        const baseRow = Math.floor(sampleRow);
        const sampleRadiusCells = Math.max(
          1,
          Math.ceil(TERRAIN_CIRCULAR_BLEND_RADIUS)
        );
        let weightedColorR = 0;
        let weightedColorG = 0;
        let weightedColorB = 0;
        let totalWeight = 0;

        for (
          let rowOffset = -sampleRadiusCells;
          rowOffset <= sampleRadiusCells;
          rowOffset += 1
        ) {
          for (
            let columnOffset = -sampleRadiusCells;
            columnOffset <= sampleRadiusCells;
            columnOffset += 1
          ) {
            const neighborColumn = baseColumn + columnOffset;
            const neighborRow = baseRow + rowOffset;
            const centerColumn = neighborColumn + 0.5;
            const centerRow = neighborRow + 0.5;
            const deltaColumn = sampleColumn - centerColumn;
            const deltaRow = sampleRow - centerRow;
            const normalizedDistanceSquared =
              (deltaColumn * deltaColumn + deltaRow * deltaRow) /
              TERRAIN_CIRCULAR_BLEND_RADIUS_SQUARED;

            if (normalizedDistanceSquared >= 1) {
              continue;
            }

            const radialFalloff = 1 - normalizedDistanceSquared;
            const easedFalloff = THREE.MathUtils.smootherstep(
              radialFalloff,
              0,
              1
            );
            const weight = easedFalloff * easedFalloff * easedFalloff;
            if (weight <= 0) {
              continue;
            }

            getCellEdgeTintColor(
              neighborColumn,
              neighborRow,
              circularKernelColorScratch
            );
            weightedColorR += circularKernelColorScratch.r * weight;
            weightedColorG += circularKernelColorScratch.g * weight;
            weightedColorB += circularKernelColorScratch.b * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight <= 0) {
          return getCellEdgeTintColor(baseColumn, baseRow, targetColor);
        }

        return targetColor.setRGB(
          weightedColorR / totalWeight,
          weightedColorG / totalWeight,
          weightedColorB / totalWeight
        );
      };

      const getBlendedElevation = (column, row, xBlend, zBlend) => {
        const clampedXBlend = THREE.MathUtils.clamp(xBlend, 0, 1);
        const clampedZBlend = THREE.MathUtils.clamp(zBlend, 0, 1);
        const elevation00 = getCellElevation(column, row);
        const elevation10 = getCellElevation(column + 1, row);
        const elevation01 = getCellElevation(column, row + 1);
        const elevation11 = getCellElevation(column + 1, row + 1);
        const roundedXBlend = getRoundedBlendFactor(clampedXBlend);
        const roundedZBlend = getRoundedBlendFactor(clampedZBlend);
        const northBlend = THREE.MathUtils.lerp(
          elevation00,
          elevation10,
          roundedXBlend
        );
        const southBlend = THREE.MathUtils.lerp(
          elevation01,
          elevation11,
          roundedXBlend
        );
        const roundedBilinearElevation = THREE.MathUtils.lerp(
          northBlend,
          southBlend,
          roundedZBlend
        );
        const sampleColumn = column + clampedXBlend;
        const sampleRow = row + clampedZBlend;
        const circularElevation = getCircularKernelElevation(
          sampleColumn,
          sampleRow
        );
        return THREE.MathUtils.lerp(
          roundedBilinearElevation,
          circularElevation,
          TERRAIN_CIRCULAR_BLEND_STRENGTH
        );
      };

      const createTerrainTileGeometry = (
        column,
        row,
        tileHeight,
        isInsideMap,
        segments = terrainPlaneSegments
      ) => {
        const resolvedSegments = Math.max(1, Math.floor(segments));
        const geometry = new THREE.PlaneGeometry(
          cellSize,
          cellSize,
          resolvedSegments,
          resolvedSegments
        );
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.attributes.position;
        const vertexColors = new Float32Array(positions.count * 3);
        const sampledTerrainColor = new THREE.Color(0xffffff);
        const blendedVertexColor = new THREE.Color(0xffffff);
        const centerX = mapLeftEdge + column * cellSize + cellSize / 2;
        const centerZ = mapNearEdge + row * cellSize + cellSize / 2;

        const platformLocalY = -OUTSIDE_TERRAIN_CLEARANCE;
        for (let index = 0; index < positions.count; index += 1) {
          const colorIndex = index * 3;

          if (!isInsideMap) {
            positions.setY(index, platformLocalY);
            vertexColors[colorIndex] = 1;
            vertexColors[colorIndex + 1] = 1;
            vertexColors[colorIndex + 2] = 1;
            continue;
          }

          const localX = positions.getX(index);
          const localZ = positions.getZ(index);
          const xBlend = THREE.MathUtils.clamp(
            localX / cellSize + 0.5,
            0,
            1
          );
          const zBlend = THREE.MathUtils.clamp(
            localZ / cellSize + 0.5,
            0,
            1
          );
          const sampleColumn = column + xBlend;
          const sampleRow = row + zBlend;
          const baseHeight =
            tileHeight + getBlendedElevation(column, row, xBlend, zBlend);
          const worldX = centerX + localX;
          const worldZ = centerZ + localZ;
          const noise = getTerrainNoise(worldX, worldZ);
          const terrainY = baseHeight + noise * terrainNoiseAmplitude;
          let blendedY = terrainY;

          const distanceFromPlatform = Math.abs(worldZ - mapNearEdge);
          const distanceToPlatform = Math.max(
            0,
            platformBlendDistance - distanceFromPlatform
          );
          const blendWeight = THREE.MathUtils.smoothstep(
            distanceToPlatform,
            0,
            platformBlendDistance
          );
          blendedY = THREE.MathUtils.lerp(
            terrainY,
            platformLocalY,
            blendWeight
          );

          positions.setY(index, blendedY);
          getCircularKernelTerrainColor(
            sampleColumn,
            sampleRow,
            sampledTerrainColor
          );
          const radialEdgeDistance = THREE.MathUtils.clamp(
            Math.hypot((xBlend - 0.5) * 2, (zBlend - 0.5) * 2),
            0,
            1
          );
          const edgeBlendMask = THREE.MathUtils.smootherstep(
            radialEdgeDistance,
            TERRAIN_EDGE_COLOR_BLEND_INNER_RADIUS,
            1
          );
          const edgeBlendStrength =
            edgeBlendMask * TERRAIN_EDGE_COLOR_BLEND_STRENGTH;
          blendedVertexColor
            .setRGB(1, 1, 1)
            .lerp(sampledTerrainColor, edgeBlendStrength);
          vertexColors[colorIndex] = blendedVertexColor.r;
          vertexColors[colorIndex + 1] = blendedVertexColor.g;
          vertexColors[colorIndex + 2] = blendedVertexColor.b;
        }

        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(vertexColors, 3)
        );
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
      };

      const getTextureForTerrainTile = (tileId, variantIndex) => {
        const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);

        if (!texturePath) {
          return null;
        }

        if (!terrainTextures.has(texturePath)) {
          const texture = loadClampedTexture(texturePath);
          terrainTextures.set(texturePath, texture);
        }

        return terrainTextures.get(texturePath);
      };

      const getMaterialForTerrain = (terrainId, tileId, variantIndex) => {
        if (CONCEAL_OUTSIDE_TERRAIN_TILES) {
          return concealedTerrainMaterial;
        }

        const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);
        const materialKey = `${terrainId}:${texturePath ?? "none"}`;

        if (terrainMaterials.has(materialKey)) {
          return terrainMaterials.get(materialKey);
        }

        const terrainStyle = OUTSIDE_TERRAIN_TILE_STYLES.get("default") ||
          DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE;
        const terrain = getOutsideTerrainById(terrainId);
        const texture = getTextureForTerrainTile(tileId, variantIndex);
        const baseColor = texture
          ? 0xffffff
          : terrainId === "void"
            ? terrainStyle.color ??
              terrain?.color ??
              DEFAULT_OUTSIDE_TERRAIN_COLOR
            : 0xffffff;
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor),
          roughness: terrainStyle.roughness,
          metalness: terrainStyle.metalness,
          emissive: new THREE.Color(terrainStyle.emissive),
          emissiveIntensity: terrainStyle.emissiveIntensity ?? 1,
          map: texture ?? null,
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: false,
          opacity: terrainStyle.opacity,
        });
        terrainMaterials.set(materialKey, material);
        return material;
      };

      const getGeoVisorMaterialForTerrain = (
        terrainId,
        tileId,
        variantIndex
      ) => {
        const texturePath = getOutsideTerrainTilePath(tileId, variantIndex);
        const materialKey = `${terrainId}:${texturePath ?? "none"}`;

        if (geoVisorMaterials.has(materialKey)) {
          return geoVisorMaterials.get(materialKey);
        }

        const terrainStyle = OUTSIDE_TERRAIN_TILE_STYLES.get("default") ||
          DEFAULT_OUTSIDE_TERRAIN_TILE_STYLE;
        const terrain = getOutsideTerrainById(terrainId);
        const terrainColor = terrain?.color ?? DEFAULT_OUTSIDE_TERRAIN_COLOR;
        const texture = getTextureForTerrainTile(tileId, variantIndex);
        const baseColor = texture ? 0xffffff : terrainColor;
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor),
          roughness: terrainStyle.roughness,
          metalness: terrainStyle.metalness,
          emissive: new THREE.Color(terrainColor),
          emissiveIntensity: Math.max(
            0.65,
            terrainStyle.emissiveIntensity ?? 0
          ),
          map: texture ?? null,
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: terrainStyle.opacity ?? 1,
        });
        geoVisorMaterials.set(materialKey, material);
        return material;
      };

      const DOOR_POSITION_EPSILON = 0.01;

      const resolveDoorPlacementId = (placement) => {
        if (!placement || placement.path !== DOOR_MARKER_PATH) {
          return null;
        }
        const position = placement.position ?? null;
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
          return null;
        }
        const xIndex = Math.round(position.x + width / 2 - 0.5);
        const yIndex = Math.round(position.z + height / 2 - 0.5);
        if (xIndex < 0 || yIndex < 0 || xIndex >= width || yIndex >= height) {
          return null;
        }
        const worldX = xIndex - width / 2 + 0.5;
        const worldZ = yIndex - height / 2 + 0.5;
        const matchesX = Math.abs(position.x - worldX) <= DOOR_POSITION_EPSILON;
        const matchesZ =
          Math.abs(position.z - worldZ) <= DOOR_POSITION_EPSILON ||
          Math.abs(position.z - (worldZ - 0.5)) <= DOOR_POSITION_EPSILON;
        if (!matchesX || !matchesZ) {
          return null;
        }
        return `door-${xIndex + 1}-${yIndex + 1}`;
      };

      const getPlacementWorldPosition = (placement) => {
        const position = placement?.position ?? {};
        const placementX = Number.isFinite(position.x) ? position.x : 0;
        const placementZ = Number.isFinite(position.z) ? position.z : 0;
        const column = Math.floor(placementX + width / 2);
        const row = Math.floor(placementZ + height / 2);
        const clampedColumn = THREE.MathUtils.clamp(column, 0, width - 1);
        const clampedRow = THREE.MathUtils.clamp(row, 0, height - 1);
        const index = clampedRow * width + clampedColumn;
        const elevation = getOutsideTerrainElevation(
          normalizedMap.heights?.[index]
        );
        return {
          x: placementX * cellSize,
          z: mapCenterZ + placementZ * cellSize,
          surfaceY: roomFloorY + OUTSIDE_TERRAIN_CLEARANCE + elevation,
        };
      };

      const alignObjectToSurface = (object, surfaceY) => {
        if (!object || !Number.isFinite(surfaceY)) {
          return;
        }
        object.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(object);
        if (!Number.isFinite(bounds.min.y)) {
          return;
        }
        const offset = surfaceY - bounds.min.y;
        if (!Number.isFinite(offset) || Math.abs(offset) < 0.0001) {
          return;
        }
        object.position.y += offset;
        object.updateMatrixWorld(true);
      };

      const applyPlacementTransform = (
        object,
        placement,
        { surfaceY, alignToSurface = true }
      ) => {
        const position = placement?.position ?? {};
        const rotation = placement?.rotation ?? {};
        const scale = placement?.scale ?? {};
        const placementPosition = getPlacementWorldPosition(placement);
        object.position.set(
          placementPosition.x,
          surfaceY,
          placementPosition.z
        );
        object.rotation.set(
          Number.isFinite(rotation.x) ? rotation.x : 0,
          Number.isFinite(rotation.y) ? rotation.y : 0,
          Number.isFinite(rotation.z) ? rotation.z : 0
        );
        object.scale.set(
          Number.isFinite(scale.x) ? scale.x : 1,
          Number.isFinite(scale.y) ? scale.y : 1,
          Number.isFinite(scale.z) ? scale.z : 1
        );
        if (alignToSurface) {
          alignObjectToSurface(object, surfaceY);
        }
      };

      const clampColumnIndex = (column) =>
        THREE.MathUtils.clamp(column, 0, width - 1);
      const clampRowIndex = (row) => THREE.MathUtils.clamp(row, 0, height - 1);
      const getCellIndex = (column, row) => {
        const clampedColumn = clampColumnIndex(column);
        const clampedRow = clampRowIndex(row);
        return clampedRow * width + clampedColumn;
      };
      const getSurfaceYAtWorldPosition = (worldX, worldZ) => {
        const column = Math.floor((worldX - mapLeftEdge) / cellSize);
        const row = Math.floor((worldZ - mapNearEdge) / cellSize);
        const clampedColumn = clampColumnIndex(column);
        const clampedRow = clampRowIndex(row);
        const cellOriginX = mapLeftEdge + clampedColumn * cellSize;
        const cellOriginZ = mapNearEdge + clampedRow * cellSize;
        const xBlend = THREE.MathUtils.clamp(
          (worldX - cellOriginX) / cellSize,
          0,
          1
        );
        const zBlend = THREE.MathUtils.clamp(
          (worldZ - cellOriginZ) / cellSize,
          0,
          1
        );
        const baseHeight =
          tileHeight + getBlendedElevation(clampedColumn, clampedRow, xBlend, zBlend);
        const noise = getTerrainNoise(worldX, worldZ);
        const terrainY = baseHeight + noise * terrainNoiseAmplitude;
        const distanceFromPlatform = Math.abs(worldZ - mapNearEdge);
        const distanceToPlatform = Math.max(
          0,
          platformBlendDistance - distanceFromPlatform
        );
        const blendWeight = THREE.MathUtils.smoothstep(
          distanceToPlatform,
          0,
          platformBlendDistance
        );
        const platformLocalY = -OUTSIDE_TERRAIN_CLEARANCE;
        const blendedY = THREE.MathUtils.lerp(
          terrainY,
          platformLocalY,
          blendWeight
        );
        return roomFloorY + OUTSIDE_TERRAIN_CLEARANCE + blendedY;
      };
      const getSurfaceYForFootprint = (
        centerX,
        centerZ,
        rotationY,
        footprintWidth,
        footprintDepth,
        footprintPadding = 0,
        sampleSteps = 2
      ) => {
        if (
          !Number.isFinite(centerX) ||
          !Number.isFinite(centerZ) ||
          !Number.isFinite(footprintWidth) ||
          !Number.isFinite(footprintDepth)
        ) {
          return getSurfaceYAtWorldPosition(centerX, centerZ);
        }
        const halfWidth = Math.max(0.01, footprintWidth / 2 + footprintPadding);
        const halfDepth = Math.max(0.01, footprintDepth / 2 + footprintPadding);
        const cosY = Math.cos(rotationY ?? 0);
        const sinY = Math.sin(rotationY ?? 0);
        const gridSteps = Math.max(1, Math.floor(sampleSteps));
        const offsets = [];
        for (let xStep = 0; xStep <= gridSteps; xStep += 1) {
          const xBlend = xStep / gridSteps;
          const offsetX = THREE.MathUtils.lerp(-halfWidth, halfWidth, xBlend);
          for (let zStep = 0; zStep <= gridSteps; zStep += 1) {
            const zBlend = zStep / gridSteps;
            const offsetZ = THREE.MathUtils.lerp(-halfDepth, halfDepth, zBlend);
            offsets.push([offsetX, offsetZ]);
          }
        }
        let maxSurfaceY = -Infinity;
        offsets.forEach(([offsetX, offsetZ]) => {
          const rotatedX = offsetX * cosY - offsetZ * sinY;
          const rotatedZ = offsetX * sinY + offsetZ * cosY;
          const sampleY = getSurfaceYAtWorldPosition(
            centerX + rotatedX,
            centerZ + rotatedZ
          );
          if (Number.isFinite(sampleY)) {
            maxSurfaceY = Math.max(maxSurfaceY, sampleY);
          }
        });
        if (!Number.isFinite(maxSurfaceY)) {
          return getSurfaceYAtWorldPosition(centerX, centerZ);
        }
        return maxSurfaceY;
      };

      const terrainDetailDistance = cellSize * 6;
      // Keep consistent tessellation across neighboring tiles to avoid
      // T-junction cracks on blended entrance slopes.
      const terrainLowDetailSegments = terrainPlaneSegments;
      const terrainDetailCenterX = 0;
      const terrainDetailCenterZ = mapCenterZ;
      const tileMapBounds = {
        minX: mapLeftEdge,
        maxX: mapRightEdge,
        minZ: Math.min(mapNearEdge, mapFarEdge),
        maxZ: Math.max(mapNearEdge, mapFarEdge),
      };

      const windowedTileRegistry = new Map();
      const windowedTileColliders = new Map();
      const windowedTileAdjustables = new Map();
      const terrainWindowState = {
        minColumn: null,
        maxColumn: null,
        minRow: null,
        maxRow: null,
      };
      const cameraWorldPosition = new THREE.Vector3();
      const cameraLocalPosition = new THREE.Vector3();

      const getWindowViewDistance = () => {
        const baseDistance =
          BASE_VIEW_DISTANCE *
          viewSettings.distanceMultiplier *
          VIEW_DISTANCE_CULLING_BUFFER;
        if (!Array.isArray(viewDistanceTargets) || viewDistanceTargets.length === 0) {
          return baseDistance;
        }

        const maxMultiplier = viewDistanceTargets.reduce((maxDistance, target) => {
          const multiplier = Number.isFinite(target?.userData?.viewDistanceMultiplier)
            ? target.userData.viewDistanceMultiplier
            : 1;
          return Math.max(maxDistance, multiplier);
        }, 1);

        return baseDistance * maxMultiplier;
      };

      const registerTileColliderIfNeeded = (tile, surfaceHeight) => {
        if (!tile || !Number.isFinite(surfaceHeight)) {
          return;
        }

        if (surfaceHeight <= getMaxStepHeight() + 0.1) {
          return;
        }

        const registered = registerColliderDescriptors([{ object: tile }]);
        if (Array.isArray(registered) && registered.length > 0) {
          windowedTileColliders.set(tile, registered);
        }
      };

      const disposeTileChildren = (tile) => {
        if (!tile) {
          return;
        }

        tile.children.forEach((child) => {
          if (!child) {
            return;
          }

          if (child.geometry && typeof child.geometry.dispose === "function") {
            child.geometry.dispose();
          }

          const { material } = child;
          if (Array.isArray(material)) {
            material.forEach((entry) => {
              if (entry && typeof entry.dispose === "function") {
                entry.dispose();
              }
            });
          } else if (material && typeof material.dispose === "function") {
            material.dispose();
          }
        });
      };

      const removeWindowedTile = (tileKey) => {
        const tile = windowedTileRegistry.get(tileKey);
        if (!tile) {
          return false;
        }

        const colliderEntries = windowedTileColliders.get(tile);
        if (Array.isArray(colliderEntries) && colliderEntries.length > 0) {
          unregisterColliderDescriptors(colliderEntries);
          windowedTileColliders.delete(tile);
        }

        const adjustableEntry = windowedTileAdjustables.get(tile);
        if (adjustableEntry) {
          const adjustableIndex = adjustable.indexOf(adjustableEntry);
          if (adjustableIndex >= 0) {
            adjustable.splice(adjustableIndex, 1);
          }
          windowedTileAdjustables.delete(tile);
        }

        const terrainIndex = terrainTiles.indexOf(tile);
        if (terrainIndex >= 0) {
          terrainTiles.splice(terrainIndex, 1);
        }

        const resourceIndex = resourceTargets.indexOf(tile);
        if (resourceIndex >= 0) {
          resourceTargets.splice(resourceIndex, 1);
        }

        mapGroup.remove(tile);
        disposeTileChildren(tile);
        if (tile.geometry && typeof tile.geometry.dispose === "function") {
          tile.geometry.dispose();
        }

        windowedTileRegistry.delete(tileKey);
        return true;
      };

      const createWindowedTile = (column, row) => {
        const index = getCellIndex(column, row);
        const cellData = rawCells[index] ?? {};
        const terrainId = cellData?.terrainId ?? "void";
        const tileId =
          cellData?.tileId ?? getOutsideTerrainDefaultTileId(terrainId);
        const resolvedTerrain = getOutsideTerrainById(terrainId);
        const elevation = getOutsideTerrainElevation(
          normalizedMap.heights?.[index]
        );
        const surfaceHeight = tileHeight + elevation;
        const tileCenterX = mapLeftEdge + column * cellSize + cellSize / 2;
        const tileCenterZ = mapNearEdge + row * cellSize + cellSize / 2;
        const distanceFromDetailCenter = Math.hypot(
          tileCenterX - terrainDetailCenterX,
          tileCenterZ - terrainDetailCenterZ
        );
        const tileSegments =
          distanceFromDetailCenter > terrainDetailDistance
            ? terrainLowDetailSegments
            : terrainPlaneSegments;
        const tileGeometry = createTerrainTileGeometry(
          column,
          row,
          tileHeight,
          true,
          tileSegments
        );
        const tile = new THREE.Mesh(
          tileGeometry,
          getMaterialForTerrain(resolvedTerrain.id, tileId, index)
        );
        tile.position.set(
          tileCenterX,
          roomFloorY + OUTSIDE_TERRAIN_CLEARANCE,
          tileCenterZ
        );
        tile.castShadow = false;
        tile.receiveShadow = false;
        tile.userData.terrainId = resolvedTerrain.id;
        tile.userData.terrainLabel =
          typeof resolvedTerrain.label === "string"
            ? resolvedTerrain.label
            : resolvedTerrain.id;
        tile.userData.tileId = tileId;
        tile.userData.terrainHeight = surfaceHeight;
        tile.userData.tileVariantIndex = index;
        tile.userData.geoVisorRow = row;
        tile.userData.geoVisorColumn = column;
        tile.userData.geoVisorCellSize = cellSize;
        tile.userData.geoVisorMapLeftEdge = mapLeftEdge;
        tile.userData.geoVisorMapNearEdge = mapNearEdge;
        tile.userData.geoVisorRevealedMaterial = tile.material;
        tile.userData.geoVisorVisorMaterial = getGeoVisorMaterialForTerrain(
          resolvedTerrain.id,
          tileId,
          index
        );
        tile.userData.geoVisorConcealedMaterial = concealedTerrainMaterial;
        const tileWasPreviouslyRevealed = geoVisorRevealedTileIndices.has(index);
        tile.userData.geoVisorRevealed = tileWasPreviouslyRevealed;

        if (tileWasPreviouslyRevealed) {
          applyGeoVisorMaterialToTile(tile, true);
        } else if (geoVisorEnabled) {
          tile.material = concealedTerrainMaterial;
        }

        if (resolvedTerrain.id !== "void") {
          tile.userData.isResourceTarget = true;
          resourceTargets.push(tile);
        }

        if (resolvedTerrain.id === "point") {
          const markerMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(terrainStyle.emissive ?? 0xdb2777),
            emissive: new THREE.Color(terrainStyle.emissive ?? 0xdb2777),
            emissiveIntensity: (terrainStyle.emissiveIntensity ?? 0.45) * 1.2,
            roughness: 0.35,
            metalness: 0.75,
            transparent: true,
            opacity: 0.85,
          });
          const marker = new THREE.Mesh(
            new THREE.ConeGeometry(cellSize * 0.28, cellSize * 0.9, 16),
            markerMaterial
          );
          marker.position.set(0, surfaceHeight + cellSize * 0.5, 0);
          tile.add(marker);
        } else if (resolvedTerrain.id === "hazard") {
          const beaconMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(terrainStyle.emissive ?? 0xff4d6d),
            emissive: new THREE.Color(terrainStyle.emissive ?? 0xff4d6d),
            emissiveIntensity: (terrainStyle.emissiveIntensity ?? 0.32) * 1.4,
            roughness: 0.3,
            metalness: 0.7,
            transparent: true,
            opacity: 0.8,
          });
          const beacon = new THREE.Mesh(
            new THREE.CylinderGeometry(
              cellSize * 0.14,
              cellSize * 0.14,
              cellSize * 0.9,
              16
            ),
            beaconMaterial
          );
          beacon.position.set(0, surfaceHeight + cellSize * 0.45, 0);
          tile.add(beacon);

          const hazardGlow = new THREE.Mesh(
            new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9),
            new THREE.MeshBasicMaterial({
              color: terrainStyle.emissive ?? 0xff6b6b,
              transparent: true,
              opacity: 0.3,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          hazardGlow.position.set(0, surfaceHeight + cellSize * 0.65, 0);
          hazardGlow.rotation.x = -Math.PI / 2;
          tile.add(hazardGlow);
        }

        mapGroup.add(tile);
        terrainTiles.push(tile);
        const adjustableEntry = {
          object: tile,
          offset: tile.position.y - roomFloorY,
        };
        adjustable.push(adjustableEntry);
        windowedTileAdjustables.set(tile, adjustableEntry);
        registerTileColliderIfNeeded(tile, surfaceHeight);

        return tile;
      };

      const updateTerrainWindowing = ({ force = false } = {}) => {
        if (!camera || !mapGroup?.isObject3D) {
          return;
        }

        const viewDistance = getWindowViewDistance();
        if (!Number.isFinite(viewDistance) || viewDistance <= 0) {
          return;
        }

        const bufferTiles = Math.max(1, Math.round((viewDistance / cellSize) * 0.1));
        const bufferDistance = bufferTiles * cellSize;

        mapGroup.updateWorldMatrix(true, false);
        camera.getWorldPosition(cameraWorldPosition);
        cameraLocalPosition.copy(cameraWorldPosition);
        mapGroup.worldToLocal(cameraLocalPosition);

        const clampedCenterX = THREE.MathUtils.clamp(
          cameraLocalPosition.x,
          tileMapBounds.minX,
          tileMapBounds.maxX
        );
        const clampedCenterZ = THREE.MathUtils.clamp(
          cameraLocalPosition.z,
          tileMapBounds.minZ,
          tileMapBounds.maxZ
        );

        const minX = THREE.MathUtils.clamp(
          clampedCenterX - viewDistance - bufferDistance,
          tileMapBounds.minX,
          tileMapBounds.maxX
        );
        const maxX = THREE.MathUtils.clamp(
          clampedCenterX + viewDistance + bufferDistance,
          tileMapBounds.minX,
          tileMapBounds.maxX
        );
        const minZ = THREE.MathUtils.clamp(
          clampedCenterZ - viewDistance - bufferDistance,
          tileMapBounds.minZ,
          tileMapBounds.maxZ
        );
        const maxZ = THREE.MathUtils.clamp(
          clampedCenterZ + viewDistance + bufferDistance,
          tileMapBounds.minZ,
          tileMapBounds.maxZ
        );

        let minColumn = clampColumnIndex(
          Math.floor((minX - mapLeftEdge) / cellSize)
        );
        let maxColumn = clampColumnIndex(
          Math.ceil((maxX - mapLeftEdge) / cellSize) - 1
        );
        let minRow = clampRowIndex(
          Math.floor((minZ - mapNearEdge) / cellSize)
        );
        let maxRow = clampRowIndex(
          Math.ceil((maxZ - mapNearEdge) / cellSize) - 1
        );

        if (maxColumn < minColumn) {
          maxColumn = minColumn;
        }

        if (maxRow < minRow) {
          maxRow = minRow;
        }

        if (
          !force &&
          terrainWindowState.minColumn === minColumn &&
          terrainWindowState.maxColumn === maxColumn &&
          terrainWindowState.minRow === minRow &&
          terrainWindowState.maxRow === maxRow
        ) {
          return;
        }

        const nextKeys = new Set();
        let collidersChanged = false;

        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) {
            const key = `${column},${row}`;
            nextKeys.add(key);
            if (!windowedTileRegistry.has(key)) {
              const tile = createWindowedTile(column, row);
              windowedTileRegistry.set(key, tile);
              collidersChanged = true;
            }
          }
        }

        Array.from(windowedTileRegistry.keys()).forEach((key) => {
          if (!nextKeys.has(key)) {
            if (removeWindowedTile(key)) {
              collidersChanged = true;
            }
          }
        });

        terrainWindowState.minColumn = minColumn;
        terrainWindowState.maxColumn = maxColumn;
        terrainWindowState.minRow = minRow;
        terrainWindowState.maxRow = maxRow;

        if (collidersChanged) {
          rebuildStaticColliders();
        }
      };

      mapGroup.userData.dispose = () => {
        Array.from(windowedTileRegistry.keys()).forEach((key) => {
          removeWindowedTile(key);
        });
      };

      if (objectPlacements.length > 0) {
        const mapDisplayName =
          typeof normalizedMap?.name === "string"
            ? normalizedMap.name.trim()
            : "";
        objectPlacements.forEach(async (placement) => {
          if (!placement?.path) {
            return;
          }
          const placementPosition = getPlacementWorldPosition(placement);
          if (placement.path === DOOR_MARKER_PATH) {
            const door = createHangarDoor();
            if (
              mapDisplayName &&
              typeof door.userData?.liftUi?.updateState === "function"
            ) {
              door.userData.liftUi.updateState({ mapName: mapDisplayName });
            }
            const doorId =
              typeof placement.id === "string" ? placement.id.trim() : null;
            const resolvedDoorId = doorId || resolveDoorPlacementId(placement);
            if (resolvedDoorId) {
              door.userData.doorId = resolvedDoorId;
              doorMarkersById.set(resolvedDoorId, door);
            }
            const destinationType =
              typeof placement.destinationType === "string"
                ? placement.destinationType
                : null;
            const destinationId =
              typeof placement.destinationId === "string"
                ? placement.destinationId
                : null;
            if (destinationType === "area" && destinationId) {
              door.userData.liftFloorId = destinationId;
              door.userData?.liftUi?.setAccessType?.("area");
              const liftControls = [
                door.userData?.liftUi?.control,
                ...(Array.isArray(door.userData?.liftUi?.controls)
                  ? door.userData.liftUi.controls
                  : []),
              ].filter(Boolean);
              liftControls.forEach((control) => {
                if (!control.userData) {
                  control.userData = {};
                }
                control.userData.liftFloorId = destinationId;
              });
            } else if (destinationType === "door" && destinationId) {
              door.userData.doorDestinationId = destinationId;
              door.userData?.liftUi?.setAccessType?.("direct");
              const liftControls = [
                door.userData?.liftUi?.control,
                ...(Array.isArray(door.userData?.liftUi?.controls)
                  ? door.userData.liftUi.controls
                  : []),
              ].filter(Boolean);
              liftControls.forEach((control) => {
                if (!control.userData) {
                  control.userData = {};
                }
                control.userData.doorDestinationId = destinationId;
              });
            }
            const doorHeight = door.userData?.height ?? BASE_DOOR_HEIGHT;
            const doorBaseWidth =
              door.userData?.baseDimensions?.width ?? BASE_DOOR_WIDTH;
            const doorBaseDepth =
              door.userData?.baseDimensions?.depth ?? doorBaseWidth * 0.05;
            const doorRotationY = Number.isFinite(placement?.rotation?.y)
              ? placement.rotation.y
              : 0;
            const doorSurfaceY = getSurfaceYForFootprint(
              placementPosition.x,
              placementPosition.z,
              doorRotationY,
              doorBaseWidth,
              doorBaseDepth,
              OUTSIDE_DOOR_TERRAIN_PADDING,
              4
            );
            applyPlacementTransform(door, placement, {
              surfaceY:
                doorSurfaceY + doorHeight / 2 + OUTSIDE_DOOR_SURFACE_CLEARANCE,
              alignToSurface: false,
            });
            mapObjectGroup.add(door);
            adjustable.push({
              object: door,
              offset: door.position.y - roomFloorY,
            });
            liftDoors.push(door);
            viewDistanceTargets.push(door);
            return;
          }

          try {
            const model = await loadModelFromManifestEntry({
              path: placement.path,
            });
            if (!model) {
              return;
            }
            applyPlacementTransform(model, placement, {
              surfaceY: placementPosition.surfaceY,
              alignToSurface: true,
            });
            mapObjectGroup.add(model);
            adjustable.push({
              object: model,
              offset: model.position.y - roomFloorY,
            });
            viewDistanceTargets.push(model);
          } catch (error) {
            console.warn(
              "Unable to load outside map object",
              placement.path,
              error
            );
          }
        });
      }

      return {
        group: mapGroup,
        center: {
          x: 0,
          z: mapCenterZ,
        },
        getSurfaceYAtWorldPosition,
        bounds: {
          minX: mapLeftEdge,
          maxX: mapRightEdge,
          minZ: Math.min(mapNearEdge, mapFarEdge),
          maxZ: Math.max(mapNearEdge, mapFarEdge),
        },
        updateTerrainWindowing,
        adjustableEntries: adjustable,
        colliderDescriptors,
        liftDoors,
        resourceTargets,
        terrainTiles,
        viewDistanceTargets,
      };
    };

    let mapAdjustableEntries = [];
    const mapColliderDescriptors = [];
    let environmentResourceTargets = [];
    let environmentTerrainTiles = [];
    let environmentViewDistanceTargets = [];
    let outsideMapBounds = null;

    const platformThickness = 0.42;
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x101c21),
      roughness: 0.86,
      metalness: 0.12,
    });
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(
        OPERATIONS_EXTERIOR_PLATFORM_WIDTH,
        platformThickness,
        OPERATIONS_EXTERIOR_PLATFORM_DEPTH
      ),
      platformMaterial
    );
    platform.position.y = roomFloorY - platformThickness / 2;

    const walkwayMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2f33),
      roughness: 0.52,
      metalness: 0.32,
    });
    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(
        OPERATIONS_EXTERIOR_PLATFORM_WIDTH * 0.46,
        0.12,
        OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.42
      ),
      walkwayMaterial
    );
    walkway.position.set(
      0,
      roomFloorY + 0.06,
      -OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.08
    );

    let storedOutsideMap = null;
    try {
      storedOutsideMap = loadOutsideMapFromStorage();
      hasStoredOutsideMap = Boolean(storedOutsideMap);
    } catch (error) {
      console.warn("Unable to load stored outside map", error);
    }
    if (!storedOutsideMap) {
      storedOutsideMap = createDefaultOutsideMap();
    }

    const { map: terrainLifeMap, changed: terrainLifeChanged } =
      applyDepletedTerrainLife(storedOutsideMap);
    storedOutsideMap = terrainLifeMap;
    if (terrainLifeChanged) {
      try {
        storedOutsideMap = saveOutsideMapToStorage(storedOutsideMap);
        hasStoredOutsideMap = true;
      } catch (error) {
        console.warn("Unable to save outside map after terrain life sync", error);
      }
    }

    const walkwayDepth = Number.isFinite(walkway.geometry?.parameters?.depth)
      ? walkway.geometry.parameters.depth
      : OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.42;
    const walkwayFrontEdge = walkway.position.z + walkwayDepth / 2;

    let builtOutsideTerrain = null;
    try {
      builtOutsideTerrain = buildOutsideTerrainFromMap(
        storedOutsideMap,
        walkwayFrontEdge
      );
    } catch (error) {
      console.warn("Unable to build exterior terrain from map", error);
    }

    if (builtOutsideTerrain?.group) {
      group.add(builtOutsideTerrain.group);
    }
    if (Array.isArray(builtOutsideTerrain?.adjustableEntries)) {
      mapAdjustableEntries = builtOutsideTerrain.adjustableEntries;
    }
    if (Array.isArray(builtOutsideTerrain?.colliderDescriptors)) {
      mapColliderDescriptors.push(...builtOutsideTerrain.colliderDescriptors);
    }
    const mapLiftDoors = Array.isArray(builtOutsideTerrain?.liftDoors)
      ? builtOutsideTerrain.liftDoors.filter((door) => door && door.isObject3D)
      : [];
    if (Array.isArray(builtOutsideTerrain?.resourceTargets)) {
      environmentResourceTargets = builtOutsideTerrain.resourceTargets;
    }
    if (Array.isArray(builtOutsideTerrain?.terrainTiles)) {
      environmentTerrainTiles = builtOutsideTerrain.terrainTiles;
    }
    if (Array.isArray(builtOutsideTerrain?.viewDistanceTargets)) {
      // Keep the same array reference so asynchronously loaded outside objects
      // are automatically included in view-distance culling once they spawn.
      environmentViewDistanceTargets = builtOutsideTerrain.viewDistanceTargets;
    }
    if (
      builtOutsideTerrain?.bounds &&
      typeof builtOutsideTerrain.bounds === "object"
    ) {
      outsideMapBounds = builtOutsideTerrain.bounds;
    }

    const baseSkyRadius =
      Math.max(OPERATIONS_EXTERIOR_PLATFORM_WIDTH, OPERATIONS_EXTERIOR_PLATFORM_DEPTH) * 2.2;
    const skyRadius = baseSkyRadius;
    const skyCenterZ =
      Number.isFinite(outsideMapBounds?.minZ) && Number.isFinite(outsideMapBounds?.maxZ)
        ? (outsideMapBounds.minZ + outsideMapBounds.maxZ) / 2
        : 0;
    const starPlaneY = getStarPlaneHeight();
    const starYOffset = starPlaneY - roomFloorY;
    const skyCenter = new THREE.Vector3(0, starPlaneY, skyCenterZ);

    const primaryStarField = createStarField({
      radius: skyRadius,
      count: 1700,
      center: skyCenter,
      size: 0.072,
      opacity: 0.82,
      distribution: "spherical",
    });
    applyStarDepthMaterial(primaryStarField);
    group.add(primaryStarField);

    const distantStarField = createStarField({
      radius: skyRadius * 1.38,
      count: 850,
      center: skyCenter,
      size: 0.05,
      opacity: 0.55,
      colorVariance: 0.06,
      distribution: "spherical",
    });
    applyStarDepthMaterial(distantStarField);
    group.add(distantStarField);

    const ambient = new THREE.AmbientLight(0x0f172a, 0.55);
    group.add(ambient);

    const returnDoor = createHangarDoor(COMMAND_CENTER_DOOR_THEME, {
      includeBackWall: true,
    });
    const returnDoorWidth = returnDoor.userData?.width ?? BASE_DOOR_WIDTH;
    const returnDoorHeight = returnDoor.userData?.height ?? BASE_DOOR_HEIGHT;

    const outsideMapCenterX = builtOutsideTerrain?.center?.x ?? 0;
    const outsideMapCenterZ =
      Number.isFinite(outsideMapBounds?.minZ) && Number.isFinite(outsideMapBounds?.maxZ)
        ? (outsideMapBounds.minZ + outsideMapBounds.maxZ) / 2
        : builtOutsideTerrain?.center?.z ?? 0;
    const entranceSurfaceY =
      typeof builtOutsideTerrain?.getSurfaceYAtWorldPosition === "function"
        ? builtOutsideTerrain.getSurfaceYAtWorldPosition(
            outsideMapCenterX,
            outsideMapCenterZ
          )
        : roomFloorY;
    const entranceBaseY = Number.isFinite(entranceSurfaceY)
      ? entranceSurfaceY
      : roomFloorY;

    const entranceDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.56;
    const entranceWidth = returnDoorWidth + 1.6;
    const entranceThickness = 0.16;
    const entranceCenterZ = outsideMapCenterZ;
    const entranceTopY = entranceBaseY + returnDoorHeight * 1.05;
    const sampleTunnelSurfaceY =
      typeof builtOutsideTerrain?.getSurfaceYAtWorldPosition === "function"
        ? builtOutsideTerrain.getSurfaceYAtWorldPosition
        : null;
    const sampleSteps = 4;
    const tunnelHalfWidth = entranceWidth / 2 + entranceThickness + 0.45;
    const tunnelHalfDepth = entranceDepth / 2 + 0.45;
    let sampledTunnelMinSurfaceY = Infinity;
    if (typeof sampleTunnelSurfaceY === "function") {
      for (let xStep = 0; xStep <= sampleSteps; xStep += 1) {
        const xBlend = sampleSteps > 0 ? xStep / sampleSteps : 0;
        const sampleX = THREE.MathUtils.lerp(
          outsideMapCenterX - tunnelHalfWidth,
          outsideMapCenterX + tunnelHalfWidth,
          xBlend
        );

        for (let zStep = 0; zStep <= sampleSteps; zStep += 1) {
          const zBlend = sampleSteps > 0 ? zStep / sampleSteps : 0;
          const sampleZ = THREE.MathUtils.lerp(
            entranceCenterZ - tunnelHalfDepth,
            entranceCenterZ + tunnelHalfDepth,
            zBlend
          );
          const sampleY = sampleTunnelSurfaceY(sampleX, sampleZ);
          if (Number.isFinite(sampleY)) {
            sampledTunnelMinSurfaceY = Math.min(sampledTunnelMinSurfaceY, sampleY);
          }
        }
      }
    }
    const minimumTunnelBottomY =
      Number.isFinite(sampledTunnelMinSurfaceY)
        ? sampledTunnelMinSurfaceY - OUTSIDE_TERRAIN_CLEARANCE
        : roomFloorY - OUTSIDE_TERRAIN_CLEARANCE * 0.5;
    const targetTunnelBottomY = Math.min(
      roomFloorY - OUTSIDE_TERRAIN_CLEARANCE * 0.5,
      minimumTunnelBottomY
    );
    const minimumEntranceHeight = returnDoorHeight * 1.05 * 4;
    const entranceHeight = Math.max(
      minimumEntranceHeight,
      entranceTopY - targetTunnelBottomY
    );
    const entranceCenterY = entranceTopY - entranceHeight / 2;
    const entranceRearZ = entranceCenterZ - entranceDepth / 2;
    const entranceFrontZ = entranceRearZ + entranceDepth;
    const returnDoorZ = entranceFrontZ - 0.42;
    const platformFrontZ = returnDoorZ - 0.6;
    const platformCenterZ =
      platformFrontZ - OPERATIONS_EXTERIOR_PLATFORM_DEPTH / 2;

    platform.position.set(
      outsideMapCenterX,
      platform.position.y,
      platformCenterZ
    );
    walkway.position.set(
      outsideMapCenterX,
      walkway.position.y,
      platformCenterZ - OPERATIONS_EXTERIOR_PLATFORM_DEPTH * 0.08
    );
    const entranceFloorOffset = entranceBaseY - roomFloorY;
    operationsExteriorTeleportOffset.set(
      outsideMapCenterX,
      entranceFloorOffset,
      platformCenterZ
    );

    returnDoor.position.set(
      outsideMapCenterX,
      entranceBaseY + (returnDoor.userData.height ?? 0) / 2,
      returnDoorZ
    );
    returnDoor.rotation.y = Math.PI;
    returnDoor.userData.floorOffset = entranceBaseY - roomFloorY;
    group.add(returnDoor);
    mapColliderDescriptors.push({ object: returnDoor });
    const returnDoorFrontOffset = new THREE.Vector3(0, 0, 1).applyEuler(
      returnDoor.rotation
    );
    const tunnelFrontZ = returnDoorZ + returnDoorFrontOffset.z * 0.42;
    const tunnelRearZ = tunnelFrontZ - returnDoorFrontOffset.z * entranceDepth;
    const tunnelCenterZ = (tunnelFrontZ + tunnelRearZ) / 2;
    const tunnelRearWallZ =
      tunnelRearZ - returnDoorFrontOffset.z * (entranceThickness / 2);

    const entranceMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0b1a22),
      roughness: 0.7,
      metalness: 0.25,
      emissive: new THREE.Color(0x07131a),
      emissiveIntensity: 0.2,
    });
    const entranceWallTexturePath =
      "images/textures/pack2/002_hex_plate_rot_baseColor.png";
    const entranceWallTileSize = 1.1;
    const createEntranceWallMaterial = (repeatX, repeatY) => {
      const texture = loadClampedTexture(entranceWallTexturePath);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffffff),
        roughness: 0.65,
        metalness: 0.35,
        emissive: new THREE.Color(0x07131a),
        emissiveIntensity: 0.2,
        map: texture,
      });
    };

    const entranceRoofRepeatX = Math.max(
      1,
      (entranceWidth + entranceThickness * 2) / entranceWallTileSize
    );
    const entranceRoofRepeatY = Math.max(1, entranceDepth / entranceWallTileSize);
    const entranceRoof = new THREE.Mesh(
      new THREE.BoxGeometry(
        entranceWidth + entranceThickness * 2,
        entranceThickness,
        entranceDepth
      ),
      createEntranceWallMaterial(entranceRoofRepeatX, entranceRoofRepeatY)
    );
    entranceRoof.position.set(
      outsideMapCenterX,
      entranceTopY + entranceThickness / 2,
      tunnelCenterZ
    );
    group.add(entranceRoof);
    mapColliderDescriptors.push({ object: entranceRoof });

    const entranceWallGeometry = new THREE.BoxGeometry(
      entranceThickness,
      entranceHeight,
      entranceDepth
    );
    const entranceWallRepeatX = Math.max(1, entranceDepth / entranceWallTileSize);
    const entranceWallRepeatY = Math.max(1, entranceHeight / entranceWallTileSize);
    const entranceLeftWall = new THREE.Mesh(
      entranceWallGeometry,
      createEntranceWallMaterial(entranceWallRepeatX, entranceWallRepeatY)
    );
    entranceLeftWall.position.set(
      outsideMapCenterX - (entranceWidth / 2 + entranceThickness / 2),
      entranceCenterY,
      tunnelCenterZ
    );
    group.add(entranceLeftWall);
    mapColliderDescriptors.push({ object: entranceLeftWall });

    const entranceRightWall = entranceLeftWall.clone();
    entranceRightWall.position.x =
      outsideMapCenterX + (entranceWidth / 2 + entranceThickness / 2);
    group.add(entranceRightWall);
    mapColliderDescriptors.push({ object: entranceRightWall });

    const entranceBackWall = new THREE.Mesh(
      new THREE.BoxGeometry(
        entranceWidth + entranceThickness * 2,
        entranceHeight,
        entranceThickness
      ),
      createEntranceWallMaterial(
        Math.max(
          1,
          (entranceWidth + entranceThickness * 2) / entranceWallTileSize
        ),
        entranceWallRepeatY
      )
    );
    entranceBackWall.position.set(
      outsideMapCenterX,
      entranceCenterY,
      tunnelRearWallZ
    );
    group.add(entranceBackWall);
    mapColliderDescriptors.push({ object: entranceBackWall });

    const entranceDoorBackerDepth = entranceThickness * 0.85;
    const entranceDoorBacker = new THREE.Mesh(
      new THREE.BoxGeometry(entranceWidth, entranceHeight, entranceDoorBackerDepth),
      createEntranceWallMaterial(
        Math.max(1, entranceWidth / entranceWallTileSize),
        entranceWallRepeatY
      )
    );
    entranceDoorBacker.position.set(
      outsideMapCenterX - returnDoorFrontOffset.x * (entranceDoorBackerDepth / 2 + 0.06),
      entranceCenterY,
      returnDoorZ - returnDoorFrontOffset.z * (entranceDoorBackerDepth / 2 + 0.06)
    );
    group.add(entranceDoorBacker);
    mapColliderDescriptors.push({ object: entranceDoorBacker });

    const returnDoorControl = new THREE.Mesh(
      new THREE.PlaneGeometry(returnDoorWidth * 0.82, returnDoorHeight * 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    returnDoorControl.position.set(
      outsideMapCenterX + returnDoorFrontOffset.x * 0.3,
      entranceBaseY + returnDoorHeight * 0.56,
      returnDoorZ + returnDoorFrontOffset.z * 0.3
    );
    returnDoorControl.userData.isLiftControl = true;
    returnDoorControl.userData.liftFloorId = "operations-concourse";
    group.add(returnDoorControl);

    const returnDoorHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const returnDoorHalo = new THREE.Mesh(
      new THREE.TorusGeometry(returnDoorWidth * 0.54, 0.08, 32, 96),
      returnDoorHaloMaterial
    );
    returnDoorHalo.rotation.x = Math.PI / 2;
    returnDoorHalo.position.set(
      outsideMapCenterX + returnDoorFrontOffset.x * 0.34,
      entranceBaseY + returnDoorHeight * 0.6,
      returnDoorZ + returnDoorFrontOffset.z * 0.34
    );
    group.add(returnDoorHalo);

    returnDoor.userData.liftUi = {
      control: returnDoorControl,
      updateState: ({ current } = {}) => {
        const isActive = current?.id === "operations-concourse";
        returnDoorHaloMaterial.opacity = isActive ? 0.42 : 0.24;
      },
    };

    group.userData.returnDoor = returnDoor;
    group.userData.getSurfaceYAtWorldPosition = (worldX, worldZ) => {
      if (
        typeof builtOutsideTerrain?.getSurfaceYAtWorldPosition === "function"
      ) {
        return builtOutsideTerrain.getSurfaceYAtWorldPosition(worldX, worldZ);
      }

      return roomFloorY;
    };
    group.userData.resolveEntrySpawn = () => {
      returnDoor.updateMatrixWorld(true);

      const spawnPosition = new THREE.Vector3();
      const doorQuaternion = new THREE.Quaternion();
      returnDoor.getWorldPosition(spawnPosition);
      returnDoor.getWorldQuaternion(doorQuaternion);

      const doorForward = new THREE.Vector3(0, 0, 1).applyQuaternion(
        doorQuaternion
      );
      const doorWidth = Number.isFinite(returnDoor.userData?.width)
        ? returnDoor.userData.width
        : BASE_DOOR_WIDTH;
      const spawnDistance = Math.max(doorWidth * 0.7, 1.15);
      spawnPosition.add(doorForward.multiplyScalar(spawnDistance));

      if (
        typeof builtOutsideTerrain?.getSurfaceYAtWorldPosition === "function"
      ) {
        const surfaceY = builtOutsideTerrain.getSurfaceYAtWorldPosition(
          spawnPosition.x,
          spawnPosition.z
        );
        if (Number.isFinite(surfaceY)) {
          spawnPosition.y = Math.max(roomFloorY, surfaceY);
        }
      }

      return {
        position: spawnPosition,
        yaw: Math.atan2(doorForward.x, doorForward.z),
      };
    };

    const antennaTowerGroup = new THREE.Group();
    const antennaHeight = Math.max(entranceHeight * 2.4, 9.5);
    const antennaBaseY = entranceRoof.position.y + entranceThickness / 2;
    const antennaOffsetX = 0;
    const antennaOffsetZ = 0;
    antennaTowerGroup.position.set(
      outsideMapCenterX + antennaOffsetX,
      antennaBaseY,
      tunnelCenterZ + antennaOffsetZ
    );

    const antennaMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x3c4656),
      roughness: 0.55,
      metalness: 0.5,
    });
    const basePlateHeight = 0.18;
    const antennaBasePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, basePlateHeight, 16),
      antennaMaterial
    );
    antennaBasePlate.position.y = 0.09;
    antennaTowerGroup.add(antennaBasePlate);

    const rodPadHeight = 0.06;
    const rodPadGeometry = new THREE.CylinderGeometry(0.16, 0.18, rodPadHeight, 14);
    const rodPadOverlap = 0.01;
    const rodPadTopY = basePlateHeight - rodPadOverlap;
    const rodPadOffsetY = rodPadTopY - rodPadHeight / 2;
    const createRodPad = (x, z) => {
      const pad = new THREE.Mesh(rodPadGeometry, antennaMaterial);
      pad.position.set(x, rodPadOffsetY, z);
      return pad;
    };
    const mastPad = createRodPad(0, 0);
    antennaTowerGroup.add(mastPad);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, antennaHeight, 12),
      antennaMaterial
    );
    mast.position.y = antennaHeight / 2 + rodPadTopY;
    antennaTowerGroup.add(mast);

    const antennaCrossbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.08),
      antennaMaterial
    );
    antennaCrossbar.position.y = antennaHeight * 0.75;
    antennaTowerGroup.add(antennaCrossbar);

    const antennaLampGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const antennaLampMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd34d,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    antennaLampMaterial.fog = false;
    const createAntennaLamp = (x, phase) => {
      const lamp = new THREE.Mesh(antennaLampGeometry, antennaLampMaterial.clone());
      lamp.userData.viewDistanceMultiplier = 3;
      lamp.position.set(x, antennaCrossbar.position.y, 0);
      antennaTowerGroup.add(lamp);
      const lampLight = new THREE.PointLight(0xffe066, 1.6, 14, 2);
      lampLight.userData.viewDistanceMultiplier = 3;
      lampLight.position.copy(lamp.position);
      antennaTowerGroup.add(lampLight);
      environmentViewDistanceTargets.push(lamp, lampLight);
      liftIndicatorLights.push({ mesh: lamp, light: lampLight, phase });
    };
    const antennaLampOffsetX = 0.42;
    createAntennaLamp(-antennaLampOffsetX, 0);
    createAntennaLamp(antennaLampOffsetX, Math.PI);

    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2d2d,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    beaconMaterial.fog = false;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18), beaconMaterial);
    beacon.userData.viewDistanceMultiplier = 3;
    beacon.position.y = antennaHeight + 0.36;
    antennaTowerGroup.add(beacon);
    const beaconLight = new THREE.PointLight(0xff4d4d, 2.2, 26, 2);
    beaconLight.userData.viewDistanceMultiplier = 3;
    beaconLight.position.copy(beacon.position);
    antennaTowerGroup.add(beaconLight);
    environmentViewDistanceTargets.push(beacon, beaconLight);
    group.add(antennaTowerGroup);
    operationsExteriorRadioTower = antennaTowerGroup;
    const previousEnvironmentDispose = group.userData?.dispose;
    group.userData.dispose = () => {
      if (typeof previousEnvironmentDispose === "function") {
        previousEnvironmentDispose();
      }

      if (operationsExteriorRadioTower === antennaTowerGroup) {
        operationsExteriorRadioTower = null;
      }

      stopTowerRadioAudio();
    };
    liftIndicatorLights.push({ mesh: beacon, light: beaconLight, phase: Math.PI / 2 });

    const adjustableEntries = [
      { object: returnDoor, offset: returnDoor.position.y - roomFloorY },
      { object: entranceRoof, offset: entranceRoof.position.y - roomFloorY },
      { object: entranceLeftWall, offset: entranceLeftWall.position.y - roomFloorY },
      { object: entranceRightWall, offset: entranceRightWall.position.y - roomFloorY },
      { object: entranceBackWall, offset: entranceBackWall.position.y - roomFloorY },
      { object: returnDoorControl, offset: returnDoorControl.position.y - roomFloorY },
      { object: returnDoorHalo, offset: returnDoorHalo.position.y - roomFloorY },
      { object: antennaTowerGroup, offset: antennaTowerGroup.position.y - roomFloorY },
      { object: primaryStarField, offset: starYOffset },
      { object: distantStarField, offset: starYOffset },
    ];

    const walkwayHalfWidth = OPERATIONS_EXTERIOR_PLATFORM_WIDTH / 2;
    const walkwayHalfDepth = OPERATIONS_EXTERIOR_PLATFORM_DEPTH / 2;

    const walkwayMinX = walkway.position.x - walkwayHalfWidth;
    const walkwayMaxX = walkway.position.x + walkwayHalfWidth;
    const walkwayMinZ = walkway.position.z - walkwayHalfDepth;
    const walkwayMaxZ = walkway.position.z + walkwayHalfDepth;

    const mapMinX = Number.isFinite(outsideMapBounds?.minX)
      ? outsideMapBounds.minX
      : walkwayMinX;
    const mapMaxX = Number.isFinite(outsideMapBounds?.maxX)
      ? outsideMapBounds.maxX
      : walkwayMaxX;
    const mapMinZ = Number.isFinite(outsideMapBounds?.minZ)
      ? outsideMapBounds.minZ
      : walkwayMinZ;
    const mapMaxZ = Number.isFinite(outsideMapBounds?.maxZ)
      ? outsideMapBounds.maxZ
      : walkwayMaxZ;

    const combinedMinX = Math.min(walkwayMinX, mapMinX);
    const combinedMaxX = Math.max(walkwayMaxX, mapMaxX);
    const combinedMinZ = Math.min(walkwayMinZ, mapMinZ);
    const combinedMaxZ = Math.max(walkwayMaxZ, mapMaxZ);

    const boundsMarginX = 0.9;
    const boundsMarginZ = 0.9;

    let boundsMinX = combinedMinX + boundsMarginX;
    let boundsMaxX = combinedMaxX - boundsMarginX;
    if (boundsMaxX <= boundsMinX) {
      boundsMinX = combinedMinX;
      boundsMaxX = combinedMaxX;
    }

    let boundsMinZ = combinedMinZ + boundsMarginZ;
    let boundsMaxZ = combinedMaxZ - boundsMarginZ;
    if (boundsMaxZ <= boundsMinZ) {
      boundsMinZ = combinedMinZ;
      boundsMaxZ = combinedMaxZ;
    }

    const environmentLocalBounds = {
      minX: boundsMinX,
      maxX: boundsMaxX,
      minZ: boundsMinZ,
      maxZ: boundsMaxZ,
    };

    const resolvedEnvironmentBounds =
      Number.isFinite(environmentLocalBounds.minX) &&
      Number.isFinite(environmentLocalBounds.maxX) &&
      Number.isFinite(environmentLocalBounds.minZ) &&
      Number.isFinite(environmentLocalBounds.maxZ)
        ? environmentLocalBounds
        : operationsExteriorLocalBounds;

    const updateForRoomHeight = ({ roomFloorY }) => {
      const applyAdjustments = (entries) => {
        entries.forEach(({ object, offset }) => {
          if (object) {
            object.position.y = roomFloorY + offset;
          }
        });
      };

      applyAdjustments(adjustableEntries);
      if (mapAdjustableEntries.length > 0) {
        applyAdjustments(mapAdjustableEntries);
      }
    };

    const teleportOffset = operationsExteriorTeleportOffset.clone();

    return {
      group,
      liftDoor: returnDoor,
      liftDoors: [returnDoor, ...mapLiftDoors],
      updateForRoomHeight,
      update: () => {
        if (typeof builtOutsideTerrain?.updateTerrainWindowing === "function") {
          builtOutsideTerrain.updateTerrainWindowing();
        }
      },
      teleportOffset,
      bounds: resolvedEnvironmentBounds,
      colliderDescriptors: mapColliderDescriptors,
      resourceTargets: environmentResourceTargets,
      terrainTiles: environmentTerrainTiles,
      viewDistanceTargets: environmentViewDistanceTargets,
      starFields: [primaryStarField, distantStarField],
    };
  };

  const createEngineeringBayEnvironment = () => {
    const group = new THREE.Group();

    const bayWidth = roomWidth * 1.5;
    const bayDepth = roomDepth * 0.8;
    const floorThickness = 0.5;

    const floorBounds = createFloorBounds(bayWidth, bayDepth, {
      paddingX: 0.75,
      paddingZ: 0.75,
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x101722),
      roughness: 0.7,
      metalness: 0.18,
    });

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(bayWidth, floorThickness, bayDepth),
      floorMaterial
    );
    floor.position.y = roomFloorY - floorThickness / 2;
    group.add(floor);

    const catwalkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2937),
      roughness: 0.5,
      metalness: 0.2,
    });

    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(bayWidth * 0.7, 0.12, 0.6),
      catwalkMaterial
    );
    gantry.position.set(0, roomFloorY + 0.18, 0);
    group.add(gantry);

    const beamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x4b5563),
      roughness: 0.38,
      metalness: 0.62,
    });

    const createSupportBeam = (x, z) => {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.6, 0.18),
        beamMaterial
      );
      beam.position.set(x, roomFloorY + 1.3, z);
      return beam;
    };

    const beamOffsetX = bayWidth / 2 - 0.4;
    const beamOffsetZ = bayDepth / 2 - 0.4;
    const beams = [
      createSupportBeam(beamOffsetX, beamOffsetZ),
      createSupportBeam(-beamOffsetX, beamOffsetZ),
      createSupportBeam(beamOffsetX, -beamOffsetZ),
      createSupportBeam(-beamOffsetX, -beamOffsetZ),
    ];
    beams.forEach((beam) => group.add(beam));

    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x374151),
      metalness: 0.7,
      roughness: 0.28,
    });

    const coolantPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, bayWidth * 0.9, 24),
      pipeMaterial
    );
    coolantPipe.rotation.z = Math.PI / 2;
    coolantPipe.position.set(0, roomFloorY + 1.1, -bayDepth / 2 + 0.55);
    group.add(coolantPipe);

    const returnPipe = coolantPipe.clone();
    returnPipe.position.z = bayDepth / 2 - 0.55;
    group.add(returnPipe);

    const generatorMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2933),
      roughness: 0.3,
      metalness: 0.65,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.2,
    });

    const generatorHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1.1, 24),
      generatorMaterial
    );
    generatorHousing.position.set(0, roomFloorY + 0.55, -bayDepth * 0.18);
    group.add(generatorHousing);

    const generatorCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.9, 24),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0f172a),
        emissive: new THREE.Color(0x22d3ee),
        emissiveIntensity: 1.1,
        metalness: 0.35,
        roughness: 0.25,
      })
    );
    generatorCore.position.set(0, roomFloorY + 0.55, -bayDepth * 0.18);
    group.add(generatorCore);

    const energyPulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    energyPulse.position.copy(generatorCore.position);
    group.add(energyPulse);

    const engineeringLight = new THREE.PointLight(
      0x22d3ee,
      1.3,
      bayDepth * 1.4,
      2
    );
    engineeringLight.position.set(0, roomFloorY + 1.8, -bayDepth * 0.18);
    group.add(engineeringLight);

    const maintenanceConsole = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.4),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x1f2a37),
        roughness: 0.4,
        metalness: 0.5,
        emissive: new THREE.Color(0x0c4a6e),
        emissiveIntensity: 0.3,
      })
    );
    maintenanceConsole.position.set(0, roomFloorY + 0.55, bayDepth / 2 - 0.6);
    group.add(maintenanceConsole);

    const consoleScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.45),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
      })
    );
    consoleScreen.position.set(0, roomFloorY + 0.72, bayDepth / 2 - 0.38);
    consoleScreen.rotation.x = -THREE.MathUtils.degToRad(12);
    group.add(consoleScreen);

    const liftDoor = createHangarDoor(COMMAND_CENTER_DOOR_THEME, {
      includeBackWall: true,
    });
    liftDoor.position.set(
      0,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      -bayDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.rotation.y = 0;
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    const adjustableEntries = [
      { object: floor, offset: -floorThickness / 2 },
      { object: gantry, offset: 0.18 },
      { object: generatorHousing, offset: 0.55 },
      { object: generatorCore, offset: 0.55 },
      { object: energyPulse, offset: 0.55 },
      { object: maintenanceConsole, offset: 0.55 },
      { object: consoleScreen, offset: 0.72 },
      { object: coolantPipe, offset: 1.1 },
      { object: returnPipe, offset: 1.1 },
    ];

    beams.forEach((beam) => {
      adjustableEntries.push({ object: beam, offset: 1.3 });
    });

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });
      engineeringLight.position.y = roomFloorY + 1.8;
    };

    const teleportOffset = new THREE.Vector3(0, 0, -bayDepth / 2 + 1.8);

    return {
        group,
        liftDoor,
        updateForRoomHeight,
        teleportOffset,
        starFields: [],
        bounds: floorBounds,
      };
  };

  const createExteriorOutpostEnvironment = () => {
    const group = new THREE.Group();

    const plazaWidth = roomWidth * 1.8;
    const plazaDepth = roomDepth * 1.15;
    const terrainThickness = 0.4;

    const floorBounds = createFloorBounds(plazaWidth, plazaDepth, {
      paddingX: 1.1,
      paddingZ: 1.6,
    });

    const terrainMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f1c24),
      roughness: 0.95,
      metalness: 0.04,
    });

    const terrain = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth, terrainThickness, plazaDepth),
      terrainMaterial
    );
    terrain.position.y = roomFloorY - terrainThickness / 2;
    group.add(terrain);

    const walkwayMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x334155),
      roughness: 0.55,
      metalness: 0.28,
    });

    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth * 0.7, 0.12, plazaDepth * 0.38),
      walkwayMaterial
    );
    walkway.position.set(-roomWidth / 6, roomFloorY + 0.06, -plazaDepth * 0.15);
    group.add(walkway);

    const overlookMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1e293b),
      roughness: 0.48,
      metalness: 0.35,
      emissive: new THREE.Color(0x0f172a),
      emissiveIntensity: 0.25,
    });

    const overlook = new THREE.Mesh(
      new THREE.CylinderGeometry(plazaWidth * 0.28, plazaWidth * 0.32, 0.18, 48),
      overlookMaterial
    );
    overlook.position.set(-roomWidth / 6, roomFloorY + 0.09, plazaDepth * 0.1);
    group.add(overlook);

    const perimeterMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x94a3b8),
      roughness: 0.4,
      metalness: 0.6,
      emissive: new THREE.Color(0x1d4ed8),
      emissiveIntensity: 0.2,
    });

    const sideRailLength = plazaDepth * 0.55;
    const railHeight = 1.18;
    const starboardRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, railHeight, sideRailLength),
      perimeterMaterial
    );
    starboardRail.position.set(
      plazaWidth / 2 - 0.45,
      roomFloorY + railHeight / 2,
      sideRailLength / 2 - plazaDepth * 0.05
    );
    group.add(starboardRail);

    const portRail = starboardRail.clone();
    portRail.position.x = -plazaWidth / 2 + 0.38;
    group.add(portRail);

    const forwardRail = new THREE.Mesh(
      new THREE.BoxGeometry(plazaWidth * 0.72, 0.12, 0.12),
      perimeterMaterial
    );
    forwardRail.position.set(-roomWidth / 6, roomFloorY + 1.05, plazaDepth * 0.32);
    group.add(forwardRail);

    const accentGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    accentGlow.position.set(-roomWidth / 6, roomFloorY + 2.2, plazaDepth * 0.26);
    group.add(accentGlow);

    const planterMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0f172a),
      roughness: 0.4,
      metalness: 0.25,
    });

    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0ea5e9),
      emissive: new THREE.Color(0x22d3ee),
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.1,
    });

    const adjustableEntries = [];

    const createPlanter = (x, z, radius) => {
      const planter = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.08, 0.32, 24),
        planterMaterial
      );
      planter.position.set(x, roomFloorY + 0.16, z);
      group.add(planter);

      const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.9, 24, 16),
        foliageMaterial
      );
      foliage.position.set(x, roomFloorY + 0.65, z);
      group.add(foliage);

      adjustableEntries.push({ object: planter, offset: 0.16 });
      adjustableEntries.push({ object: foliage, offset: 0.65 });
    };

    createPlanter(-roomWidth / 6 - 1, -plazaDepth * 0.05, 0.38);
    createPlanter(-roomWidth / 6 + 1, -plazaDepth * 0.05, 0.36);
    createPlanter(-roomWidth / 6, plazaDepth * 0.22, 0.48);

    const postMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2937),
      roughness: 0.35,
      metalness: 0.25,
    });

    const lampMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xfacc15),
      emissive: new THREE.Color(0xfcd34d),
      emissiveIntensity: 1.25,
      roughness: 0.2,
    });

    const lightPosts = [];

    const createLightPost = (x, z) => {
      const postGroup = new THREE.Group();

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12),
        postMaterial
      );
      post.position.y = 0.7;
      postGroup.add(post);

      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), lampMaterial);
      lamp.position.y = 1.4;
      postGroup.add(lamp);

      const lampGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.8),
        new THREE.MeshBasicMaterial({
          color: 0xfcd34d,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      lampGlow.position.set(0, 1.4, 0);
      lampGlow.rotation.x = -Math.PI / 2;
      postGroup.add(lampGlow);

      postGroup.position.set(x, roomFloorY, z);
      group.add(postGroup);

      lightPosts.push(postGroup);
    };

    const lightSpacing = plazaDepth * 0.2;
    [-1, 0, 1].forEach((offset) => {
      createLightPost(-roomWidth / 6 - 0.95, -plazaDepth * 0.05 + offset * lightSpacing);
      createLightPost(-roomWidth / 6 + 0.95, -plazaDepth * 0.05 + offset * lightSpacing);
    });

    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x0b1220),
      roughness: 0.85,
      metalness: 0.05,
    });

    const ridge = new THREE.Mesh(
      new THREE.CylinderGeometry(plazaWidth, plazaWidth * 1.2, 1.2, 64, 1, true),
      ridgeMaterial
    );
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, roomFloorY + 0.2, plazaDepth / 2 - 0.8);
    group.add(ridge);

    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(plazaWidth * 1.5, 4.5),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.12,
      })
    );
    horizonGlow.position.set(0, roomFloorY + 2.6, plazaDepth / 2 - 0.4);
    group.add(horizonGlow);

    const nebula = new THREE.Mesh(
      new THREE.RingGeometry(plazaWidth * 0.35, plazaWidth * 0.7, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      })
    );
    nebula.position.set(-roomWidth / 6, roomFloorY + 3.6, plazaDepth * 0.38);
    nebula.rotation.x = -Math.PI / 3;
    group.add(nebula);

    const baseSkyRadius = plazaWidth * 2.8;
    const skyRadius = baseSkyRadius;
    const starPlaneY = getStarPlaneHeight();
    const starYOffset = starPlaneY - roomFloorY;
    const skyCenter = new THREE.Vector3(0, starPlaneY, 0);

    const nearStarField = createStarField({
      radius: skyRadius,
      count: 1650,
      center: skyCenter,
      size: 0.07,
      opacity: 0.8,
      distribution: "spherical",
    });
    applyStarDepthMaterial(nearStarField);
    group.add(nearStarField);

    const farStarField = createStarField({
      radius: skyRadius * 1.32,
      count: 900,
      center: skyCenter,
      size: 0.05,
      opacity: 0.58,
      colorVariance: 0.06,
      distribution: "spherical",
    });
    applyStarDepthMaterial(farStarField);
    group.add(farStarField);

    adjustableEntries.push(
      { object: nearStarField, offset: starYOffset },
      { object: farStarField, offset: starYOffset }
    );

    const ambientLight = new THREE.AmbientLight(0x0f172a, 0.6);
    group.add(ambientLight);

    const horizonLight = new THREE.DirectionalLight(0x38bdf8, 0.25);
    horizonLight.position.set(-2.5, roomFloorY + 3.2, 4.6);
    group.add(horizonLight);

    const liftDoor = createHangarDoor(COMMAND_CENTER_DOOR_THEME, {
      includeBackWall: true,
    });
    liftDoor.position.set(
      -roomWidth / 3,
      roomFloorY + (liftDoor.userData.height ?? 0) / 2,
      -plazaDepth / 2 + 0.32 * ROOM_SCALE_FACTOR
    );
    liftDoor.rotation.y = 0;
    liftDoor.userData.floorOffset = 0;
    group.add(liftDoor);

    adjustableEntries.push({ object: terrain, offset: -terrainThickness / 2 });
    adjustableEntries.push({ object: walkway, offset: 0.06 });
    adjustableEntries.push({ object: overlook, offset: 0.09 });
    adjustableEntries.push({ object: starboardRail, offset: railHeight / 2 });
    adjustableEntries.push({ object: portRail, offset: railHeight / 2 });
    adjustableEntries.push({ object: forwardRail, offset: 1.05 });
    adjustableEntries.push({ object: accentGlow, offset: 2.2 });
    adjustableEntries.push({ object: ridge, offset: 0.2 });
    adjustableEntries.push({ object: horizonGlow, offset: 2.6 });
    adjustableEntries.push({ object: nebula, offset: 3.6 });

    const updateForRoomHeight = ({ roomFloorY }) => {
      adjustableEntries.forEach(({ object, offset }) => {
        if (object) {
          object.position.y = roomFloorY + offset;
        }
      });

      lightPosts.forEach((postGroup) => {
        postGroup.position.y = roomFloorY;
      });

      horizonLight.position.y = roomFloorY + 3.2;
    };

    const teleportOffset = new THREE.Vector3(
      -roomWidth / 3,
      0,
      -plazaDepth / 2 + 1.9
    );

      return {
        group,
        liftDoor,
        updateForRoomHeight,
        teleportOffset,
        starFields: [nearStarField, farStarField],
        bounds: floorBounds,
      };
  };

  const createLastUpdatedDisplay = () => {
    const displayGroup = new THREE.Group();

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    if (!context) {
      return displayGroup;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;

    const signAspect = canvas.width / canvas.height;
    const signHeight = 2.6;
    const signWidth = signHeight * signAspect;

    const signMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(signWidth, signHeight),
      signMaterial
    );
    signMesh.renderOrder = 2;
    displayGroup.add(signMesh);

    const updateTexture = () => {
      const marginX = 80;
      const marginY = 70;
      const frameInset = 36;

      context.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(15, 23, 42, 0.94)");
      gradient.addColorStop(1, "rgba(30, 41, 59, 0.92)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.strokeStyle = "rgba(56, 189, 248, 0.55)";
      context.lineWidth = 12;
      context.strokeRect(
        frameInset,
        frameInset,
        canvas.width - frameInset * 2,
        canvas.height - frameInset * 2
      );

      context.textBaseline = "top";

      const rawLastModified = document.lastModified;
      const parsedTimestamp = new Date(rawLastModified);
      const lastModifiedDate = Number.isNaN(parsedTimestamp.getTime())
        ? new Date()
        : parsedTimestamp;

      const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const formattedDate = dateFormatter.format(lastModifiedDate);

      const timeZonePart = new Intl.DateTimeFormat(undefined, {
        timeZoneName: "short",
      })
        .formatToParts(lastModifiedDate)
        .find((part) => part.type === "timeZoneName")?.value;

      let cursorY = marginY;

      context.fillStyle = "#38bdf8";
      context.font = "700 86px 'Segoe UI', 'Inter', sans-serif";
      context.fillText("Last Update Log", marginX, cursorY);
      cursorY += 118;

      context.fillStyle = "#e2e8f0";
      context.font = "600 72px 'Segoe UI', 'Inter', sans-serif";
      context.fillText(formattedDate, marginX, cursorY);
      cursorY += 96;

      if (timeZonePart) {
        context.fillStyle = "rgba(148, 163, 184, 0.85)";
        context.font = "500 50px 'Segoe UI', 'Inter', sans-serif";
        context.fillText(`Timezone: ${timeZonePart}`, marginX, cursorY);
        cursorY += 74;
      }

      texture.needsUpdate = true;
    };

    updateTexture();

    const intervalId = window.setInterval(updateTexture, 60_000);
    displayGroup.userData.dispose = () => {
      window.clearInterval(intervalId);
    };

    return displayGroup;
  };

  const computerSetup = createComputerSetup();
  computerSetup.position.set(
    3 * ROOM_SCALE_FACTOR,
    roomFloorY,
    -roomDepth / 2 + terminalBackOffset
  );

  registerColliderDescriptors(computerSetup.userData?.colliderDescriptors);

  if (typeof computerSetup.userData?.setCollidersChangedCallback === "function") {
    computerSetup.userData.setCollidersChangedCallback(() => {
      computerSetup.updateMatrixWorld(true);
      rebuildStaticColliders();
    });
  }

  hangarDeckEnvironmentGroup.add(computerSetup);
  computerSetup.updateMatrixWorld(true);
  rebuildStaticColliders();
  if (typeof computerSetup.userData?.notifyCollidersChanged === "function") {
    computerSetup.userData.notifyCollidersChanged();
  }

  const lastUpdatedDisplay = createLastUpdatedDisplay();
  lastUpdatedDisplay.position.set(
    -roomWidth / 2 + 0.12 * ROOM_SCALE_FACTOR,
    roomFloorY + roomHeight * 0.6,
    0
  );
  lastUpdatedDisplay.rotation.y = Math.PI / 2;
  hangarDeckEnvironmentGroup.add(lastUpdatedDisplay);

  const createLazyDeckEnvironment = ({
    id,
    title,
    description,
    yaw = 0,
    groupPosition,
    localFloorBounds,
    teleportOffset,
    createEnvironment,
  }) => {
    const origin = groupPosition.clone();
    const localBounds = localFloorBounds || null;
    const worldBounds = localBounds
      ? translateBoundsToWorld(localBounds, origin)
      : null;
    let resolvedBounds = worldBounds;

    const teleport = teleportOffset instanceof THREE.Vector3
      ? teleportOffset.clone()
      : null;

    const floorPosition = new THREE.Vector3().copy(origin);
    if (teleport) {
      floorPosition.add(teleport);
      const teleportY = Number.isFinite(teleport.y) ? teleport.y : 0;
      floorPosition.y = roomFloorY + teleportY;
    } else {
      floorPosition.y = roomFloorY;
    }

    let state = null;

    const load = () => {
      if (state?.group) {
        if (!state.group.parent) {
          scene.add(state.group);
          state.group.updateMatrixWorld(true);
        }
        return state;
      }

      let environment = null;

      try {
        environment = createEnvironment();
      } catch (error) {
        console.warn(`Unable to create environment for ${id}`, error);
        return null;
      }

      const group = environment?.group;

      if (!group) {
        return null;
      }

      if (environment?.teleportOffset instanceof THREE.Vector3) {
        if (teleport instanceof THREE.Vector3) {
          teleport.copy(environment.teleportOffset);
        }
        const teleportY = Number.isFinite(environment.teleportOffset.y)
          ? environment.teleportOffset.y
          : 0;
        floorPosition.copy(origin).add(environment.teleportOffset);
        floorPosition.y = roomFloorY + teleportY;
      }

      group.position.copy(origin);
      scene.add(group);
      group.updateMatrixWorld(true);

      let colliderSource = null;

      if (Array.isArray(environment?.colliderDescriptors)) {
        colliderSource = environment.colliderDescriptors;
      } else if (Array.isArray(group.userData?.colliderDescriptors)) {
        colliderSource = group.userData.colliderDescriptors;
      }

      let registeredColliders = null;
      if (Array.isArray(colliderSource) && colliderSource.length > 0) {
        registeredColliders = registerColliderDescriptors(colliderSource);
      }

      let environmentBounds = null;
      if (
        environment?.bounds &&
        typeof environment.bounds === "object" &&
        environment.bounds !== null
      ) {
        environmentBounds = environment.bounds;
      } else if (
        group.userData?.bounds &&
        typeof group.userData.bounds === "object" &&
        group.userData.bounds !== null
      ) {
        environmentBounds = group.userData.bounds;
      }

      if (environmentBounds) {
        const translatedBounds = translateBoundsToWorld(
          environmentBounds,
          origin
        );
        resolvedBounds = translatedBounds ?? worldBounds;
      } else {
        resolvedBounds = worldBounds;
      }

      let unregisterHeightAdjuster = null;
      if (typeof environment?.updateForRoomHeight === "function") {
        unregisterHeightAdjuster = registerEnvironmentHeightAdjuster(
          environment.updateForRoomHeight
        );
        try {
          environment.updateForRoomHeight({
            roomFloorY,
            heightScale: playerHeight / DEFAULT_PLAYER_HEIGHT,
          });
        } catch (error) {
          console.warn(
            `Unable to update environment height for ${id}`,
            error
          );
        }
      }

      let unregisterLiftDoor = null;
      const doorsToRegister = [];

      if (environment?.liftDoor) {
        doorsToRegister.push(environment.liftDoor);
      }

      if (Array.isArray(environment?.liftDoors)) {
        environment.liftDoors.forEach((door) => {
          if (door && !doorsToRegister.includes(door)) {
            doorsToRegister.push(door);
          }
        });
      }

      if (doorsToRegister.length > 0) {
        const unregisterFns = doorsToRegister
          .map((door) => registerLiftDoor(door))
          .filter((fn) => typeof fn === "function");

        unregisterLiftDoor = () => {
          unregisterFns.forEach((fn) => {
            try {
              fn();
            } catch (error) {
              console.warn("Unable to unregister lift door", error);
            }
          });
        };
      }

      const sanitizeObject3DTargetList = (targets) => {
        if (!Array.isArray(targets)) {
          return [];
        }

        for (let index = targets.length - 1; index >= 0; index -= 1) {
          if (!targets[index]?.isObject3D) {
            targets.splice(index, 1);
          }
        }

        return targets;
      };

      const resourceTargets = sanitizeObject3DTargetList(
        environment?.resourceTargets
      );

      const terrainTiles = sanitizeObject3DTargetList(environment?.terrainTiles);

      const viewDistanceTargets = sanitizeObject3DTargetList(
        environment?.viewDistanceTargets
      );
      enableTerrainLayerForTiles(terrainTiles);

      const starFields = Array.isArray(environment?.starFields)
        ? environment.starFields.filter((field) => field?.isObject3D)
        : [];

      starFields.forEach(registerStarField);

      resourceTargetsByEnvironment.set(id, resourceTargets);
      terrainTilesByEnvironment.set(id, terrainTiles);
      viewDistanceTargetsByEnvironment.set(id, viewDistanceTargets);

      state = {
        group,
        unregisterHeightAdjuster,
        unregisterLiftDoor,
        registeredColliders,
        bounds: resolvedBounds,
        resourceTargets,
        terrainTiles,
        viewDistanceTargets,
        starFields,
        update: typeof environment?.update === "function" ? environment.update : null,
      };

      updateEnvironmentForPlayerHeight();
      rebuildStaticColliders();

      return state;
    };

    const unload = () => {
      if (!state?.group) {
        return;
      }

      if (typeof state.unregisterHeightAdjuster === "function") {
        state.unregisterHeightAdjuster();
      }

      if (typeof state.unregisterLiftDoor === "function") {
        state.unregisterLiftDoor();
      }

      if (
        Array.isArray(state.registeredColliders) &&
        state.registeredColliders.length > 0
      ) {
        unregisterColliderDescriptors(state.registeredColliders);
      }

      unregisterStarFields(state.starFields ?? []);

      resourceTargetsByEnvironment.delete(id);
      terrainTilesByEnvironment.delete(id);
      viewDistanceTargetsByEnvironment.delete(id);

      scene.remove(state.group);
      disposeObject3D(state.group);

      state = null;
      resolvedBounds = worldBounds;

      rebuildStaticColliders();
    };

    return {
      id,
      title,
      description,
      yaw,
      position: floorPosition,
      get bounds() {
        return resolvedBounds;
      },
      load,
      unload,
      update: (payload) => {
        if (typeof state?.update === "function") {
          state.update(payload);
        }
      },
      getGroup: () => state?.group ?? null,
      isLoaded: () => Boolean(state?.group),
    };
  };

  const operationsDeckGroupPosition = new THREE.Vector3(roomWidth * 3.2, 0, 0);
  const operationsDeckLocalBounds = createFloorBounds(
    roomWidth * 1.35,
    roomDepth * 0.85,
    {
      paddingX: 0.75,
      paddingZ: 0.75,
    }
  );
  const operationsDeckTeleportOffset = new THREE.Vector3(
    0,
    0,
    (roomDepth * 0.85) / 2 - 1.8
  );

  const operationsExteriorGroupPosition = new THREE.Vector3(
    roomWidth * 3.2,
    0,
    -roomDepth * 3.6
  );

  const engineeringDeckGroupPosition = new THREE.Vector3(
    -roomWidth * 3.4,
    0,
    0
  );
  const engineeringDeckLocalBounds = createFloorBounds(
    roomWidth * 1.5,
    roomDepth * 0.8,
    {
      paddingX: 0.75,
      paddingZ: 0.75,
    }
  );
  const engineeringDeckTeleportOffset = new THREE.Vector3(
    0,
    0,
    -(roomDepth * 0.8) / 2 + 1.8
  );

  const exteriorDeckGroupPosition = new THREE.Vector3(
    0,
    0,
    -roomDepth * 3.6
  );
  const exteriorDeckLocalBounds = createFloorBounds(
    roomWidth * 1.8,
    roomDepth * 1.15,
    {
      paddingX: 1.1,
      paddingZ: 1.6,
    }
  );
  const exteriorDeckTeleportOffset = new THREE.Vector3(
    -roomWidth / 3,
    0,
    -(roomDepth * 1.15) / 2 + 1.9
  );

  const deckEnvironments = [
    createLazyDeckEnvironment({
      id: "operations-concourse",
      title: "Outside Exit",
      description: "External Hatch",
      yaw: Math.PI,
      groupPosition: operationsDeckGroupPosition,
      localFloorBounds: operationsDeckLocalBounds,
      teleportOffset: operationsDeckTeleportOffset,
      createEnvironment: createOperationsConcourseEnvironment,
    }),
    createLazyDeckEnvironment({
      id: "operations-exterior",
      title: "Surface Area",
      description: "Outside terrain access",
      yaw: 0,
      groupPosition: operationsExteriorGroupPosition,
      localFloorBounds: operationsExteriorLocalBounds,
      teleportOffset: operationsExteriorTeleportOffset,
      createEnvironment: createOperationsExteriorEnvironment,
    }),
    createLazyDeckEnvironment({
      id: "engineering-bay",
      title: "Engineering Bay",
      description: "Systems maintenance hub",
      yaw: 0,
      groupPosition: engineeringDeckGroupPosition,
      localFloorBounds: engineeringDeckLocalBounds,
      teleportOffset: engineeringDeckTeleportOffset,
      createEnvironment: createEngineeringBayEnvironment,
    }),
    createLazyDeckEnvironment({
      id: "exterior-outpost",
      title: "Exterior Outpost",
      description: "Observation ridge overlook",
      yaw: 0,
      groupPosition: exteriorDeckGroupPosition,
      localFloorBounds: exteriorDeckLocalBounds,
      teleportOffset: exteriorDeckTeleportOffset,
      createEnvironment: createExteriorOutpostEnvironment,
    }),
  ];

  const deckEnvironmentMap = new Map(
    deckEnvironments.map((environment) => [environment.id, environment])
  );

  const activateDeckEnvironment = (floorId) => {
    const hangarDeckActive = !floorId || floorId === "hangar-deck";
    hangarDeckEnvironmentGroup.visible = hangarDeckActive;

    deckEnvironmentMap.forEach((environment, environmentId) => {
      if (environmentId === floorId) {
        environment.load();
      } else {
        environment.unload();
      }
    });

    refreshActiveResourceTargets(floorId ?? null);
  };

  const operationsDeckEnvironment = deckEnvironmentMap.get(
    "operations-concourse"
  );
  const operationsExteriorEnvironment = deckEnvironmentMap.get(
    "operations-exterior"
  );
  const engineeringDeckEnvironment = deckEnvironmentMap.get("engineering-bay");
  const exteriorDeckEnvironment = deckEnvironmentMap.get("exterior-outpost");

  const operationsConcourseTeleportProbe = new THREE.Vector3();
  let operationsConcourseTeleportCooldown = 0;

  const operationsDeckFloorPosition =
    operationsDeckEnvironment?.position instanceof THREE.Vector3
      ? operationsDeckEnvironment.position
      : null;
  const operationsExteriorFloorPosition =
    operationsExteriorEnvironment?.position instanceof THREE.Vector3
      ? operationsExteriorEnvironment.position
      : null;
  const engineeringDeckFloorPosition =
    engineeringDeckEnvironment?.position instanceof THREE.Vector3
      ? engineeringDeckEnvironment.position
      : null;
  const exteriorDeckFloorPosition =
    exteriorDeckEnvironment?.position instanceof THREE.Vector3
      ? exteriorDeckEnvironment.position
      : null;

  const operationsDeckFloorBounds = operationsDeckEnvironment?.bounds ?? null;
  const operationsExteriorFloorBounds =
    operationsExteriorEnvironment?.bounds ?? null;
  const engineeringDeckFloorBounds =
    engineeringDeckEnvironment?.bounds ?? null;
  const exteriorDeckFloorBounds = exteriorDeckEnvironment?.bounds ?? null;


  const computeReflectorRenderTargetSize = (surfaceWidth, surfaceHeight) => {
    const pixelRatio = renderer.getPixelRatio();
    const safeSurfaceWidth =
      Number.isFinite(surfaceWidth) && surfaceWidth > 0 ? surfaceWidth : 1;
    const safeSurfaceHeight =
      Number.isFinite(surfaceHeight) && surfaceHeight > 0 ? surfaceHeight : 1;
    const aspect = safeSurfaceWidth / safeSurfaceHeight;
    const baseHeight = Math.max(1, window.innerHeight || 1);
    const baseWidth = baseHeight * aspect;
    const scale = normalizeReflectorResolutionScale(
      reflectionSettings.resolutionScale
    );
    const scaledBaseHeight = baseHeight * scale;
    const scaledBaseWidth = baseWidth * scale;

    return {
      width: Math.max(1, Math.round(scaledBaseWidth * pixelRatio)),
      height: Math.max(1, Math.round(scaledBaseHeight * pixelRatio)),
    };
  };

  const createMirrorReflector = (mirrorWidth, mirrorHeight) => {
    const renderTargetSize = computeReflectorRenderTargetSize(
      mirrorWidth,
      mirrorHeight
    );

    const reflector = new Reflector(
      new THREE.PlaneGeometry(mirrorWidth, mirrorHeight),
      {
        clipBias: 0.0025,
        color: new THREE.Color(0x9fb7cf),
        textureWidth: renderTargetSize.width,
        textureHeight: renderTargetSize.height,
      }
    );
    const baseOnBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function (
      rendererInstance,
      sceneInstance,
      cameraInstance,
      geometryInstance,
      materialInstance,
      groupInstance
    ) {
      const cameraLayers = cameraInstance?.layers;
      const hadPlayerLayer =
        typeof cameraLayers?.isEnabled === "function"
          ? cameraLayers.isEnabled(REFLECTION_PLAYER_LAYER)
          : false;

      if (cameraLayers?.enable) {
        cameraLayers.enable(REFLECTION_PLAYER_LAYER);
      }

      if (typeof baseOnBeforeRender === "function") {
        baseOnBeforeRender.call(
          this,
          rendererInstance,
          sceneInstance,
          cameraInstance,
          geometryInstance,
          materialInstance,
          groupInstance
        );
      }

      if (!hadPlayerLayer && cameraLayers?.disable) {
        cameraLayers.disable(REFLECTION_PLAYER_LAYER);
      }
    };
    const reflectorUserData = reflector.userData || (reflector.userData = {});
    reflectorUserData.renderSurfaceDimensions = {
      width: mirrorWidth,
      height: mirrorHeight,
    };

    return reflector;
  };

  const ensureMirrorReflector = (mirrorGroup) => {
    if (!mirrorGroup) {
      return null;
    }

    let reflector = mirrorGroup.userData?.reflector ?? null;

    if (!reflector) {
      const mirrorDimensions = mirrorGroup.userData?.dimensions ?? {
        width: BASE_MIRROR_WIDTH,
        height: BASE_MIRROR_HEIGHT,
      };
      reflector = createMirrorReflector(
        mirrorDimensions.width,
        mirrorDimensions.height
      );
      mirrorGroup.add(reflector);
      mirrorGroup.userData.reflector = reflector;
    }

    return reflector;
  };

  const createWallMirror = () => {
    const group = new THREE.Group();

    const mirrorWidth = BASE_MIRROR_WIDTH;
    const mirrorHeight = BASE_MIRROR_HEIGHT;
    const frameInset = 0.18;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x111827),
      metalness: 0.58,
      roughness: 0.32,
      emissive: new THREE.Color(0x0b1220),
      emissiveIntensity: 0.22,
    });

    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(
        mirrorWidth + frameInset,
        mirrorHeight + frameInset
      ),
      frameMaterial
    );
    frame.position.z = -0.015;
    group.add(frame);

    let reflector = null;

    if (reflectionSettings.enabled) {
      reflector = createMirrorReflector(mirrorWidth, mirrorHeight);
      group.add(reflector);
    }

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1f2a37),
      metalness: 0.35,
      roughness: 0.55,
    });

    const accentDepth = 0.08;
    const topAccent = new THREE.Mesh(
      new THREE.BoxGeometry(mirrorWidth + frameInset, 0.08, accentDepth),
      accentMaterial
    );
    topAccent.position.set(0, mirrorHeight / 2 + 0.02, -accentDepth / 2);
    group.add(topAccent);

    const bottomAccent = topAccent.clone();
    bottomAccent.position.y = -mirrorHeight / 2 - 0.02;
    group.add(bottomAccent);

    group.userData.dimensions = { width: mirrorWidth, height: mirrorHeight };
    group.userData.baseDimensions = { width: mirrorWidth, height: mirrorHeight };
    group.userData.reflector = reflector;

    return group;
  };

  const reflectiveSurfaces = [];
  const registerReflectiveSurface = (reflector) => {
    if (!reflectionSettings.enabled || !reflector) {
      return;
    }

    if (!reflectiveSurfaces.includes(reflector)) {
      reflectiveSurfaces.push(reflector);
    }
  };

  const createGridLines = (width, height, segmentsX, segmentsY, color, opacity) => {
    const vertices = [];
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    for (let i = 0; i <= segmentsX; i += 1) {
      const x = -halfWidth + (i * width) / segmentsX;
      vertices.push(x, halfHeight, 0, x, -halfHeight, 0);
    }

    for (let j = 0; j <= segmentsY; j += 1) {
      const y = -halfHeight + (j * height) / segmentsY;
      vertices.push(-halfWidth, y, 0, halfWidth, y, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });

    return new THREE.LineSegments(geometry, material);
  };

  const gridColor = 0x94a3b8;
  const gridOpacity = 0.35;

  const floorGrid = createGridLines(roomWidth, roomDepth, 20, 20, gridColor, gridOpacity);
  floorGrid.rotation.x = -Math.PI / 2;
  floorGrid.position.y = roomFloorY + 0.02;
  hangarDeckEnvironmentGroup.add(floorGrid);

  const backWallGrid = createGridLines(
    roomWidth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  backWallGrid.position.z = -roomDepth / 2 + 0.02;
  hangarDeckEnvironmentGroup.add(backWallGrid);

  const frontWallGrid = createGridLines(
    roomWidth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  frontWallGrid.rotation.y = Math.PI;
  frontWallGrid.position.z = roomDepth / 2 - 0.02;
  hangarDeckEnvironmentGroup.add(frontWallGrid);

  const leftWallGrid = createGridLines(
    roomDepth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  leftWallGrid.rotation.y = Math.PI / 2;
  leftWallGrid.position.x = -roomWidth / 2 + 0.02;
  hangarDeckEnvironmentGroup.add(leftWallGrid);

  const rightWallGrid = createGridLines(
    roomDepth,
    BASE_ROOM_HEIGHT,
    20,
    10,
    gridColor,
    gridOpacity
  );
  rightWallGrid.rotation.y = -Math.PI / 2;
  rightWallGrid.position.x = roomWidth / 2 - 0.02;
  hangarDeckEnvironmentGroup.add(rightWallGrid);

  const wallMirror = createWallMirror();
  const mirrorDimensions = wallMirror.userData?.dimensions;
  const mirrorHeight = mirrorDimensions?.height ?? BASE_MIRROR_HEIGHT;
  wallMirror.position.set(
    roomWidth / 2 - MIRROR_WALL_INSET,
    roomFloorY + MIRROR_VERTICAL_OFFSET + mirrorHeight / 2,
    6 * ROOM_SCALE_FACTOR
  );
  wallMirror.rotation.y = -Math.PI / 2;
  hangarDeckEnvironmentGroup.add(wallMirror);

  const syncReflectiveSurfaces = () => {
    reflectiveSurfaces.length = 0;
    const wallMirrorReflector = wallMirror.userData?.reflector ?? null;

    if (!reflectionSettings.enabled) {
      if (wallMirrorReflector) {
        wallMirrorReflector.visible = false;
      }
      return;
    }

    const reflector = wallMirrorReflector ?? ensureMirrorReflector(wallMirror);
    if (reflector) {
      reflector.visible = true;
      registerReflectiveSurface(reflector);
    }
  };

  const resizeReflectiveSurfaces = () => {
    reflectiveSurfaces.forEach((reflector) => {
      const renderTarget = reflector?.renderTarget;
      if (!renderTarget || typeof renderTarget.setSize !== "function") {
        return;
      }

      const dimensions =
        reflector?.userData?.renderSurfaceDimensions ?? undefined;
      const surfaceWidth = dimensions?.width;
      const surfaceHeight = dimensions?.height;
      const { width: targetWidth, height: targetHeight } =
        computeReflectorRenderTargetSize(surfaceWidth, surfaceHeight);

      if (
        renderTarget.width !== targetWidth ||
        renderTarget.height !== targetHeight
      ) {
        renderTarget.setSize(targetWidth, targetHeight);
      }
    });
  };

  syncReflectiveSurfaces();

  const liftState = {
    floors: [],
    currentIndex: 0,
  };
  let cachedOutsideMapName = "";

  const resolveOutsideMapName = () => {
    let mapDefinition = null;

    try {
      mapDefinition = loadOutsideMapFromStorage();
    } catch (error) {
      console.warn("Unable to load stored outside map name", error);
    }

    if (!mapDefinition) {
      mapDefinition = createDefaultOutsideMap();
    }

    const name =
      typeof mapDefinition?.name === "string" ? mapDefinition.name.trim() : "";
    cachedOutsideMapName = name;
    return name;
  };

  const updateEnvironmentForPlayerHeight = () => {
    const heightScale = playerHeight / DEFAULT_PLAYER_HEIGHT;

    roomHeight = BASE_ROOM_HEIGHT * heightScale;
    roomFloorY = -roomHeight / 2;

    roomMesh.scale.set(1, heightScale, 1);

    liftState.floors.forEach((floor) => {
      if (floor?.position instanceof THREE.Vector3) {
        floor.position.y = roomFloorY;
      }
    });

    floorGrid.position.y = roomFloorY + 0.02;

    const verticalGridScale = heightScale;
    backWallGrid.scale.y = verticalGridScale;
    frontWallGrid.scale.y = verticalGridScale;
    leftWallGrid.scale.y = verticalGridScale;
    rightWallGrid.scale.y = verticalGridScale;

    registeredLiftDoors.forEach((door) => {
      if (!door) {
        return;
      }

      const baseDimensions = door.userData?.baseDimensions;
      const baseDoorHeight = baseDimensions?.height ?? BASE_DOOR_HEIGHT;
      const baseDoorWidth = baseDimensions?.width ?? BASE_DOOR_WIDTH;

      door.scale.setScalar(heightScale);
      const scaledDoorHeight = baseDoorHeight * heightScale;
      const scaledDoorWidth = baseDoorWidth * heightScale;
      door.userData.height = scaledDoorHeight;
      door.userData.width = scaledDoorWidth;

      const floorOffset = Number.isFinite(door.userData?.floorOffset)
        ? door.userData.floorOffset
        : 0;

      door.position.y = roomFloorY + scaledDoorHeight / 2 + floorOffset;
    });

    const mirrorBaseDimensions = wallMirror.userData?.baseDimensions;
    const baseMirrorHeight = mirrorBaseDimensions?.height ?? BASE_MIRROR_HEIGHT;
    const baseMirrorWidth = mirrorBaseDimensions?.width ?? BASE_MIRROR_WIDTH;
    wallMirror.scale.setScalar(heightScale);
    const scaledMirrorHeight = baseMirrorHeight * heightScale;
    const scaledMirrorWidth = baseMirrorWidth * heightScale;
    wallMirror.userData.dimensions = {
      width: scaledMirrorWidth,
      height: scaledMirrorHeight,
    };
    wallMirror.position.y =
      roomFloorY + MIRROR_VERTICAL_OFFSET + scaledMirrorHeight / 2;

    const reflector = wallMirror.userData?.reflector;
    if (reflector) {
      reflector.userData = reflector.userData || {};
      reflector.userData.renderSurfaceDimensions = {
        width: scaledMirrorWidth,
        height: scaledMirrorHeight,
      };

      if (
        reflector.renderTarget &&
        typeof reflector.renderTarget.setSize === "function"
      ) {
        const renderTargetSize = computeReflectorRenderTargetSize(
          scaledMirrorWidth,
          scaledMirrorHeight
        );
        reflector.renderTarget.setSize(
          renderTargetSize.width,
          renderTargetSize.height
        );
      }
    }

    computerSetup.position.y = roomFloorY;
    if (typeof computerSetup.userData?.notifyCollidersChanged === "function") {
      computerSetup.userData.notifyCollidersChanged();
    } else {
      computerSetup.updateMatrixWorld(true);
      rebuildStaticColliders();
    }

    environmentHeightAdjusters.forEach((adjuster) => {
      try {
        adjuster({ roomFloorY, heightScale });
      } catch (error) {
        console.warn("Unable to update environment for player height", error);
      }
    });
  };

  updateEnvironmentForPlayerHeight();

  const raycaster = new THREE.Raycaster();
  const quickAccessInteractables = [];
  const MAX_TERMINAL_INTERACTION_DISTANCE = 1.5;

  const MAX_LIFT_INTERACTION_DISTANCE = 3.5;

  let liftInteractable = false;
  let liftInteractionsEnabled = true;

  const updateLiftInteractableState = (canInteract) => {
    const nextState = Boolean(canInteract) && liftInteractionsEnabled;

    if (liftInteractable === nextState) {
      return;
    }

    liftInteractable = nextState;

    if (typeof onLiftInteractableChange === "function") {
      onLiftInteractableChange(nextState);
    }
  };

  const setLiftInteractionsEnabled = (enabled) => {
    const nextState = Boolean(enabled);

    if (liftInteractionsEnabled === nextState) {
      return liftInteractionsEnabled;
    }

    liftInteractionsEnabled = nextState;

    if (!liftInteractionsEnabled) {
      updateLiftInteractableState(false);
    }

    return liftInteractionsEnabled;
  };

  let terminalInteractable = false;

  const updateTerminalInteractableState = (canInteract) => {
    if (terminalInteractable === canInteract) {
      return;
    }

    terminalInteractable = canInteract;

    if (typeof onTerminalInteractableChange === "function") {
      onTerminalInteractableChange(canInteract);
    }
  };

  const monitorScreen = computerSetup.userData?.monitorScreen;
  let currentMonitorHoveredZoneId = null;
  if (monitorScreen) {
    quickAccessInteractables.push(monitorScreen);
  }

  const storedPlayerState = loadStoredPlayerState();
  const storedDroneState = loadStoredDroneState();
  const storedDroneSceneState = storedDroneState?.scene ?? null;
  let isPlayerStatePersistenceEnabled = true;
  const storedOrientationEuler = new THREE.Euler(0, 0, 0, "YXZ");

  const controls = new PointerLockControls(camera, canvas);
  const playerObject = controls.getObject();
  if (playerObject?.rotation) {
    playerObject.rotation.order = "YXZ";
  }
  scene.add(playerObject);
  camera.layers.disable(REFLECTION_PLAYER_LAYER);

  const playerReflectionProxy = new THREE.Group();
  playerReflectionProxy.name = "PlayerReflectionProxy";
  playerReflectionProxy.layers.set(REFLECTION_PLAYER_LAYER);

  const playerReflectionMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1f2937),
    metalness: 0.15,
    roughness: 0.65,
  });

  const playerReflectionMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, Math.max(0.1, playerHeight - 0.5), 6, 12),
    playerReflectionMaterial
  );
  playerReflectionProxy.add(playerReflectionMesh);
  playerObject.add(playerReflectionProxy);

  const updatePlayerReflectionProxyDimensions = () => {
    const heightScale = playerHeight / DEFAULT_PLAYER_HEIGHT;
    const radius = Math.max(0.2, 0.25 * heightScale);
    const bodyLength = Math.max(0.1, playerHeight - radius * 2);

    if (playerReflectionMesh.geometry) {
      playerReflectionMesh.geometry.dispose();
    }

    playerReflectionMesh.geometry = new THREE.CapsuleGeometry(
      radius,
      bodyLength,
      6,
      12
    );
    playerReflectionMesh.position.y = playerHeight / 2;
  };

  updatePlayerReflectionProxyDimensions();

  const viewDistanceCullingState = {
    lastDistance: null,
  };

  let getManifestPlacements = () => [];
  const viewDistanceCullingPosition = new THREE.Vector3();
  const VIEW_DISTANCE_FADE_RATIO = 0.12;
  const VIEW_DISTANCE_MIN_FADE = 12;
  const VIEW_DISTANCE_MAX_FADE = 40;
  const applyViewDistanceFade = (
    object,
    distance,
    viewDistance,
    fadeRange
  ) => {
    if (!object?.isObject3D) {
      return;
    }

    if (
      !object.material ||
      Array.isArray(object.material) ||
      !object.material.isMaterial
    ) {
      return;
    }

    if (!Number.isFinite(fadeRange) || fadeRange <= 0) {
      return;
    }

    const fadeStart = Math.max(0, viewDistance - fadeRange);

    if (distance <= fadeStart) {
      if (
        object.userData?.viewDistanceFadeMaterial &&
        object.userData.viewDistanceBaseMaterial &&
        object.material === object.userData.viewDistanceFadeMaterial
      ) {
        object.material = object.userData.viewDistanceBaseMaterial;
      }

      if (object.userData?.viewDistanceFadeMaterial) {
        const baseOpacity = Number.isFinite(object.userData.viewDistanceBaseOpacity)
          ? object.userData.viewDistanceBaseOpacity
          : 1;
        object.userData.viewDistanceFadeMaterial.opacity = baseOpacity;
      }

      return;
    }

    const progress = (distance - fadeStart) / fadeRange;
    const alpha = THREE.MathUtils.clamp(1 - progress, 0, 1);

    if (object.userData) {
      if (!object.userData.viewDistanceBaseMaterial) {
        object.userData.viewDistanceBaseMaterial = object.material;
        object.userData.viewDistanceBaseOpacity = object.material.opacity ?? 1;
      }

      if (!object.userData.viewDistanceFadeMaterial) {
        object.userData.viewDistanceFadeMaterial =
          object.material.clone?.() ?? object.material;
        if (object.userData.viewDistanceFadeMaterial.isMaterial) {
          object.userData.viewDistanceFadeMaterial.transparent = true;
        }
      }
    }

    const fadeMaterial = object.userData?.viewDistanceFadeMaterial;
    const baseOpacity = Number.isFinite(object.userData?.viewDistanceBaseOpacity)
      ? object.userData.viewDistanceBaseOpacity
      : 1;

    if (fadeMaterial?.isMaterial) {
      fadeMaterial.opacity = baseOpacity * alpha;
      object.material = fadeMaterial;
    }
  };

  const updateObjectViewDistance = (
    object,
    playerPosition,
    baseViewDistance
  ) => {
    if (!object?.isObject3D) {
      return;
    }

    const distanceMultiplier = Number.isFinite(object.userData?.viewDistanceMultiplier)
      ? Math.max(0.1, object.userData.viewDistanceMultiplier)
      : 1;
    const viewDistance = baseViewDistance * distanceMultiplier;
    if (!Number.isFinite(viewDistance) || viewDistance <= 0) {
      return;
    }

    const maxDistanceSquared = viewDistance * viewDistance;
    const fadeRange = THREE.MathUtils.clamp(
      viewDistance * VIEW_DISTANCE_FADE_RATIO,
      VIEW_DISTANCE_MIN_FADE,
      VIEW_DISTANCE_MAX_FADE
    );
    object.getWorldPosition(viewDistanceCullingPosition);
    const distanceSquared = viewDistanceCullingPosition.distanceToSquared(
      playerPosition
    );
    const shouldBeVisible = distanceSquared <= maxDistanceSquared;
    const isCulled = object.userData?.viewDistanceCulled === true;

    if (!shouldBeVisible && !isCulled) {
      if (object.userData) {
        object.userData.viewDistanceBaseVisible = object.visible;
        object.userData.viewDistanceCulled = true;
      }
      object.visible = false;
      return;
    }

    if (shouldBeVisible && isCulled) {
      const baseVisible = object.userData?.viewDistanceBaseVisible;
      object.visible = baseVisible !== false;
      if (object.userData) {
        object.userData.viewDistanceCulled = false;
      }
    }

    if (shouldBeVisible) {
      const distance = Math.sqrt(distanceSquared);
      applyViewDistanceFade(object, distance, viewDistance, fadeRange);
    }
  };
  updateViewDistanceCulling = ({ force = false } = {}) => {
    if (!playerObject?.position) {
      return;
    }

    const viewDistance =
      BASE_VIEW_DISTANCE *
      viewSettings.distanceMultiplier *
      VIEW_DISTANCE_CULLING_BUFFER;
    if (!Number.isFinite(viewDistance) || viewDistance <= 0) {
      return;
    }

    if (!force && viewDistanceCullingState.lastDistance === viewDistance) {
      // No-op: the caller updates every frame when movement is possible.
    }

    viewDistanceCullingState.lastDistance = viewDistance;
    const playerPosition = playerObject.position;

    if (Array.isArray(activeTerrainTiles)) {
      activeTerrainTiles.forEach((tile) => {
        updateObjectViewDistance(
          tile,
          playerPosition,
          viewDistance
        );
      });
    }

    if (Array.isArray(activeResourceTargets)) {
      activeResourceTargets.forEach((target) => {
        updateObjectViewDistance(
          target,
          playerPosition,
          viewDistance
        );
      });
    }

    if (Array.isArray(activeViewDistanceTargets)) {
      activeViewDistanceTargets.forEach((target) => {
        updateObjectViewDistance(
          target,
          playerPosition,
          viewDistance
        );
      });
    }

    const manifestPlacementTargets =
      typeof getManifestPlacements === "function"
        ? getManifestPlacements()
        : [];

    if (Array.isArray(manifestPlacementTargets)) {
      manifestPlacementTargets.forEach((target) => {
        updateObjectViewDistance(
          target,
          playerPosition,
          viewDistance
        );
      });
    }
  };

  let currentPlayerHorizontalSpeed = 0;

  const resourceToolGroup = new THREE.Group();
  resourceToolGroup.name = "ResourceTool";
  resourceToolGroup.visible = false;

  const resourceToolBasePosition = new THREE.Vector3(0.45, -0.38, -0.72);
  const resourceToolBaseRotation = new THREE.Euler(-0.28, 0.42, 0.08, "XYZ");
  resourceToolGroup.position.copy(resourceToolBasePosition);
  resourceToolGroup.rotation.copy(resourceToolBaseRotation);

  const resourceToolGeometries = [];
  const resourceToolMaterials = [];

  const trackResourceToolGeometry = (geometry) => {
    if (geometry && !resourceToolGeometries.includes(geometry)) {
      resourceToolGeometries.push(geometry);
    }
  };

  const trackResourceToolMaterial = (material) => {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach(trackResourceToolMaterial);
      return;
    }

    if (!resourceToolMaterials.includes(material)) {
      resourceToolMaterials.push(material);
    }
  };

  const registerResourceToolMesh = (mesh) => {
    if (!mesh) {
      return null;
    }

    trackResourceToolGeometry(mesh.geometry);
    trackResourceToolMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    resourceToolGroup.add(mesh);
    return mesh;
  };

  const resourceToolHandle = registerResourceToolMesh(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.28, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.6,
        metalness: 0.1,
      })
    )
  );
  if (resourceToolHandle) {
    resourceToolHandle.position.set(-0.12, -0.12, -0.04);
  }

  const resourceToolBody = registerResourceToolMesh(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.14, 0.46),
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.35,
        metalness: 0.65,
        roughness: 0.28,
      })
    )
  );
  if (resourceToolBody) {
    resourceToolBody.position.set(0.06, -0.01, 0.02);
  }

  const resourceToolEmitter = registerResourceToolMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.26, 18),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.55,
        metalness: 0.35,
        roughness: 0.22,
      })
    )
  );
  if (resourceToolEmitter) {
    resourceToolEmitter.rotation.z = Math.PI / 2;
    resourceToolEmitter.position.set(0.28, -0.02, 0.14);
  }

  const RESOURCE_TOOL_BEAM_LENGTH = 1.8;
  const resourceToolBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  trackResourceToolMaterial(resourceToolBeamMaterial);
  const resourceToolBeam = registerResourceToolMesh(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, RESOURCE_TOOL_BEAM_LENGTH),
      resourceToolBeamMaterial
    )
  );
  if (resourceToolBeam) {
    resourceToolBeam.position.set(0.3, -0.03, -RESOURCE_TOOL_BEAM_LENGTH / 2 - 0.12);
  }

  const resourceToolGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  trackResourceToolMaterial(resourceToolGlowMaterial);
  const resourceToolGlow = registerResourceToolMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), resourceToolGlowMaterial)
  );
  if (resourceToolGlow) {
    resourceToolGlow.position.set(0.3, -0.03, -0.24);
  }
  const resourceToolLight = new THREE.PointLight(0x38bdf8, 0, 2.6, 2);
  resourceToolLight.position.set(0.28, -0.02, -0.24);
  const RESOURCE_TOOL_MAX_DISTANCE = 7;
  const GEO_VISOR_MAX_DISTANCE = 2;
  const RESOURCE_TOOL_MIN_ACTION_DURATION = 3;
  const RESOURCE_TOOL_MAX_ACTION_DURATION = 10;
  const RESOURCE_TOOL_PLAYER_SUCCESS_PROBABILITY = 0.5;
  const RESOURCE_TOOL_DRONE_SUCCESS_PROBABILITY = 0.1;
  const RESOURCE_TOOL_MOVEMENT_CANCEL_DISTANCE = 0.2;
  const RESOURCE_TOOL_MOVEMENT_CANCEL_DISTANCE_SQUARED =
    RESOURCE_TOOL_MOVEMENT_CANCEL_DISTANCE ** 2;
  const RESOURCE_SESSION_PLAYER_SOURCE = "player";
  const RESOURCE_SESSION_DRONE_SOURCE = "drone-miner";
  const createResourceSessionState = (source) => ({
    isActive: false,
    startPosition: new THREE.Vector3(),
    baseDetail: null,
    eventDetail: null,
    source,
    remainingTime: 0,
  });
  const resourceSessionRegistry = new Map();
  [RESOURCE_SESSION_PLAYER_SOURCE, RESOURCE_SESSION_DRONE_SOURCE].forEach((source) => {
    resourceSessionRegistry.set(source, createResourceSessionState(source));
  });
  const getResourceSession = (source = RESOURCE_SESSION_PLAYER_SOURCE) => {
    const resolvedSource =
      typeof source === "string" && source.length > 0
        ? source
        : RESOURCE_SESSION_PLAYER_SOURCE;

    if (!resourceSessionRegistry.has(resolvedSource)) {
      resourceSessionRegistry.set(
        resolvedSource,
        createResourceSessionState(resolvedSource)
      );
    }

    return resourceSessionRegistry.get(resolvedSource);
  };

  const findResourceTarget = (object) => {
    let current = object;

    while (current) {
      if (current.userData?.isResourceTarget) {
        return current;
      }

      current = current.parent;
    }

    return null;
  };

  const findTerrainTile = (object) => {
    let current = object;

    while (current) {
      if (current.userData?.terrainId) {
        return current;
      }

      current = current.parent;
    }

    return null;
  };

  const findTerrainIntersection = ({
    allowRevealedBeyondGeoVisorDistance = false,
  } = {}) => {
    if (!controls.isLocked) {
      return null;
    }

    if (!Array.isArray(activeTerrainTiles) || activeTerrainTiles.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(activeTerrainTiles, true);

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) =>
      findTerrainTile(candidate.object)
    );

    if (!intersection || !Number.isFinite(intersection.distance)) {
      return null;
    }

    const targetObject = findTerrainTile(intersection.object);

    if (!targetObject) {
      return null;
    }

    const terrainId = targetObject.userData?.terrainId ?? null;
    const terrainLabel = targetObject.userData?.terrainLabel ?? null;
    const tileIndex = Number.isFinite(targetObject.userData?.tileVariantIndex)
      ? targetObject.userData.tileVariantIndex
      : null;
    const geoVisorRevealed = Boolean(targetObject.userData?.geoVisorRevealed);
    const withinGeoVisorDistance =
      intersection.distance <= GEO_VISOR_MAX_DISTANCE;

    if (
      !withinGeoVisorDistance &&
      !(allowRevealedBeyondGeoVisorDistance && geoVisorRevealed)
    ) {
      return null;
    }

    return {
      terrainId,
      terrainLabel,
      tileIndex,
      geoVisorRevealed,
      withinGeoVisorDistance,
      position: intersection.point?.clone?.() ?? null,
    };
  };

  const prepareResourceCollection = ({ requireLockedControls = true } = {}) => {
    if (requireLockedControls && !controls.isLocked) {
      return null;
    }

    if (!Array.isArray(activeResourceTargets) || activeResourceTargets.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(activeResourceTargets, true);

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) =>
      findResourceTarget(candidate.object)
    );

    if (!intersection) {
      return null;
    }

    if (
      !Number.isFinite(intersection.distance) ||
      intersection.distance > RESOURCE_TOOL_MAX_DISTANCE
    ) {
      return null;
    }

    const targetObject = findResourceTarget(intersection.object);

    if (!targetObject) {
      return null;
    }

    return { intersection, targetObject };
  };

  const notifyResourceUnavailable = (detail) => {
    if (typeof onResourceUnavailable !== "function") {
      return;
    }

    try {
      onResourceUnavailable(detail);
    } catch (error) {
      console.warn("Unable to notify resource availability", error);
    }
  };

  const handleResourceToolActionEvent = (event) => {
    const markActionFailed = () => {
      resourceToolState.cooldown = 0;
      resourceToolState.beamTimer = 0;
      resourceToolState.recoil = 0;
      resourceToolState.actionDuration = RESOURCE_TOOL_BASE_ACTION_DURATION;

      if (resourceToolBeamMaterial) {
        resourceToolBeamMaterial.opacity = 0;
      }

      if (resourceToolGlowMaterial) {
        resourceToolGlowMaterial.opacity = 0;
      }

      if (resourceToolGlow) {
        resourceToolGlow.scale.set(1, 1, 1);
      }

      resourceToolLight.intensity = 0;
      resourceToolLight.distance = 2.6;

      if (event?.detail) {
        event.detail.success = false;
      }
    };

    if (getResourceSession(RESOURCE_SESSION_PLAYER_SOURCE).isActive) {
      markActionFailed();
      return;
    }

    const preparedSession = prepareResourceCollection();

    if (!preparedSession) {
      const terrainDetail = findTerrainIntersection();

      if (terrainDetail?.terrainId === "void") {
        notifyResourceUnavailable({ terrain: terrainDetail });
      }

      markActionFailed();
      return;
    }

    const actionDuration = THREE.MathUtils.randFloat(
      RESOURCE_TOOL_MIN_ACTION_DURATION,
      RESOURCE_TOOL_MAX_ACTION_DURATION
    );

    resourceToolState.actionDuration = actionDuration;
    resourceToolState.cooldown = actionDuration;
    resourceToolState.beamTimer = actionDuration;
    resourceToolState.recoil = 1;

    startResourceCollectionSession({
      ...preparedSession,
      actionDuration,
      eventDetail: event?.detail ?? null,
      source: RESOURCE_SESSION_PLAYER_SOURCE,
    });
  };

  camera.add(resourceToolGroup);

  const droneMinerGroup = new THREE.Group();
  droneMinerGroup.name = "DroneMiner";
  droneMinerGroup.visible = false;
  scene.add(droneMinerGroup);

  const droneMinerGeometries = [];
  const droneMinerMaterials = [];
  const trackDroneGeometry = (geometry) => {
    if (geometry && !droneMinerGeometries.includes(geometry)) {
      droneMinerGeometries.push(geometry);
    }
  };
  const trackDroneMaterial = (material) => {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach(trackDroneMaterial);
      return;
    }

    if (!droneMinerMaterials.includes(material)) {
      droneMinerMaterials.push(material);
    }
  };
  const registerDroneMesh = (mesh, { parent = droneMinerGroup } = {}) => {
    if (!mesh) {
      return null;
    }

    trackDroneGeometry(mesh.geometry);
    trackDroneMaterial(mesh.material);
    parent.add(mesh);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  };

  const droneHull = registerDroneMesh(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.25,
        metalness: 0.5,
        roughness: 0.32,
      })
    )
  );
  if (droneHull) {
    droneHull.position.set(0, 0, 0);
  }

  const droneVisor = registerDroneMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.12, 18),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0x93c5fd,
        emissiveIntensity: 0.65,
        metalness: 0.15,
        roughness: 0.2,
      })
    )
  );
  if (droneVisor) {
    droneVisor.rotation.x = Math.PI / 2;
    droneVisor.position.set(0, 0, 0.18);
  }

  const droneThrusterMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.55,
    roughness: 0.4,
  });
  trackDroneMaterial(droneThrusterMaterial);
  [-0.18, 0.18].forEach((offset) => {
    const thruster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.18, 12),
      droneThrusterMaterial
    );
    trackDroneGeometry(thruster.geometry);
    registerDroneMesh(thruster);
    thruster.rotation.z = Math.PI / 2;
    thruster.position.set(offset, 0.02, -0.04);
  });

  const rotorGroup = new THREE.Group();
  rotorGroup.name = "DroneRotor";
  rotorGroup.position.set(0, 0.18, 0);
  droneMinerGroup.add(rotorGroup);

  const rotorHub = registerDroneMesh(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16),
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.6,
        roughness: 0.25,
      })
    ),
    { parent: rotorGroup }
  );
  if (rotorHub) {
    rotorHub.rotation.x = Math.PI / 2;
  }

  const rotorBladeMaterial = new THREE.MeshStandardMaterial({
    color: 0xcbd5f5,
    metalness: 0.35,
    roughness: 0.3,
  });
  trackDroneMaterial(rotorBladeMaterial);
  [0, Math.PI / 2].forEach((angle) => {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.01, 0.5),
      rotorBladeMaterial
    );
    trackDroneGeometry(blade.geometry);
    rotorGroup.add(blade);
    blade.rotation.y = angle;
  });

  const droneCutterMaterial = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
    metalness: 0.4,
    roughness: 0.3,
  });
  trackDroneMaterial(droneCutterMaterial);
  const droneCutter = registerDroneMesh(
    new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 16), droneCutterMaterial)
  );
  if (droneCutter) {
    droneCutter.rotation.x = Math.PI / 2;
    droneCutter.position.set(0, -0.2, 0.04);
  }

  const droneCutterGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfcd34d,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  trackDroneMaterial(droneCutterGlowMaterial);
  const droneCutterGlow = registerDroneMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), droneCutterGlowMaterial)
  );
  if (droneCutterGlow) {
    droneCutterGlow.position.set(0, -0.22, 0.05);
  }

  const droneHeadLight = new THREE.PointLight(0x93c5fd, 0.35, 3.5, 2.2);
  droneHeadLight.position.set(0, 0, 0.18);
  droneMinerGroup.add(droneHeadLight);
  const droneCutterLight = new THREE.PointLight(0xf97316, 0.8, 2.6, 2.5);
  droneCutterLight.position.set(0, -0.22, 0.04);
  droneMinerGroup.add(droneCutterLight);

  const DRONE_MINER_HOVER_AMPLITUDE = 0.08;
  const DRONE_MINER_HOVER_SPEED = 2.3;
  const DRONE_MINER_ROTOR_SPEED = 8;
  const DRONE_MINER_HOVER_LIFT = 0.4;
  const DRONE_MINER_SURFACE_MARGIN = 0.05;
  const DRONE_MINER_PLAYER_RETURN_OFFSET = 5;
  const DRONE_MINER_RETURN_DISTANCE_THRESHOLD = 0.35;
  const DRONE_MINER_MIN_RETURN_SPEED = 2.5;
  const DRONE_MINER_RETURN_DISTANCE_THRESHOLD_SQUARED =
    DRONE_MINER_RETURN_DISTANCE_THRESHOLD * DRONE_MINER_RETURN_DISTANCE_THRESHOLD;
  const DRONE_MINER_DEPLOY_TRANSITION_DURATION = 0.65;
  const droneMinerState = {
    active: false,
    basePosition: new THREE.Vector3(),
    hoverPhase: 0,
    lookDirection: new THREE.Vector3(0, -1, 0),
    returning: false,
    rotor: rotorGroup,
    cutterMaterial: droneCutterMaterial,
    cutterGlow: droneCutterGlow,
    hasBasePosition: false,
    transitionActive: false,
    transitionElapsed: 0,
    transitionStart: new THREE.Vector3(),
    transitionTarget: new THREE.Vector3(),
  };

  const applyStoredDroneSceneState = () => {
    if (!storedDroneSceneState) {
      return;
    }

    const storedBase = storedDroneSceneState.basePosition;
    if (
      storedBase &&
      Number.isFinite(storedBase.x) &&
      Number.isFinite(storedBase.y) &&
      Number.isFinite(storedBase.z)
    ) {
      droneMinerState.basePosition.set(
        storedBase.x,
        storedBase.y,
        storedBase.z
      );
      droneMinerState.hasBasePosition = true;
      droneMinerGroup.position.copy(droneMinerState.basePosition);
    }

    const storedLookDirection = storedDroneSceneState.lookDirection;
    if (
      storedLookDirection &&
      Number.isFinite(storedLookDirection.x) &&
      Number.isFinite(storedLookDirection.y) &&
      Number.isFinite(storedLookDirection.z)
    ) {
      droneMinerState.lookDirection.set(
        storedLookDirection.x,
        storedLookDirection.y,
        storedLookDirection.z
      );
    }

    droneMinerState.active = Boolean(storedDroneSceneState.active);
    droneMinerState.returning = Boolean(storedDroneSceneState.returning);

    if (droneMinerState.active && droneMinerState.hasBasePosition) {
      droneMinerGroup.visible = true;
      droneMinerState.hoverPhase = Math.random() * Math.PI * 2;
    }
  };

  applyStoredDroneSceneState();
  const droneLookDirectionHelper = new THREE.Vector3();
  const droneLookTarget = new THREE.Vector3();
  const droneReturnTarget = new THREE.Vector3();
  const droneReturnOffset = new THREE.Vector3();
  const resolveDroneSurfaceBaseHeight = (position, fallbackY = roomFloorY) => {
    const terrainHeight = getTerrainGroundHeight(position);
    if (Number.isFinite(terrainHeight)) {
      return Math.max(roomFloorY, terrainHeight);
    }

    return Math.max(
      roomFloorY,
      Number.isFinite(fallbackY) ? fallbackY : roomFloorY
    );
  };
  const clampDroneBasePositionToSurface = () => {
    if (!droneMinerState.hasBasePosition) {
      return;
    }

    const minBaseY =
      resolveDroneSurfaceBaseHeight(
        droneMinerState.basePosition,
        droneMinerState.basePosition.y
      ) +
      DRONE_MINER_HOVER_LIFT +
      DRONE_MINER_SURFACE_MARGIN;

    if (droneMinerState.basePosition.y < minBaseY) {
      droneMinerState.basePosition.y = minBaseY;
    }
  };

  const hideDroneMiner = () => {
    if (!droneMinerState.active && !droneMinerGroup.visible) {
      return;
    }

    const wasReturning = droneMinerState.returning;

    droneMinerState.active = false;
    droneMinerState.returning = false;
    droneMinerGroup.visible = false;
    droneMinerState.transitionActive = false;
    droneMinerState.transitionElapsed = 0;

    if (wasReturning && typeof onDroneReturnComplete === "function") {
      try {
        onDroneReturnComplete();
      } catch (error) {
        console.warn("Unable to notify drone return completion", error);
      }
    }
  };

  const showDroneMiner = (intersection) => {
    if (!intersection) {
      return;
    }

    const spawnPoint = intersection.point ?? null;
    if (!spawnPoint) {
      return;
    }

    const spawnSurfaceBaseY = resolveDroneSurfaceBaseHeight(
      spawnPoint,
      spawnPoint.y
    );
    droneMinerState.transitionTarget.set(
      spawnPoint.x,
      spawnSurfaceBaseY + DRONE_MINER_HOVER_LIFT + DRONE_MINER_SURFACE_MARGIN,
      spawnPoint.z
    );

    if (!droneMinerState.hasBasePosition) {
      droneMinerState.basePosition.copy(droneMinerState.transitionTarget);
      droneMinerState.hasBasePosition = true;
      droneMinerState.transitionActive = false;
    } else {
      droneMinerState.transitionStart.copy(droneMinerState.basePosition);
      const distanceToTargetSquared = droneMinerState.transitionStart.distanceToSquared(
        droneMinerState.transitionTarget,
      );
      if (distanceToTargetSquared < 1e-4) {
        droneMinerState.basePosition.copy(droneMinerState.transitionTarget);
        droneMinerState.transitionActive = false;
      } else {
        droneMinerState.transitionElapsed = 0;
        droneMinerState.transitionActive = true;
      }
    }

    droneMinerGroup.position.copy(droneMinerState.basePosition);
    droneMinerState.hoverPhase = Math.random() * Math.PI * 2;
    droneMinerState.returning = false;

    const normal = intersection.face?.normal;
    if (normal) {
      droneMinerState.lookDirection.copy(normal).normalize().multiplyScalar(-1);
    } else {
      camera.getWorldDirection(droneMinerState.lookDirection);
      if (droneMinerState.lookDirection.y > -0.2) {
        droneMinerState.lookDirection.y = -0.2;
      }
      droneMinerState.lookDirection.normalize();
    }

    droneMinerGroup.visible = true;
    droneMinerState.active = true;
  };

  const returnDroneMinerToPlayer = () => {
    if (!droneMinerState.active) {
      return;
    }

    droneMinerState.returning = true;
    droneMinerGroup.visible = true;
    droneMinerState.transitionActive = false;
  };

  const updateDroneMiner = (delta = 0, elapsedTime = 0) => {
    if (!droneMinerState.active) {
      return;
    }

    if (droneMinerState.returning) {
      droneReturnTarget.copy(playerObject.position);
      droneReturnOffset
        .copy(droneMinerState.basePosition)
        .sub(droneReturnTarget);
      droneReturnOffset.y = 0;
      const playerToDroneDistance = droneReturnOffset.length();
      if (playerToDroneDistance > 1e-3) {
        droneReturnOffset.multiplyScalar(
          DRONE_MINER_PLAYER_RETURN_OFFSET / playerToDroneDistance,
        );
      } else {
        camera.getWorldDirection(droneReturnOffset);
        droneReturnOffset.y = 0;
        if (droneReturnOffset.lengthSq() < 1e-3) {
          droneReturnOffset.set(1, 0, 0);
        }
        droneReturnOffset.normalize().multiplyScalar(DRONE_MINER_PLAYER_RETURN_OFFSET);
      }
      droneReturnTarget.add(droneReturnOffset);
      const groundedReturnY = Number.isFinite(playerGroundedHeight)
        ? playerGroundedHeight
        : roomFloorY;
      const playerBaseY = playerObject.position.y;
      const returnBaseY = Math.max(playerBaseY, groundedReturnY);
      const returnSurfaceBaseY = resolveDroneSurfaceBaseHeight(
        droneReturnTarget,
        returnBaseY
      );
      droneReturnTarget.y =
        Math.max(returnBaseY, returnSurfaceBaseY) +
        DRONE_MINER_HOVER_LIFT +
        DRONE_MINER_SURFACE_MARGIN;

      droneReturnOffset
        .copy(droneReturnTarget)
        .sub(droneMinerState.basePosition);
      const distanceToTarget = droneReturnOffset.length();
      const playerMatchedSpeed = Math.max(
        currentPlayerHorizontalSpeed,
        DRONE_MINER_MIN_RETURN_SPEED
      );
      const maxStep = playerMatchedSpeed * delta;

      if (distanceToTarget <= maxStep) {
        droneMinerState.basePosition.copy(droneReturnTarget);
      } else if (distanceToTarget > 0) {
        droneReturnOffset.multiplyScalar(1 / distanceToTarget);
        droneMinerState.basePosition.addScaledVector(droneReturnOffset, maxStep);
      }

      if (
        droneMinerState.basePosition.distanceToSquared(droneReturnTarget) <
        DRONE_MINER_RETURN_DISTANCE_THRESHOLD_SQUARED
      ) {
        hideDroneMiner();
        return;
      }

      droneMinerState.lookDirection
        .copy(droneReturnTarget)
        .sub(droneMinerGroup.position)
        .normalize();
    }

    if (!droneMinerState.returning && droneMinerState.transitionActive) {
      droneMinerState.transitionElapsed = Math.min(
        droneMinerState.transitionElapsed + delta,
        DRONE_MINER_DEPLOY_TRANSITION_DURATION,
      );
      const transitionProgress =
        droneMinerState.transitionElapsed / DRONE_MINER_DEPLOY_TRANSITION_DURATION;
      const easedProgress = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
      droneMinerState.basePosition.lerpVectors(
        droneMinerState.transitionStart,
        droneMinerState.transitionTarget,
        easedProgress,
      );

      if (transitionProgress >= 1) {
        droneMinerState.transitionActive = false;
        droneMinerState.basePosition.copy(droneMinerState.transitionTarget);
      }
    }

    clampDroneBasePositionToSurface();

    const hoverOffset =
      Math.sin(elapsedTime * DRONE_MINER_HOVER_SPEED + droneMinerState.hoverPhase) *
      DRONE_MINER_HOVER_AMPLITUDE;
    droneMinerGroup.position.set(
      droneMinerState.basePosition.x,
      droneMinerState.basePosition.y + hoverOffset,
      droneMinerState.basePosition.z
    );

    droneLookDirectionHelper.copy(droneMinerState.lookDirection).normalize();
    if (droneLookDirectionHelper.lengthSq() < 1e-6) {
      droneLookDirectionHelper.set(0, -1, 0);
    }
    droneLookTarget
      .copy(droneMinerGroup.position)
      .add(droneLookDirectionHelper.multiplyScalar(0.5));
    droneMinerGroup.lookAt(droneLookTarget);

    if (droneMinerState.rotor) {
      droneMinerState.rotor.rotation.y += delta * DRONE_MINER_ROTOR_SPEED;
    }

    if (droneMinerState.cutterMaterial) {
      const pulse = 0.5 + 0.4 * Math.sin(elapsedTime * 5);
      droneMinerState.cutterMaterial.emissiveIntensity = 0.3 + pulse * 0.4;
    }

    if (droneMinerState.cutterGlow?.material) {
      const glowPulse = 0.7 + 0.25 * Math.sin(elapsedTime * 4);
      droneMinerState.cutterGlow.material.opacity = glowPulse;
      droneMinerState.cutterGlow.scale.setScalar(0.85 + glowPulse * 0.2);
    }
  };

  const RESOURCE_TOOL_BASE_ACTION_DURATION = RESOURCE_TOOL_MIN_ACTION_DURATION;
  const RESOURCE_TOOL_RECOIL_RECOVERY = 6;
  const RESOURCE_TOOL_IDLE_SWAY = 0.015;
  const RESOURCE_TOOL_IDLE_SWAY_SPEED = 2.1;
  const RESOURCE_TOOL_IDLE_BOB_SPEED = 1.4;
  const resourceToolState = {
    beamTimer: 0,
    cooldown: 0,
    recoil: 0,
    actionDuration: RESOURCE_TOOL_BASE_ACTION_DURATION,
  };
  let primaryActionHeld = false;
  let autoResourceToolEngaged = false;
  let scheduledResourceToolResumeFrameId = 0;

  const cancelScheduledResourceToolResume = () => {
    if (scheduledResourceToolResumeFrameId === 0) {
      return;
    }

    window.cancelAnimationFrame(scheduledResourceToolResumeFrameId);
    scheduledResourceToolResumeFrameId = 0;
  };

  function clearResourceSession(session) {
    if (!session) {
      return;
    }

    session.isActive = false;
    session.baseDetail = null;
    session.eventDetail = null;
    session.startPosition.set(0, 0, 0);
    session.remainingTime = 0;
  }

  function startResourceCollectionSession({
    intersection,
    targetObject,
    actionDuration,
    eventDetail,
    source = RESOURCE_SESSION_PLAYER_SOURCE,
  }) {
    const terrainId = targetObject.userData?.terrainId ?? null;
    const terrainLabel = targetObject.userData?.terrainLabel ?? null;
    const tileIndex = Number.isFinite(targetObject.userData?.tileVariantIndex)
      ? targetObject.userData.tileVariantIndex
      : null;
    const sessionSource = source || RESOURCE_SESSION_PLAYER_SOURCE;
    const session = getResourceSession(sessionSource);

    session.isActive = true;
    session.startPosition.copy(playerObject.position);
    session.baseDetail = {
      terrain: {
        id: terrainId,
        label: terrainLabel,
        tileIndex,
      },
      position: {
        x: intersection.point.x,
        y: intersection.point.y,
        z: intersection.point.z,
      },
      distance: intersection.distance,
      actionDuration,
      source: sessionSource,
    };
    session.eventDetail = eventDetail ?? null;
    session.source = sessionSource;
    session.remainingTime = actionDuration;

    if (eventDetail) {
      eventDetail.success = true;
      eventDetail.actionDuration = actionDuration;
    }

    if (sessionSource === RESOURCE_SESSION_DRONE_SOURCE) {
      showDroneMiner(intersection ?? null);
    }
  }

  function dispatchResourceCollectionDetail(detail) {
    if (typeof onResourceCollected !== "function") {
      return;
    }

    try {
      onResourceCollected(detail);
    } catch (error) {
      console.warn("Unable to notify resource collection", error);
    }
  }

  function finishResourceSession(session) {
    if (!session?.isActive || !session.baseDetail) {
      clearResourceSession(session);
      return;
    }

    const baseDetail = session.baseDetail;
    const eventDetail = session.eventDetail;
    const sessionSource = baseDetail?.source ?? session.source ?? RESOURCE_SESSION_PLAYER_SOURCE;

    if (sessionSource === RESOURCE_SESSION_DRONE_SOURCE) {
      returnDroneMinerToPlayer();
    }

    clearResourceSession(session);

    if (sessionSource === RESOURCE_SESSION_PLAYER_SOURCE) {
      resourceToolState.cooldown = 0;
      resourceToolState.beamTimer = 0;
      resourceToolState.recoil = 0;
      resourceToolState.actionDuration = RESOURCE_TOOL_BASE_ACTION_DURATION;
    }

    const successProbability =
      sessionSource === RESOURCE_SESSION_DRONE_SOURCE
        ? RESOURCE_TOOL_DRONE_SUCCESS_PROBABILITY
        : RESOURCE_TOOL_PLAYER_SUCCESS_PROBABILITY;

    const foundResource = Math.random() < successProbability;

    if (!foundResource) {
      if (eventDetail) {
        eventDetail.success = false;
      }

      dispatchResourceCollectionDetail({
        ...baseDetail,
        source: sessionSource,
        found: false,
      });
      if (sessionSource === RESOURCE_SESSION_PLAYER_SOURCE) {
        continueResourceToolIfHeld();
      }
      return;
    }

    const terrainId = baseDetail?.terrain?.id ?? null;
    const element = sampleTerrainElement(terrainId);

    if (!element) {
      if (eventDetail) {
        eventDetail.success = false;
      }

      dispatchResourceCollectionDetail({
        ...baseDetail,
        found: false,
      });
      continueResourceToolIfHeld();
      return;
    }

    if (eventDetail) {
      eventDetail.success = true;
    }

    const elementWeight = getElementWeightFromAtomicNumber(element.number);
    const elementDetail =
      element && typeof element === "object"
        ? { ...element, weight: elementWeight }
        : { weight: elementWeight };

    dispatchResourceCollectionDetail({
      ...baseDetail,
      source: sessionSource,
      element: elementDetail,
      found: true,
    });
    if (sessionSource === RESOURCE_SESSION_PLAYER_SOURCE) {
      continueResourceToolIfHeld();
    }
  }

  function notifyResourceSessionCancelled(reason, source = RESOURCE_SESSION_PLAYER_SOURCE) {
    if (typeof onResourceSessionCancelled !== "function") {
      return;
    }

    try {
      onResourceSessionCancelled({ reason, source });
    } catch (error) {
      console.warn("Unable to notify resource session cancellation", error);
    }
  }

  function cancelResourceSessionInstance(session, { reason } = {}) {
    if (!session?.isActive) {
      return;
    }

    const eventDetail = session.eventDetail;
    const sessionSource = session.source ?? RESOURCE_SESSION_PLAYER_SOURCE;

    if (sessionSource === RESOURCE_SESSION_DRONE_SOURCE) {
      if (reason === "manual" || reason === "fuel") {
        returnDroneMinerToPlayer();
      } else {
        hideDroneMiner();
      }
    }

    clearResourceSession(session);

    if (sessionSource === RESOURCE_SESSION_PLAYER_SOURCE) {
      resourceToolState.cooldown = 0;
      resourceToolState.beamTimer = 0;
      resourceToolState.recoil = 0;
      resourceToolState.actionDuration = RESOURCE_TOOL_BASE_ACTION_DURATION;
      cancelScheduledResourceToolResume();

      primaryActionHeld = false;
      autoResourceToolEngaged = false;

      if (resourceToolBeamMaterial) {
        resourceToolBeamMaterial.opacity = 0;
      }

      if (resourceToolGlowMaterial) {
        resourceToolGlowMaterial.opacity = 0;
      }

      if (resourceToolGlow) {
        resourceToolGlow.scale.set(1, 1, 1);
      }

      resourceToolLight.intensity = 0;
      resourceToolLight.distance = 2.6;
    }

    if (eventDetail) {
      eventDetail.success = false;
    }

    if (reason) {
      notifyResourceSessionCancelled(reason, sessionSource);
    }
  }

  function cancelActiveResourceSession({
    reason,
    source = RESOURCE_SESSION_PLAYER_SOURCE,
  } = {}) {
    const session = getResourceSession(source);
    cancelResourceSessionInstance(session, { reason });
  }

  function updateResourceSessions(delta = 0) {
    const elapsed = Number.isFinite(delta) && delta > 0 ? delta : 0;

    resourceSessionRegistry.forEach((session) => {
      if (!session.isActive) {
        return;
      }

      const sessionSource = session.source ?? RESOURCE_SESSION_PLAYER_SOURCE;

      if (sessionSource === RESOURCE_SESSION_PLAYER_SOURCE) {
        if (!controls.isLocked) {
          cancelResourceSessionInstance(session, { reason: "controls-unlocked" });
          return;
        }

        const startPosition = session.startPosition;

        if (startPosition) {
          const deltaX = playerObject.position.x - startPosition.x;
          const deltaZ = playerObject.position.z - startPosition.z;
          const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;

          if (distanceSquared > RESOURCE_TOOL_MOVEMENT_CANCEL_DISTANCE_SQUARED) {
            cancelResourceSessionInstance(session, { reason: "movement" });
            return;
          }
        }
      }

      const remaining = Math.max(0, (session.remainingTime ?? 0) - elapsed);
      session.remainingTime = remaining;

      if (remaining <= 0) {
        finishResourceSession(session);
      }
    });
  }

  const resetResourceToolState = () => {
    resourceToolState.beamTimer = 0;
    resourceToolState.cooldown = 0;
    resourceToolState.recoil = 0;
    resourceToolState.actionDuration = RESOURCE_TOOL_BASE_ACTION_DURATION;
    cancelScheduledResourceToolResume();
    primaryActionHeld = false;
    autoResourceToolEngaged = false;
    if (resourceToolBeamMaterial) {
      resourceToolBeamMaterial.opacity = 0;
    }
    if (resourceToolGlowMaterial) {
      resourceToolGlowMaterial.opacity = 0;
    }
    if (resourceToolGlow) {
      resourceToolGlow.scale.set(1, 1, 1);
    }
    resourceToolLight.intensity = 0;
    resourceToolLight.distance = 2.6;
    resourceToolGroup.position.copy(resourceToolBasePosition);
    resourceToolGroup.rotation.copy(resourceToolBaseRotation);
  };

  resetResourceToolState();
  resourceToolGroup.visible = controls.isLocked;

  const triggerResourceToolAction = () => {
    if (resourceToolState.cooldown > 0) {
      return false;
    }

    try {
      const actionEvent = new CustomEvent("resource-tool:action", {
        detail: { timestamp: performance.now(), success: false },
      });
      canvas.dispatchEvent(actionEvent);

      const success = Boolean(actionEvent?.detail?.success);

      if (success) {
        autoResourceToolEngaged = true;
      }

      return success;
    } catch (error) {
      console.warn("Unable to dispatch resource tool action event", error);
    }

    return false;
  };

  const launchDroneMiner = () => {
    if (getResourceSession(RESOURCE_SESSION_DRONE_SOURCE).isActive) {
      return { started: false, reason: "busy" };
    }

    const preparedSession = prepareResourceCollection({
      requireLockedControls: false,
    });

    if (!preparedSession) {
      return { started: false, reason: "no-target" };
    }

    const actionDuration = THREE.MathUtils.randFloat(
      RESOURCE_TOOL_MIN_ACTION_DURATION,
      RESOURCE_TOOL_MAX_ACTION_DURATION
    );

    startResourceCollectionSession({
      ...preparedSession,
      actionDuration,
      source: RESOURCE_SESSION_DRONE_SOURCE,
    });

    return { started: true, duration: actionDuration };
  };

  const cancelDroneMinerSession = ({ reason = "manual" } = {}) => {
    const session = getResourceSession(RESOURCE_SESSION_DRONE_SOURCE);

    if (!session?.isActive) {
      return false;
    }

    cancelResourceSessionInstance(session, { reason });
    return true;
  };

  function continueResourceToolIfHeld() {
    cancelScheduledResourceToolResume();

    if (!primaryActionHeld && !autoResourceToolEngaged) {
      return;
    }

    if (!controls.isLocked) {
      return;
    }

    if (resourceToolState.cooldown > 0) {
      return;
    }

    if (getResourceSession(RESOURCE_SESSION_PLAYER_SOURCE).isActive) {
      return;
    }

    scheduledResourceToolResumeFrameId = window.requestAnimationFrame(() => {
      scheduledResourceToolResumeFrameId = 0;

      if (!primaryActionHeld && !autoResourceToolEngaged) {
        return;
      }

      if (!controls.isLocked) {
        return;
      }

      if (resourceToolState.cooldown > 0) {
        return;
      }

      if (getResourceSession(RESOURCE_SESSION_PLAYER_SOURCE).isActive) {
        return;
      }

      triggerResourceToolAction();
    });
  }

  const handlePrimaryActionDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    if (!controls.isLocked) {
      return;
    }

    primaryActionHeld = true;
    cancelScheduledResourceToolResume();
    triggerResourceToolAction();
  };

  const handlePrimaryActionUp = (event) => {
    if (event.button !== 0) {
      return;
    }

    primaryActionHeld = false;
    cancelScheduledResourceToolResume();
  };

  let playerEyeLevel = playerHeight;

  const FIRST_PERSON_EYE_HEIGHT_OFFSET = -0.1;

  const firstPersonCameraOffset = new THREE.Vector3(
    0,
    playerEyeLevel + FIRST_PERSON_EYE_HEIGHT_OFFSET,
    0
  );

  const updateFirstPersonCameraOffset = () => {
    const baseHeight = Number.isFinite(playerHeight)
      ? Math.max(playerHeight, MIN_PLAYER_HEIGHT)
      : MIN_PLAYER_HEIGHT;
    const adjustedEyeLevel = Math.max(
      MIN_PLAYER_HEIGHT,
      baseHeight + FIRST_PERSON_EYE_HEIGHT_OFFSET
    );

    firstPersonCameraOffset.set(0, adjustedEyeLevel, 0);
  };

  const defaultPlayerPosition = new THREE.Vector3(
    0,
    roomFloorY,
    8 * ROOM_SCALE_FACTOR
  );

  let travelToLiftFloor = null;

  const liftFrontApproachZ = roomDepth / 2 - 3 * ROOM_SCALE_FACTOR;
  const liftRearApproachZ = -roomDepth / 2 + 3 * ROOM_SCALE_FACTOR;
  const liftPortApproachX = -roomWidth / 4;

  const hangarDeckFloorPosition = new THREE.Vector3(
    0,
    roomFloorY,
    liftFrontApproachZ
  );

  const operationsDeckFloorPositionFallback = new THREE.Vector3(
    liftPortApproachX,
    roomFloorY,
    0
  );

  const operationsExteriorFloorPositionFallback = new THREE.Vector3()
    .copy(operationsExteriorGroupPosition)
    .add(operationsExteriorTeleportOffset);
  operationsExteriorFloorPositionFallback.y = roomFloorY;

  const engineeringDeckFloorPositionFallback = new THREE.Vector3(
    0,
    roomFloorY,
    liftRearApproachZ
  );

  const exteriorDeckFloorPositionFallback = new THREE.Vector3(
    -roomWidth / 3,
    roomFloorY,
    -roomDepth * 3.6 - (roomDepth * 1.15) / 2 + 1.9
  );

  const resolvedOperationsFloorPosition =
    operationsDeckFloorPosition instanceof THREE.Vector3
      ? operationsDeckFloorPosition
      : operationsDeckFloorPositionFallback;

  const resolvedOperationsExteriorFloorPosition =
    operationsExteriorFloorPosition instanceof THREE.Vector3
      ? operationsExteriorFloorPosition
      : operationsExteriorFloorPositionFallback;

  const resolvedEngineeringFloorPosition =
    engineeringDeckFloorPosition instanceof THREE.Vector3
      ? engineeringDeckFloorPosition
      : engineeringDeckFloorPositionFallback;

  const resolvedExteriorFloorPosition =
    exteriorDeckFloorPosition instanceof THREE.Vector3
      ? exteriorDeckFloorPosition
      : exteriorDeckFloorPositionFallback;

  if (!storedPlayerState && hasStoredOutsideMap) {
    defaultPlayerPosition.copy(resolvedOperationsExteriorFloorPosition);
    defaultPlayerPosition.y = Number.isFinite(resolvedOperationsExteriorFloorPosition?.y)
      ? Math.max(roomFloorY, resolvedOperationsExteriorFloorPosition.y)
      : roomFloorY;
    playerObject.rotation.y = 0;
  }

  const hangarDeckFloorBounds = createFloorBounds(roomWidth, roomDepth, {
    paddingX: 1,
    paddingZ: 1,
  });
  const resolvedOperationsFloorBounds =
    operationsDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.35, roomDepth * 0.85, {
        paddingX: 0.75,
        paddingZ: 0.75,
      }),
      operationsDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;
  const resolvedOperationsExteriorFloorBounds =
    operationsExteriorFloorBounds ??
    translateBoundsToWorld(
      operationsExteriorLocalBounds,
      operationsExteriorGroupPosition
    ) ??
    hangarDeckFloorBounds;
  const resolvedEngineeringFloorBounds =
    engineeringDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.5, roomDepth * 0.8, {
        paddingX: 0.75,
        paddingZ: 0.75,
      }),
      engineeringDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;

  const resolvedExteriorFloorBounds =
    exteriorDeckFloorBounds ??
    translateBoundsToWorld(
      createFloorBounds(roomWidth * 1.8, roomDepth * 1.15, {
        paddingX: 1.1,
        paddingZ: 1.6,
      }),
      exteriorDeckFloorPositionFallback
    ) ??
    hangarDeckFloorBounds;

  liftState.floors = [
    {
      id: "hangar-deck",
      title: "Command Center",
      description: "Flight line staging",
      position: hangarDeckFloorPosition,
      bounds: hangarDeckFloorBounds,
    },
    {
      id: "operations-concourse",
      title: "Outside Exit",
      description: "External Hatch",
      position: resolvedOperationsFloorPosition,
      yaw: Math.PI,
      bounds: resolvedOperationsFloorBounds,
    },
    {
      id: "operations-exterior",
      title: "Surface Area",
      description: "Outside terrain access",
      position: resolvedOperationsExteriorFloorPosition,
      yaw: 0,
      bounds: resolvedOperationsExteriorFloorBounds,
    },
    {
      id: "engineering-bay",
      title: "Engineering Bay",
      description: "Systems maintenance hub",
      position: resolvedEngineeringFloorPosition,
      yaw: 0,
      bounds: resolvedEngineeringFloorBounds,
    },
    {
      id: "exterior-outpost",
      title: "Exterior Outpost",
      description: "Observation ridge overlook",
      position: resolvedExteriorFloorPosition,
      yaw: 0,
      bounds: resolvedExteriorFloorBounds,
    },
  ];

  const getLiftFloorByIndex = (index) => {
    if (!Array.isArray(liftState.floors) || liftState.floors.length === 0) {
      return null;
    }

    const clampedIndex = THREE.MathUtils.euclideanModulo(
      Number.isInteger(index) ? index : 0,
      liftState.floors.length
    );

    return liftState.floors[clampedIndex] ?? null;
  };

  const getActiveLiftFloor = () => getLiftFloorByIndex(liftState.currentIndex);

  function refreshActiveResourceTargets(targetFloorId) {
    let resolvedFloorId = targetFloorId;

    if (typeof resolvedFloorId === "undefined") {
      const activeFloor = getActiveLiftFloor();
      resolvedFloorId = activeFloor?.id ?? null;
    }

    if (!resolvedFloorId) {
      activeResourceTargets = [];
      activeTerrainTiles = [];
      activeViewDistanceTargets = [];
      return;
    }

    activeResourceTargets = getResourceTargetsForFloor(resolvedFloorId);
    activeTerrainTiles = getTerrainTilesForFloor(resolvedFloorId);
    activeViewDistanceTargets = getViewDistanceTargetsForFloor(resolvedFloorId);
    updateGeoVisorTerrainVisibility({ force: true });
    updateViewDistanceCulling({ force: true });
  }

  const updateActiveDeckEnvironment = (payload) => {
    const activeFloor = getActiveLiftFloor();
    if (!activeFloor?.id) {
      return;
    }

    const environment = deckEnvironmentMap.get(activeFloor.id);
    if (!environment || typeof environment.update !== "function") {
      return;
    }

    try {
      environment.update(payload);
    } catch (error) {
      console.warn("Unable to update active environment", error);
    }
  };

  const findTerrainTileAtPosition = (position) => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)) {
      return null;
    }

    if (!Array.isArray(activeTerrainTiles) || activeTerrainTiles.length === 0) {
      return null;
    }

    const point = new THREE.Vector3(position.x, position.y, position.z);
    const bounds = new THREE.Box3();

    for (const tile of activeTerrainTiles) {
      if (!tile || !tile.isObject3D) {
        continue;
      }

      bounds.setFromObject(tile);
      if (bounds.containsPoint(point)) {
        return tile;
      }
    }

    return null;
  };

  const removeResourceTargetFromFloor = (tile, floorId) => {
    if (!tile || !floorId) {
      return;
    }

    const resourceTargets = resourceTargetsByEnvironment.get(floorId);
    if (!Array.isArray(resourceTargets) || resourceTargets.length === 0) {
      return;
    }

    const nextTargets = resourceTargets.filter((target) => target !== tile);
    resourceTargetsByEnvironment.set(floorId, nextTargets);

    const activeFloor = getActiveLiftFloor();
    if (activeFloor?.id === floorId) {
      activeResourceTargets = nextTargets;
    }
  };

  const setTerrainTileToVoid = (tile) => {
    if (!tile?.userData) {
      return false;
    }

    if (tile.userData.terrainId === "void") {
      return false;
    }

    const voidTerrain = getOutsideTerrainById("void");
    const tileId = getOutsideTerrainDefaultTileId("void");
    const variantIndex = Number.isFinite(tile.userData.tileVariantIndex)
      ? tile.userData.tileVariantIndex
      : 0;
    const baseMaterial =
      getRuntimeTerrainMaterial("void", tileId, variantIndex) ??
      tile.userData.geoVisorConcealedMaterial ??
      tile.material;
    const visorMaterial = getRuntimeGeoVisorMaterial("void", tileId, variantIndex);

    tile.userData.terrainId = "void";
    tile.userData.terrainLabel = voidTerrain?.label ?? "Void";
    tile.userData.tileId = tileId;
    tile.userData.geoVisorRevealedMaterial = baseMaterial;
    tile.userData.geoVisorVisorMaterial = visorMaterial;
    tile.userData.isResourceTarget = false;

    if (geoVisorEnabled) {
      tile.material =
        tile.userData.geoVisorVisorMaterial ??
        tile.userData.geoVisorRevealedMaterial ??
        baseMaterial;
    } else {
      tile.material = baseMaterial;
    }

    const tileIndex = Number.isFinite(tile.userData.tileVariantIndex)
      ? tile.userData.tileVariantIndex
      : null;
    if (Number.isInteger(tileIndex) && tileIndex >= 0) {
      const removedRevealState = geoVisorRevealedTileIndices.delete(tileIndex);
      tile.userData.geoVisorRevealed = false;
      if (removedRevealState) {
        schedulePersistGeoVisorRevealState();
      }
    }
    if (
      Number.isInteger(tileIndex) &&
      storedOutsideMap &&
      Array.isArray(storedOutsideMap.cells)
    ) {
      const currentCell = storedOutsideMap.cells[tileIndex];
      if (
        !currentCell ||
        currentCell.terrainId !== "void" ||
        currentCell.tileId !== tileId
      ) {
        storedOutsideMap.cells[tileIndex] = { terrainId: "void", tileId };
        try {
          storedOutsideMap = saveOutsideMapToStorage(storedOutsideMap);
          hasStoredOutsideMap = true;
        } catch (error) {
          console.warn("Unable to persist outside map terrain update", error);
        }
      }
    }

    return true;
  };

  const setTerrainVoidAtPosition = (position) => {
    const tile = findTerrainTileAtPosition(position);
    if (!tile) {
      return false;
    }

    const updated = setTerrainTileToVoid(tile);
    if (!updated) {
      return false;
    }

    const activeFloor = getActiveLiftFloor();
    if (activeFloor?.id) {
      removeResourceTargetFromFloor(tile, activeFloor.id);
    }

    updateGeoVisorTerrainVisibility({ force: true });
    return true;
  };

  const findLiftFloorIndexById = (floorId) => {
    if (!floorId || !Array.isArray(liftState.floors)) {
      return -1;
    }

    return liftState.floors.findIndex((floor) => floor?.id === floorId);
  };

  const getNextLiftFloor = () => {
    if (!Array.isArray(liftState.floors) || liftState.floors.length <= 1) {
      return null;
    }

    return getLiftFloorByIndex(liftState.currentIndex + 1);
  };

  const getLiftMapName = () => cachedOutsideMapName || resolveOutsideMapName();

  const resolveLiftFloorIndexForPosition = (position) => {
    if (
      !position ||
      !Array.isArray(liftState.floors) ||
      liftState.floors.length === 0
    ) {
      return 0;
    }

    let bestIndex = 0;
    let bestDistance = Infinity;

    liftState.floors.forEach((floor, index) => {
      if (!floor?.position) {
        return;
      }

      const distanceSquared =
        (position.x - floor.position.x) ** 2 +
        (position.z - floor.position.z) ** 2;

      if (distanceSquared < bestDistance) {
        bestDistance = distanceSquared;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  const updateLiftUi = () => {
    if (liftUiControllers.size === 0) {
      return;
    }

    const state = {
      current: getActiveLiftFloor(),
      next: getNextLiftFloor(),
      busy: false,
      mapName: getLiftMapName(),
    };

    liftUiControllers.forEach((controller) => {
      if (controller && typeof controller.updateState === "function") {
        controller.updateState(state);
      }
    });
  };
  notifyLiftUiControllersChanged = () => {
    updateLiftUi();
  };
  playerObject.position.copy(defaultPlayerPosition);

  let initialPitch = DEFAULT_CAMERA_PITCH;

  if (storedPlayerState) {
    playerObject.position.copy(storedPlayerState.position);
    storedOrientationEuler.setFromQuaternion(storedPlayerState.quaternion);
    controls.setYaw(storedOrientationEuler.y);

    const storedPitch = normalizePitchForPersistence(
      storedPlayerState.pitch
    );
    if (storedPitch !== null) {
      initialPitch = storedPitch;
    } else {
      const fallbackPitch = normalizePitchForPersistence(
        storedOrientationEuler.x
      );
      if (fallbackPitch !== null) {
        initialPitch = fallbackPitch;
      }
    }
  } else {
    controls.setYaw(playerObject.rotation.y || 0);
  }

  controls.setPitch(initialPitch);

  liftState.currentIndex = resolveLiftFloorIndexForPosition(
    playerObject.position
  );
  updateLiftUi();

  const initialActiveFloor = getActiveLiftFloor();
  activateDeckEnvironment(initialActiveFloor?.id ?? null);

  let playerGroundedHeight = roomFloorY;

  const applyPlayerHeight = (newHeight, options = {}) => {
    if (!Number.isFinite(newHeight) || newHeight <= 0) {
      return playerHeight;
    }

    const { persist = true } = options;
    const clampedHeight = Math.max(newHeight, MIN_PLAYER_HEIGHT);
    const hasHeightChanged = Math.abs(clampedHeight - playerHeight) >= 0.0001;

    if (hasHeightChanged) {
      playerHeight = clampedHeight;
      playerEyeLevel = playerHeight;
      updateEnvironmentForPlayerHeight();
      updatePlayerReflectionProxyDimensions();
    }

    updateFirstPersonCameraOffset();
    defaultPlayerPosition.y = roomFloorY;
    playerObject.position.y = Math.max(playerObject.position.y, roomFloorY);
    playerGroundedHeight = Math.max(roomFloorY, playerObject.position.y);
    controls.setCameraOffset(firstPersonCameraOffset);

    if (persist) {
      persistPlayerHeight(playerHeight);
    }

    return playerHeight;
  };

  applyPlayerHeight(initialPlayerHeight, { persist: false });
  playerGroundedHeight = Math.max(roomFloorY, playerObject.position.y);

  const playerColliderRadius = 0.35;
  const previousPlayerPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let verticalVelocity = 0;
  let isGrounded = true;
  let jumpRequested = false;
  let pendingExteriorSurfaceSnapFrames = 0;
  const GRAVITY = -9.81;
  const CEILING_CLEARANCE = 0.5;
  const SOFT_CEILING_RANGE = 0.4;

  travelToLiftFloor = (targetIndex, options = {}) => {
    if (!liftInteractionsEnabled) {
      return false;
    }

    if (!Array.isArray(liftState.floors) || liftState.floors.length === 0) {
      return false;
    }

    if (!Number.isInteger(targetIndex)) {
      return false;
    }

    const clampedIndex = THREE.MathUtils.euclideanModulo(
      targetIndex,
      liftState.floors.length
    );

    const currentFloor = getActiveLiftFloor();
    const nextFloor = getLiftFloorByIndex(clampedIndex);

    if (!nextFloor || clampedIndex === liftState.currentIndex) {
      updateLiftUi();
      return false;
    }

    activateDeckEnvironment(nextFloor.id ?? null);

    liftState.currentIndex = clampedIndex;
    refreshActiveResourceTargets(nextFloor.id ?? null);

    let spawnPosition =
      nextFloor.position instanceof THREE.Vector3
        ? nextFloor.position
        : null;
    let spawnYaw = Number.isFinite(nextFloor.yaw) ? nextFloor.yaw : null;

    const destinationEnvironment = nextFloor?.id
      ? deckEnvironmentMap.get(nextFloor.id)
      : null;
    const destinationGroup = destinationEnvironment?.getGroup?.() ?? null;
    if (typeof destinationEnvironment?.update === "function") {
      try {
        // Force one immediate terrain-window refresh before resolving spawn.
        destinationEnvironment.update({
          delta: 0,
          elapsedTime: 0,
          reason: "entry-spawn",
          force: true,
        });
      } catch (error) {
        console.warn("Unable to refresh destination environment for spawn", error);
      }
      refreshActiveResourceTargets(nextFloor.id ?? null);
    }
    const resolvedEntrySpawn =
      typeof destinationGroup?.userData?.resolveEntrySpawn === "function"
        ? destinationGroup.userData.resolveEntrySpawn({
            fromFloorId: currentFloor?.id ?? null,
            reason: options?.reason ?? "direct",
          })
        : null;

    if (resolvedEntrySpawn?.position instanceof THREE.Vector3) {
      spawnPosition = resolvedEntrySpawn.position;
    }

    if (Number.isFinite(resolvedEntrySpawn?.yaw)) {
      spawnYaw = resolvedEntrySpawn.yaw;
    }

    if (
      nextFloor?.id === "operations-exterior" &&
      destinationGroup?.userData?.returnDoor?.isObject3D
    ) {
      pendingExteriorSurfaceSnapFrames = 20;
      const returnDoor = destinationGroup.userData.returnDoor;
      const buildDoorSpawn = () => {
        returnDoor.updateMatrixWorld(true);
        const doorPosition = new THREE.Vector3();
        const doorQuaternion = new THREE.Quaternion();
        returnDoor.getWorldPosition(doorPosition);
        returnDoor.getWorldQuaternion(doorQuaternion);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          doorQuaternion
        );
        const doorWidth = Number.isFinite(returnDoor.userData?.width)
          ? returnDoor.userData.width
          : BASE_DOOR_WIDTH;
        const offsetDistance = Math.max(doorWidth * 0.7, 1.15);
        doorPosition.add(forward.multiplyScalar(offsetDistance));

        return {
          position: doorPosition,
          yaw: Math.atan2(forward.x, forward.z),
        };
      };

      const forcedDoorSpawn = buildDoorSpawn();
      spawnPosition = forcedDoorSpawn.position;
      if (Number.isFinite(forcedDoorSpawn.yaw)) {
        spawnYaw = forcedDoorSpawn.yaw;
      }

      const surfaceSampler =
        destinationGroup.userData?.getSurfaceYAtWorldPosition;
      if (
        spawnPosition instanceof THREE.Vector3 &&
        typeof surfaceSampler === "function"
      ) {
        const sampledSurfaceY = surfaceSampler(spawnPosition.x, spawnPosition.z);
        if (Number.isFinite(sampledSurfaceY)) {
          spawnPosition.y = Math.max(roomFloorY, sampledSurfaceY);
        }
      }
    }

    if (spawnPosition instanceof THREE.Vector3) {
      playerObject.position.set(
        spawnPosition.x,
        Number.isFinite(spawnPosition.y) ? spawnPosition.y : roomFloorY,
        spawnPosition.z
      );
    }

    clampWithinActiveFloor();
    playerGroundedHeight = Math.max(roomFloorY, playerObject.position.y);
    previousPlayerPosition.copy(playerObject.position);

    if (Number.isFinite(spawnYaw)) {
      controls.setYaw(spawnYaw);
    }

    velocity.set(0, 0, 0);
    verticalVelocity = 0;

    updateLiftUi();
    savePlayerState(true);

    if (typeof onLiftTravel === "function") {
      onLiftTravel({
        from: currentFloor || null,
        to: nextFloor,
        reason: options?.reason || "direct",
      });
    }

    return true;
  };

  const snapPlayerToExteriorSurface = () => {
    if (pendingExteriorSurfaceSnapFrames <= 0) {
      return;
    }

    const activeFloorId = getActiveLiftFloor()?.id ?? null;
    if (activeFloorId !== "operations-exterior") {
      pendingExteriorSurfaceSnapFrames = 0;
      return;
    }

    const targetGroundY = getPlayerGroundHeight(playerObject.position);
    if (Number.isFinite(targetGroundY) && playerObject.position.y < targetGroundY) {
      playerObject.position.y = targetGroundY;
      playerGroundedHeight = targetGroundY;
      verticalVelocity = 0;
      isGrounded = true;
    }

    pendingExteriorSurfaceSnapFrames -= 1;
  };

  const updateOperationsConcourseTeleport = (delta) => {
    operationsConcourseTeleportCooldown = Math.max(
      operationsConcourseTeleportCooldown - delta,
      0
    );

    if (!controls.isLocked) {
      return;
    }

    const activeFloor = getActiveLiftFloor();
    if (activeFloor?.id !== "operations-concourse") {
      return;
    }

    if (
      !operationsDeckEnvironment?.isLoaded?.() ||
      typeof travelToLiftFloor !== "function"
    ) {
      return;
    }

    const group = operationsDeckEnvironment.getGroup?.();
    const trigger = group?.userData?.portalTeleportTrigger;

    if (!group || !trigger) {
      return;
    }

    if (operationsConcourseTeleportCooldown > 0) {
      return;
    }

    const destinationId = trigger.destinationFloorId;
    if (!destinationId) {
      return;
    }

    const halfWidth = Number.isFinite(trigger.halfWidth)
      ? trigger.halfWidth
      : null;
    const minY = Number.isFinite(trigger.minY) ? trigger.minY : null;
    const maxY = Number.isFinite(trigger.maxY) ? trigger.maxY : null;
    const localZThreshold = Number.isFinite(trigger.localZThreshold)
      ? trigger.localZThreshold
      : null;

    if (localZThreshold === null) {
      return;
    }

    operationsConcourseTeleportProbe.copy(controls.getObject().position);
    group.worldToLocal(operationsConcourseTeleportProbe);

    const withinX =
      halfWidth === null ||
      Math.abs(operationsConcourseTeleportProbe.x) <= halfWidth;
    const withinY =
      minY === null ||
      maxY === null ||
      (operationsConcourseTeleportProbe.y >= minY &&
        operationsConcourseTeleportProbe.y <= maxY);
    const beyondDoor =
      operationsConcourseTeleportProbe.z <= localZThreshold;

    if (!withinX || !withinY || !beyondDoor) {
      return;
    }

    const destinationIndex = findLiftFloorIndexById(destinationId);
    if (destinationIndex < 0) {
      return;
    }

    if (travelToLiftFloor(destinationIndex, { reason: "portal" })) {
      operationsConcourseTeleportCooldown = 1.2;
    }
  };

  const resolvePlayerCollisions = (previousPosition) => {
    const playerPosition = controls.getObject().position;
    const currentFeetY = playerPosition.y;
    const currentHeadY = currentFeetY + playerHeight;
    const previousFeetY = previousPosition?.y ?? currentFeetY;
    const previousHeadY = previousFeetY + playerHeight;

    const sweptFeetY = Math.min(currentFeetY, previousFeetY);
    const sweptHeadY = Math.max(currentHeadY, previousHeadY);

    const resolveSweptCollision = ({
      minX,
      maxX,
      minZ,
      maxZ,
      previousX,
      previousZ,
      nextX,
      nextZ,
    }) => {
      const deltaX = nextX - previousX;
      const deltaZ = nextZ - previousZ;
      const EPSILON = 1e-4;

      if (
        Math.abs(deltaX) <= EPSILON &&
        Math.abs(deltaZ) <= EPSILON
      ) {
        return false;
      }

      let tMin = 0;
      let tMax = 1;
      let normalX = 0;
      let normalZ = 0;

      if (Math.abs(deltaX) <= EPSILON) {
        if (previousX < minX || previousX > maxX) {
          return false;
        }
      } else {
        const inverseDeltaX = 1 / deltaX;
        let t1 = (minX - previousX) * inverseDeltaX;
        let t2 = (maxX - previousX) * inverseDeltaX;
        let nearNormalX = -Math.sign(deltaX);

        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          nearNormalX = -nearNormalX;
        }

        if (t1 > tMin) {
          tMin = t1;
          normalX = nearNormalX;
          normalZ = 0;
        }

        tMax = Math.min(tMax, t2);

        if (tMin > tMax) {
          return false;
        }
      }

      if (Math.abs(deltaZ) <= EPSILON) {
        if (previousZ < minZ || previousZ > maxZ) {
          return false;
        }
      } else {
        const inverseDeltaZ = 1 / deltaZ;
        let t1 = (minZ - previousZ) * inverseDeltaZ;
        let t2 = (maxZ - previousZ) * inverseDeltaZ;
        let nearNormalZ = -Math.sign(deltaZ);

        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          nearNormalZ = -nearNormalZ;
        }

        if (t1 > tMin) {
          tMin = t1;
          normalX = 0;
          normalZ = nearNormalZ;
        }

        tMax = Math.min(tMax, t2);

        if (tMin > tMax) {
          return false;
        }
      }

      if (tMin < 0 || tMin > 1) {
        return false;
      }

      const safeTravel = Math.max(0, tMin - EPSILON);
      playerPosition.x = previousX + deltaX * safeTravel;
      playerPosition.z = previousZ + deltaZ * safeTravel;

      if (normalX !== 0) {
        velocity.x = 0;
      }
      if (normalZ !== 0) {
        velocity.z = 0;
      }

      return true;
    };

    colliderDescriptors.forEach((descriptor) => {
      const terrainHeight = Number(descriptor?.object?.userData?.terrainHeight);
      if (
        Number.isFinite(terrainHeight) &&
        terrainHeight <= getMaxStepHeight() + 0.1
      ) {
        return;
      }

      const box = descriptor.box;

      if (!box || box.isEmpty()) {
        return;
      }

      if (sweptHeadY <= box.min.y || sweptFeetY >= box.max.y) {
        return;
      }

      const minX = box.min.x - playerColliderRadius;
      const maxX = box.max.x + playerColliderRadius;
      const minZ = box.min.z - playerColliderRadius;
      const maxZ = box.max.z + playerColliderRadius;

      const previousX = previousPosition.x;
      const previousZ = previousPosition.z;
      const nextX = playerPosition.x;
      const nextZ = playerPosition.z;

      const wasInsideExpandedBounds =
        previousX >= minX &&
        previousX <= maxX &&
        previousZ >= minZ &&
        previousZ <= maxZ;
      const isInsideExpandedBounds =
        nextX >= minX &&
        nextX <= maxX &&
        nextZ >= minZ &&
        nextZ <= maxZ;

      if (!wasInsideExpandedBounds && !isInsideExpandedBounds) {
        resolveSweptCollision({
          minX,
          maxX,
          minZ,
          maxZ,
          previousX,
          previousZ,
          nextX,
          nextZ,
        });
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const playerX = playerPosition.x;
        const playerZ = playerPosition.z;

        if (
          playerX < minX ||
          playerX > maxX ||
          playerZ < minZ ||
          playerZ > maxZ
        ) {
          break;
        }

        const overlapLeft = playerX - minX;
        const overlapRight = maxX - playerX;
        const overlapBack = playerZ - minZ;
        const overlapFront = maxZ - playerZ;

        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapZ = Math.min(overlapBack, overlapFront);

        if (minOverlapX < minOverlapZ) {
          if (previousPosition.x <= minX) {
            playerPosition.x = minX;
          } else if (previousPosition.x >= maxX) {
            playerPosition.x = maxX;
          } else if (overlapLeft < overlapRight) {
            playerPosition.x = minX;
          } else {
            playerPosition.x = maxX;
          }

          velocity.x = 0;
        } else {
          if (previousPosition.z <= minZ) {
            playerPosition.z = minZ;
          } else if (previousPosition.z >= maxZ) {
            playerPosition.z = maxZ;
          } else if (overlapBack < overlapFront) {
            playerPosition.z = minZ;
          } else {
            playerPosition.z = maxZ;
          }

          velocity.z = 0;
        }
      }
    });
  };

  const roundPlayerStateValue = (value) =>
    Math.round(value * 10000) / 10000;

  const serializePlayerState = () => {
    const pitch = normalizePitchForPersistence(controls.getPitch());

    return JSON.stringify({
      position: {
        x: roundPlayerStateValue(playerObject.position.x),
        y: roundPlayerStateValue(playerObject.position.y),
        z: roundPlayerStateValue(playerObject.position.z),
      },
      quaternion: {
        x: roundPlayerStateValue(playerObject.quaternion.x),
        y: roundPlayerStateValue(playerObject.quaternion.y),
        z: roundPlayerStateValue(playerObject.quaternion.z),
        w: roundPlayerStateValue(playerObject.quaternion.w),
      },
      pitch: roundPlayerStateValue(
        pitch !== null ? pitch : DEFAULT_CAMERA_PITCH
      ),
    });
  };

  const serializeDroneSceneState = () => {
    if (!droneMinerState.active || !droneMinerState.hasBasePosition) {
      return {
        active: false,
        returning: false,
        mode: "inactive",
        basePosition: null,
        lookDirection: null,
      };
    }

    const basePosition = {
      x: roundPlayerStateValue(droneMinerState.basePosition.x),
      y: roundPlayerStateValue(droneMinerState.basePosition.y),
      z: roundPlayerStateValue(droneMinerState.basePosition.z),
    };

    const lookDirectionLengthSq = droneMinerState.lookDirection.lengthSq();
    const lookDirection =
      Number.isFinite(lookDirectionLengthSq) && lookDirectionLengthSq > 0
        ? {
            x: roundPlayerStateValue(droneMinerState.lookDirection.x),
            y: roundPlayerStateValue(droneMinerState.lookDirection.y),
            z: roundPlayerStateValue(droneMinerState.lookDirection.z),
          }
        : null;

    return {
      active: true,
      returning: Boolean(droneMinerState.returning),
      mode: droneMinerState.returning ? "returning" : "collecting",
      basePosition,
      lookDirection,
    };
  };

  const savePlayerState = (force = false) => {
    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    const serialized = serializePlayerState();
    persistPlayerState(serialized, { force });
    persistDroneSceneState(serializeDroneSceneState(), { force });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== "hidden") {
      return;
    }

    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    persistGeoVisorRevealStateNow(true);
    savePlayerState(true);
  };

  const handleBeforeUnload = () => {
    if (!isPlayerStatePersistenceEnabled) {
      return;
    }

    persistGeoVisorRevealStateNow(true);
    savePlayerState(true);
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  let playerStateSaveAccumulator = 0;

  const manifestPlacementManager = createManifestPlacementManager({
    scene,
    camera,
    controls,
    canvas,
    raycaster,
    colliderDescriptors,
    registerCollidersForImportedRoot,
    unregisterColliderDescriptors,
    rebuildStaticColliders,
    loadModelFromManifestEntry,
    onManifestPlacementHoverChange,
    onManifestEditModeChange,
    onManifestPlacementRemoved,
    getRoomWidth: () => roomWidth,
    getRoomDepth: () => roomDepth,
    getRoomFloorY: () => roomFloorY,
  });

  const {
    setManifestEditModeEnabled,
    isManifestEditModeEnabled,
    placeModelFromManifestEntry,
    hasManifestPlacements,
    getManifestPlacements: getManifestPlacementsFromManager,
    updateManifestEditModeHover,
    updateActivePlacementPreview,
    cancelActivePlacement,
    dispose: disposeManifestPlacements,
  } = manifestPlacementManager;

  getManifestPlacements = getManifestPlacementsFromManager;

  controls.addEventListener("lock", () => {
    resourceToolGroup.visible = true;
    resetResourceToolState();
    unlockTowerRadioAudio();

    if (typeof onControlsLocked === "function") {
      onControlsLocked();
    }
  });

  controls.addEventListener("unlock", () => {
    cancelActiveResourceSession({ reason: "controls-unlocked" });
    resourceToolGroup.visible = false;
    resetResourceToolState();
    stopTowerRadioAudio();

    if (typeof onControlsUnlocked === "function") {
      onControlsUnlocked();
    }

    updateTerminalInteractableState(false);
    updateLiftInteractableState(false);
    setManifestEditModeEnabled(false);
    cancelActivePlacement(new PlacementCancelledError("Pointer lock released"));
  });

  const attemptPointerLock = () => {
    if (!controls.isLocked) {
      canvas.focus();
      controls.lock();
    }
  };

  canvas.addEventListener("click", attemptPointerLock);
  canvas.addEventListener("pointerdown", attemptPointerLock);
  canvas.addEventListener("resource-tool:action", handleResourceToolActionEvent);
  document.addEventListener("mousedown", handlePrimaryActionDown);
  document.addEventListener("mouseup", handlePrimaryActionUp);

  const getTargetedLiftControl = () => {
    if (!liftInteractionsEnabled) {
      return null;
    }

    if (liftInteractables.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      liftInteractables,
      false
    );

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) =>
      candidate.object?.userData?.isLiftControl
    );

    if (
      !intersection ||
      intersection.distance > MAX_LIFT_INTERACTION_DISTANCE
    ) {
      return null;
    }

    return intersection.object;
  };

  const teleportToDoorById = (doorId) => {
    if (!doorId) {
      return false;
    }

    const door = doorMarkersById.get(doorId);
    if (!door) {
      return false;
    }

    door.updateMatrixWorld(true);

    const doorPosition = new THREE.Vector3();
    const doorQuaternion = new THREE.Quaternion();
    door.getWorldPosition(doorPosition);
    door.getWorldQuaternion(doorQuaternion);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(doorQuaternion);
    const doorWidth = Number.isFinite(door.userData?.width)
      ? door.userData.width
      : BASE_DOOR_WIDTH;
    const offsetDistance = Math.max(doorWidth * 0.6, 0.9);
    doorPosition.add(forward.multiplyScalar(offsetDistance));
    doorPosition.y = Math.max(roomFloorY, doorPosition.y);

    playerObject.position.copy(doorPosition);
    clampWithinActiveFloor();
    playerGroundedHeight = Math.max(roomFloorY, playerObject.position.y);
    previousPlayerPosition.copy(playerObject.position);
    velocity.set(0, 0, 0);
    verticalVelocity = 0;

    if (Number.isFinite(forward.x) && Number.isFinite(forward.z)) {
      controls.setYaw(Math.atan2(forward.x, forward.z));
    }

    savePlayerState(true);
    return true;
  };

  const activateLiftControl = (control, { viaKeyboard = false } = {}) => {
    if (!control || !liftInteractionsEnabled) {
      return false;
    }

    const destinationDoorId = control.userData?.doorDestinationId ?? null;
    if (destinationDoorId && teleportToDoorById(destinationDoorId)) {
      return true;
    }

    const destinationId = control.userData?.liftFloorId ?? null;

    if (!destinationId) {
      return false;
    }

    if (!Array.isArray(liftState.floors) || liftState.floors.length === 0) {
      return false;
    }

    const targetIndex = liftState.floors.findIndex(
      (floor) => floor?.id === destinationId
    );

    if (targetIndex < 0) {
      return false;
    }

    if (typeof travelToLiftFloor !== "function" || !liftInteractionsEnabled) {
      return false;
    }

    return travelToLiftFloor(targetIndex, {
      reason: viaKeyboard ? "control-keyboard" : "control-direct",
    });
  };

  const travelToNextLiftFloor = () => {
    if (typeof travelToLiftFloor !== "function") {
      return false;
    }

    if (!Array.isArray(liftState.floors) || liftState.floors.length <= 1) {
      return false;
    }

    const nextIndex = THREE.MathUtils.euclideanModulo(
      liftState.currentIndex + 1,
      liftState.floors.length
    );

    if (nextIndex === liftState.currentIndex) {
      return false;
    }

    return travelToLiftFloor(nextIndex, { reason: "cycle" });
  };

  const getTargetedTerminalZone = () => {
    if (quickAccessInteractables.length === 0) {
      return null;
    }

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersections = raycaster.intersectObjects(
      quickAccessInteractables,
      false
    );

    if (intersections.length === 0) {
      return null;
    }

    const intersection = intersections.find((candidate) => {
      const zonesProviderCandidate =
        candidate.object.userData?.getQuickAccessZones;
      const sizeProviderCandidate =
        candidate.object.userData?.getQuickAccessTextureSize;

      return (
        typeof zonesProviderCandidate === "function" &&
        typeof sizeProviderCandidate === "function"
      );
    });

    if (
      !intersection ||
      intersection.distance > MAX_TERMINAL_INTERACTION_DISTANCE ||
      !intersection.uv
    ) {
      return null;
    }

    const zones = intersection.object.userData.getQuickAccessZones();
    const textureSize =
      intersection.object.userData.getQuickAccessTextureSize();

    if (
      !Array.isArray(zones) ||
      !textureSize ||
      !Number.isFinite(textureSize.width) ||
      !Number.isFinite(textureSize.height)
    ) {
      return null;
    }

    const pixelX = intersection.uv.x * textureSize.width;
    const pixelY = (1 - intersection.uv.y) * textureSize.height;

    const matchedZone = zones.find(
      (zone) =>
        pixelX >= zone.minX &&
        pixelX <= zone.maxX &&
        pixelY >= zone.minY &&
        pixelY <= zone.maxY
    );

    if (!matchedZone) {
      return null;
    }

    return matchedZone;
  };

  const handleCanvasClick = () => {
    if (!controls.isLocked) {
      return;
    }

    const targetedLiftControl = getTargetedLiftControl();
    if (targetedLiftControl) {
      if (activateLiftControl(targetedLiftControl)) {
        return;
      }

      if (typeof onLiftControlInteract === "function") {
        const shouldUnlock = onLiftControlInteract({
          control: targetedLiftControl,
          via: "click",
        });

        if (shouldUnlock !== false && controls.isLocked) {
          controls.unlock();
        }
      }
      return;
    }

    if (quickAccessInteractables.length === 0) {
      return;
    }

    const matchedZone = getTargetedTerminalZone();

    if (!matchedZone) {
      return;
    }

    if (typeof onTerminalOptionSelected === "function") {
      if (controls.isLocked) {
        controls.unlock();
      }
      onTerminalOptionSelected({
        id: matchedZone.id,
        title: matchedZone.title,
        description: matchedZone.description,
      });
    }
  };

  canvas.addEventListener("click", handleCanvasClick);

  const movementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    running: false,
    up: false,
    down: false,
  };

  const BASE_MOVEMENT_ACCELERATION = 20;
  const RUN_SPEED_MULTIPLIER = 1.75;
  const GOD_MODE_VERTICAL_SPEED = 6;

  let movementEnabled = true;

  const terrainGroundRaycaster = new THREE.Raycaster();
  const terrainGroundRayDirection = new THREE.Vector3(0, -1, 0);
  const terrainGroundRayOrigin = new THREE.Vector3();
  const getActiveFloorSurfaceHeight = (position) => {
    if (!position) {
      return null;
    }

    const activeFloorId = getActiveLiftFloor()?.id ?? null;
    if (activeFloorId !== "operations-exterior") {
      return null;
    }

    const activeEnvironment = deckEnvironmentMap.get(activeFloorId);
    const activeGroup = activeEnvironment?.getGroup?.() ?? null;
    const surfaceSampler = activeGroup?.userData?.getSurfaceYAtWorldPosition;
    if (typeof surfaceSampler !== "function") {
      return null;
    }

    const sampledSurfaceY = surfaceSampler(position.x, position.z);
    return Number.isFinite(sampledSurfaceY) ? sampledSurfaceY : null;
  };

  const getTerrainGroundHeight = (position) => {
    if (!position) {
      return null;
    }

    const sampledSurfaceHeight = getActiveFloorSurfaceHeight(position);

    if (!Array.isArray(activeTerrainTiles) || activeTerrainTiles.length === 0) {
      return sampledSurfaceHeight;
    }

    const rayHeight =
      roomHeight + OUTSIDE_HEIGHT_ELEVATION_MAX + playerHeight + 10;
    terrainGroundRayOrigin.set(position.x, roomFloorY + rayHeight, position.z);
    terrainGroundRaycaster.set(terrainGroundRayOrigin, terrainGroundRayDirection);
    terrainGroundRaycaster.far = rayHeight * 2;

    const intersections = terrainGroundRaycaster.intersectObjects(
      activeTerrainTiles,
      true
    );

    if (intersections.length === 0) {
      return sampledSurfaceHeight;
    }

    const intersection =
      intersections.find((candidate) => findTerrainTile(candidate.object)) ??
      intersections[0];

    if (!intersection?.point) {
      return sampledSurfaceHeight;
    }

    const intersectionY = intersection.point.y;
    if (!Number.isFinite(intersectionY)) {
      return sampledSurfaceHeight;
    }

    // Prefer the actual rendered terrain surface when available.
    return intersectionY;
  };

  const getPlayerGroundHeight = (position) => {
    const terrainHeight = getTerrainGroundHeight(position);
    if (!Number.isFinite(terrainHeight)) {
      return roomFloorY;
    }

    return Math.max(roomFloorY, terrainHeight);
  };

  const getPlayerCeilingHeight = (position) => {
    const groundedBase = Number.isFinite(playerGroundedHeight)
      ? playerGroundedHeight
      : getPlayerGroundHeight(position);
    const minY = Math.max(roomFloorY, groundedBase);
    const ceilingScale = Math.max(1, jumpSettings.playerJumpMultiplier);
    const maxHeadY = minY + roomHeight * ceilingScale - CEILING_CLEARANCE;
    return Math.max(minY, maxHeadY - playerHeight);
  };

  const direction = new THREE.Vector3();
  const flyForward = new THREE.Vector3();
  const flyRight = new THREE.Vector3();
  const flyMove = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const clock = new THREE.Clock();
  const setMovementEnabled = (enabled) => {
    movementEnabled = Boolean(enabled);

    if (!movementEnabled) {
      movementState.forward = false;
      movementState.backward = false;
      movementState.left = false;
      movementState.right = false;
      movementState.running = false;
      movementState.up = false;
      movementState.down = false;
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      jumpRequested = false;
      const groundY = getPlayerGroundHeight(playerObject.position);
      if (playerObject.position.y <= groundY) {
        playerObject.position.y = groundY;
        isGrounded = true;
        playerGroundedHeight = groundY;
      }
    }
  };

  const setGodModeEnabled = (enabled) => {
    const nextState = Boolean(enabled);

    if (godModeEnabled === nextState) {
      return godModeEnabled;
    }

    godModeEnabled = nextState;
    verticalVelocity = 0;
    jumpRequested = false;
    movementState.up = false;
    movementState.down = false;

    if (!godModeEnabled) {
      clampWithinActiveFloor(0, null, { skipVerticalClamp: false });
      playerGroundedHeight = getPlayerGroundHeight(playerObject.position);
    }

    return godModeEnabled;
  };

  const updateMovementState = (code, value) => {
    if (!movementEnabled && value) {
      return;
    }

    switch (code) {
      case "ShiftLeft":
      case "ShiftRight":
        movementState.running = value;
        break;
      case "ArrowUp":
      case "KeyW":
        movementState.forward = value;
        break;
      case "ArrowDown":
      case "KeyS":
        movementState.backward = value;
        break;
      case "ArrowLeft":
      case "KeyA":
        movementState.left = value;
        break;
      case "ArrowRight":
      case "KeyD":
        movementState.right = value;
        break;
      case "Space":
        if (godModeEnabled) {
          movementState.up = value;
        }
        break;
      case "ControlLeft":
      case "ControlRight":
        if (godModeEnabled) {
          movementState.down = value;
        }
        break;
      default:
        break;
    }
  };

  const onKeyDown = (event) => {
    if (!movementEnabled) {
      return;
    }

    updateMovementState(event.code, true);

    if (event.code === "Space" && !event.repeat && controls.isLocked) {
      if (!godModeEnabled) {
        jumpRequested = true;
      }
    }

    if (
      !controls.isLocked &&
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "Space",
        "Enter",
      ].includes(event.code)
    ) {
      attemptPointerLock();
    }

    if (
      controls.isLocked &&
      !event.repeat &&
      ["KeyF", "Enter"].includes(event.code)
    ) {
      const targetedLiftControl = getTargetedLiftControl();
      if (!targetedLiftControl) {
        return;
      }

      if (
        activateLiftControl(targetedLiftControl, { viaKeyboard: true })
      ) {
        event.preventDefault();
        return;
      }

      if (travelToNextLiftFloor()) {
        event.preventDefault();
        return;
      }
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event) => {
    updateMovementState(event.code, false);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  function clampWithinActiveFloor(
    delta = 0,
    previousPosition = null,
    options = {}
  ) {
    const player = controls.getObject().position;
    const activeFloor = getLiftFloorByIndex(liftState.currentIndex);
    const activeFloorId =
      typeof activeFloor?.id === "string" ? activeFloor.id : null;
    const activeEnvironment = activeFloorId
      ? deckEnvironmentMap.get(activeFloorId)
      : null;
    const bounds =
      activeEnvironment?.bounds ??
      activeFloor?.bounds ??
      hangarDeckFloorBounds;

    const resolveAxisBounds = (minKey, maxKey) => {
      const fallbackBounds = hangarDeckFloorBounds;
      const minValue = Number.isFinite(bounds?.[minKey])
        ? bounds[minKey]
        : Number.isFinite(fallbackBounds?.[minKey])
        ? fallbackBounds[minKey]
        : null;
      const maxValue = Number.isFinite(bounds?.[maxKey])
        ? bounds[maxKey]
        : Number.isFinite(fallbackBounds?.[maxKey])
        ? fallbackBounds[maxKey]
        : null;

      if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
        return null;
      }

      const min = Math.min(minValue, maxValue);
      const max = Math.max(minValue, maxValue);

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
      }

      return { min, max };
    };

    if (!options.skipHorizontalClamp) {
      const xBounds = resolveAxisBounds("minX", "maxX");
      if (xBounds) {
        player.x = THREE.MathUtils.clamp(player.x, xBounds.min, xBounds.max);
      }

      const zBounds = resolveAxisBounds("minZ", "maxZ");
      if (zBounds) {
        player.z = THREE.MathUtils.clamp(player.z, zBounds.min, zBounds.max);
      }
    }

    if (options.skipVerticalClamp) {
      return;
    }

    const minY = getPlayerGroundHeight(player);
    const maxY = getPlayerCeilingHeight(player);

    if (player.y < minY) {
      const previousGround = previousPosition
        ? getPlayerGroundHeight(previousPosition)
        : null;
      const maxStepHeight = getMaxStepHeight();
      const exceedsStepHeight =
        Number.isFinite(previousGround) &&
        minY - previousGround > maxStepHeight + STEP_HEIGHT_TOLERANCE;
      const isAboveStepHeight =
        Number.isFinite(previousGround) &&
        player.y >= previousGround + maxStepHeight - STEP_HEIGHT_TOLERANCE;

      if (exceedsStepHeight && !isAboveStepHeight) {
        if (previousPosition) {
          player.x = previousPosition.x;
          player.y = previousPosition.y;
          player.z = previousPosition.z;
          velocity.x = 0;
          velocity.z = 0;
        }
        return;
      }

      const climbDistance = minY - player.y;
      const canSmoothClimb = Number.isFinite(delta) && delta > 0;

      if (canSmoothClimb) {
        const climbSpeed = getClimbSpeed(climbDistance);
        const climbStep = Math.min(climbDistance, climbSpeed * delta);
        player.y += climbStep;
      } else {
        player.y = minY;
      }

      if (verticalVelocity < 0) {
        verticalVelocity = 0;
      }

      if (player.y >= minY - 1e-4) {
        player.y = minY;
        isGrounded = true;
        playerGroundedHeight = minY;
      }
    } else if (player.y > maxY) {
      player.y = maxY;
      if (verticalVelocity > 0) {
        verticalVelocity = 0;
      }
    }
  }

  const clampStepHeight = (previousPosition) => {
    if (!previousPosition) {
      return;
    }

    const previousGround = getPlayerGroundHeight(previousPosition);
    const currentGround = getPlayerGroundHeight(playerObject.position);

    if (!Number.isFinite(previousGround) || !Number.isFinite(currentGround)) {
      return;
    }

    if (currentGround - previousGround <= getMaxStepHeight()) {
      return;
    }

    if (playerObject.position.y >= currentGround - STEP_HEIGHT_TOLERANCE) {
      return;
    }

    playerObject.position.x = previousPosition.x;
    playerObject.position.z = previousPosition.z;
    playerObject.position.y = previousPosition.y;
    velocity.x = 0;
    velocity.z = 0;
    clampWithinActiveFloor();
  };

  clampWithinActiveFloor(0, null, {
    skipVerticalClamp: godModeEnabled,
    skipHorizontalClamp: godModeEnabled,
  });

  const updateResourceTool = (delta, elapsedTime) => {
    if (!resourceToolGroup) {
      return;
    }

    if (resourceToolState.cooldown > 0) {
      resourceToolState.cooldown = Math.max(
        0,
        resourceToolState.cooldown - delta
      );
    }

    if (
      resourceToolState.cooldown <= 0 &&
      controls.isLocked &&
      (primaryActionHeld || autoResourceToolEngaged)
    ) {
      cancelScheduledResourceToolResume();
      triggerResourceToolAction();
    }

    if (resourceToolState.beamTimer > 0) {
      resourceToolState.beamTimer = Math.max(
        0,
        resourceToolState.beamTimer - delta
      );
    }

    if (resourceToolState.recoil > 0) {
      resourceToolState.recoil = Math.max(
        0,
        resourceToolState.recoil - delta * RESOURCE_TOOL_RECOIL_RECOVERY
      );
    }

    const actionDuration = resourceToolState.actionDuration;
    const rawBeamProgress =
      Number.isFinite(actionDuration) && actionDuration > 0
        ? resourceToolState.beamTimer / actionDuration
        : 0;
    const beamProgress = THREE.MathUtils.clamp(rawBeamProgress, 0, 1);

    if (resourceToolBeamMaterial) {
      resourceToolBeamMaterial.opacity =
        resourceToolGroup.visible && beamProgress > 0 ? 0.85 * beamProgress : 0;
    }

    if (resourceToolGlowMaterial) {
      const glowOpacity =
        resourceToolGroup.visible && beamProgress > 0 ? 0.75 * beamProgress : 0;
      resourceToolGlowMaterial.opacity = glowOpacity;
      if (resourceToolGlow) {
        const scale = 1 + beamProgress * 0.6;
        resourceToolGlow.scale.set(scale, scale, scale);
      }
    }

    resourceToolLight.intensity = beamProgress * 4;
    resourceToolLight.distance = 1.6 + beamProgress * 2;

    const idleSway = Math.sin(elapsedTime * RESOURCE_TOOL_IDLE_SWAY_SPEED);
    const idleBob = Math.cos(elapsedTime * RESOURCE_TOOL_IDLE_BOB_SPEED);

    resourceToolGroup.position.copy(resourceToolBasePosition);
    resourceToolGroup.position.x += idleSway * RESOURCE_TOOL_IDLE_SWAY * 0.45;
    resourceToolGroup.position.y += idleBob * RESOURCE_TOOL_IDLE_SWAY * 0.6;
    resourceToolGroup.position.z += resourceToolState.recoil * 0.06;

    resourceToolGroup.rotation.set(
      resourceToolBaseRotation.x - resourceToolState.recoil * 0.35 + idleBob * 0.08,
      resourceToolBaseRotation.y + idleSway * 0.25,
      resourceToolBaseRotation.z + idleSway * 0.45
    );
  };

  const animate = () => {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsedTime = clock.elapsedTime;
    let shouldResolveCollisions = false;

    if (controls.isLocked) {
      previousPlayerPosition.copy(playerObject.position);
    }

    if (movementEnabled) {
      if (godModeEnabled && controls.isLocked) {
        const damping = Math.max(0, 1 - 8 * delta);
        velocity.multiplyScalar(damping);

        const forwardInput =
          Number(movementState.forward) - Number(movementState.backward);
        const strafeInput =
          Number(movementState.right) - Number(movementState.left);

        flyMove.set(0, 0, 0);

        if (forwardInput !== 0 || strafeInput !== 0) {
          camera.getWorldDirection(flyForward);
          if (flyForward.lengthSq() > 0) {
            flyForward.normalize();
          }
          flyRight.crossVectors(flyForward, worldUp);
          if (flyRight.lengthSq() > 0) {
            flyRight.normalize();
          }

          flyMove
            .addScaledVector(flyForward, forwardInput)
            .addScaledVector(flyRight, strafeInput);

          if (flyMove.lengthSq() > 0) {
            flyMove.normalize();
          }

          const appliedAcceleration = movementState.running
            ? BASE_MOVEMENT_ACCELERATION * RUN_SPEED_MULTIPLIER
            : BASE_MOVEMENT_ACCELERATION;
          const speedMultiplier = speedSettings.playerSpeedMultiplier;
          const adjustedAcceleration = appliedAcceleration * speedMultiplier;

          velocity.addScaledVector(flyMove, adjustedAcceleration * delta);
        }

        playerObject.position.addScaledVector(velocity, delta);
        currentPlayerHorizontalSpeed = velocity.length();
      } else {
        velocity.x -= velocity.x * 8 * delta;
        velocity.z -= velocity.z * 8 * delta;

        direction.z =
          Number(movementState.forward) - Number(movementState.backward);
        direction.x = Number(movementState.right) - Number(movementState.left);

        if (direction.lengthSq() > 0) {
          direction.normalize();
        }

        const appliedAcceleration = movementState.running
          ? BASE_MOVEMENT_ACCELERATION * RUN_SPEED_MULTIPLIER
          : BASE_MOVEMENT_ACCELERATION;
        const speedMultiplier = speedSettings.playerSpeedMultiplier;
        const adjustedAcceleration = appliedAcceleration * speedMultiplier;

        if (movementState.forward || movementState.backward) {
          velocity.z -= direction.z * adjustedAcceleration * delta;
        }

        if (movementState.left || movementState.right) {
          velocity.x -= direction.x * adjustedAcceleration * delta;
        }

        if (controls.isLocked) {
          controls.moveRight(-velocity.x * delta);
          controls.moveForward(-velocity.z * delta);
        }

        currentPlayerHorizontalSpeed = Math.sqrt(
          velocity.x * velocity.x +
            velocity.z * velocity.z
        );
      }
    } else {
      velocity.set(0, 0, 0);
      currentPlayerHorizontalSpeed = 0;
    }

    if (godModeEnabled && movementEnabled && controls.isLocked) {
      const verticalDirection =
        Number(movementState.up) - Number(movementState.down);

      if (verticalDirection !== 0) {
        const verticalSpeed =
          GOD_MODE_VERTICAL_SPEED * speedSettings.playerSpeedMultiplier;
        playerObject.position.y += verticalDirection * verticalSpeed * delta;
      }
    }

    if (
      !godModeEnabled &&
      movementEnabled &&
      controls.isLocked &&
      jumpRequested &&
      isGrounded
    ) {
      verticalVelocity = getJumpVelocity();
      isGrounded = false;
    }

    jumpRequested = false;
    isGrounded = false;

    if (!godModeEnabled) {
      verticalVelocity += GRAVITY * delta;
      const apexVelocityThreshold = Math.max(
        jumpSettings.jumpApexVelocity,
        getJumpVelocity() * 0.4
      );
      if (
        verticalVelocity > 0 &&
        verticalVelocity < apexVelocityThreshold
      ) {
        const apexBlend = 1 - verticalVelocity / apexVelocityThreshold;
        const smoothingStrength =
          jumpSettings.jumpApexSmoothing * (1 + apexBlend * 2);
        verticalVelocity -=
          verticalVelocity * smoothingStrength * apexBlend * delta;
        verticalVelocity += GRAVITY * apexBlend * 0.45 * delta;
      }
      const maxY = getPlayerCeilingHeight(playerObject.position);
      if (verticalVelocity > 0 && Number.isFinite(maxY)) {
        const distanceToCeiling = maxY - playerObject.position.y;
        if (distanceToCeiling <= 0) {
          verticalVelocity = 0;
        } else if (distanceToCeiling < SOFT_CEILING_RANGE) {
          const scale = distanceToCeiling / SOFT_CEILING_RANGE;
          verticalVelocity *= THREE.MathUtils.clamp(scale, 0, 1);
        }
      }
      playerObject.position.y += verticalVelocity * delta;
    } else {
      verticalVelocity = 0;
    }

    clampWithinActiveFloor(delta, previousPlayerPosition, {
      skipVerticalClamp: godModeEnabled,
      skipHorizontalClamp: godModeEnabled,
    });

    if (
      !godModeEnabled &&
      movementEnabled &&
      controls.isLocked &&
      previousPlayerPosition.distanceToSquared(playerObject.position) > 1e-8
    ) {
      shouldResolveCollisions = true;
    }

    if (shouldResolveCollisions) {
      clampStepHeight(previousPlayerPosition);
      resolvePlayerCollisions(previousPlayerPosition);
    }


    let matchedZone = null;
    let matchedLiftControl = null;

    if (controls.isLocked) {
      if (liftInteractionsEnabled) {
        matchedLiftControl = getTargetedLiftControl();
        updateLiftInteractableState(Boolean(matchedLiftControl));
      } else {
        matchedLiftControl = null;
        updateLiftInteractableState(false);
      }

      matchedZone = getTargetedTerminalZone();
      updateTerminalInteractableState(Boolean(matchedZone));
    } else {
      updateTerminalInteractableState(false);
      updateLiftInteractableState(false);
    }

    const hoveredZoneId = matchedZone?.id ?? null;
    if (hoveredZoneId !== currentMonitorHoveredZoneId) {
      currentMonitorHoveredZoneId = hoveredZoneId;
      const setHoveredZone = monitorScreen?.userData?.setHoveredZone;
      if (typeof setHoveredZone === "function") {
        setHoveredZone(currentMonitorHoveredZoneId);
      }
    }

    const updateDisplayTexture = monitorScreen?.userData?.updateDisplayTexture;
    if (typeof updateDisplayTexture === "function") {
      updateDisplayTexture(delta, clock.elapsedTime);
    }

    playerStateSaveAccumulator += delta;

    if (playerStateSaveAccumulator >= PLAYER_STATE_SAVE_INTERVAL) {
      playerStateSaveAccumulator = 0;
      savePlayerState();
    }

    updateManifestEditModeHover();
    updateActivePlacementPreview();
    updateOperationsConcourseTeleport(delta);
    updateActiveDeckEnvironment({ delta, elapsedTime });
    snapPlayerToExteriorSurface();
    updateResourceTool(delta, elapsedTime);
    updateDroneMiner(delta, elapsedTime);
    updateResourceSessions(delta);
    updateTowerRadioAudio();
    updateTimeOfDay();
    updateStarFieldPositions();
    updateSkyBackdrop();
    updateViewDistanceCulling();
    updateGeoVisorTerrainVisibility();
    updateTerrainDepthTexture();
    updateStarDepthUniforms();

    if (liftIndicatorLights.length) {
      liftIndicatorLights.forEach(({ mesh, light, phase }) => {
        if (!mesh?.material) {
          return;
        }
        const pulse = Math.sin(elapsedTime * 4 + (phase ?? 0));
        const isOn = pulse > 0.1;
        const targetOpacity = isOn ? 0.95 : 0.2;
        mesh.material.opacity = targetOpacity;
        const scale = isOn ? 1.35 : 0.95;
        mesh.scale.setScalar(scale);
        if (light) {
          light.intensity = isOn ? 3.4 : 0.6;
        }
      });
    }

    renderer.render(scene, camera);
  };

  animate();

  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const safeHeight = height > 0 ? height : 1;
    renderer.setSize(width, safeHeight, false);
    camera.aspect = width / safeHeight;
    camera.updateProjectionMatrix();
    if (terrainDepthTarget) {
      const pixelRatio = renderer.getPixelRatio();
      terrainDepthTarget.setSize(
        Math.max(1, Math.round(width * pixelRatio)),
        Math.max(1, Math.round(safeHeight * pixelRatio))
      );
    }

    resizeReflectiveSurfaces();
  };

  window.addEventListener("resize", handleResize);

  return {
    scene,
    camera,
    renderer,
    controls,
    setMovementEnabled,
    getPlayerPosition: () => playerObject?.position?.clone?.() ?? null,
    getPlayerHeight: () => playerHeight,
    setPlayerHeight: (nextHeight, options = {}) =>
      applyPlayerHeight(nextHeight, options),
    setPlayerStatePersistenceEnabled: (enabled = true) => {
      const nextEnabled = Boolean(enabled);
      const previousEnabled = isPlayerStatePersistenceEnabled;

      if (nextEnabled === isPlayerStatePersistenceEnabled) {
        return previousEnabled;
      }

      isPlayerStatePersistenceEnabled = nextEnabled;
      resetPlayerStateCache();
      return previousEnabled;
    },
    placeModelFromManifestEntry,
    setManifestEditModeEnabled,
    isManifestEditModeEnabled,
    hasManifestPlacements,
    getDroneBasePosition: () =>
      droneMinerState.hasBasePosition
        ? droneMinerState.basePosition.clone()
        : null,
    setLiftInteractionsEnabled: (enabled) => setLiftInteractionsEnabled(enabled),
    setStarVisualSettings: (nextSettings) => {
      applyStarSettings(nextSettings ?? {});
    },
    setReflectionSettings: (nextSettings = {}) => {
      const nextEnabled = nextSettings.reflectionsEnabled !== false;
      const nextScale = normalizeReflectorResolutionScale(
        nextSettings.reflectorResolutionScale
      );
      const shouldUpdate =
        nextEnabled !== reflectionSettings.enabled ||
        nextScale !== reflectionSettings.resolutionScale;

      if (!shouldUpdate) {
        return {
          enabled: reflectionSettings.enabled,
          resolutionScale: reflectionSettings.resolutionScale,
        };
      }

      reflectionSettings.enabled = nextEnabled;
      reflectionSettings.resolutionScale = nextScale;
      syncReflectiveSurfaces();
      resizeReflectiveSurfaces();

      return {
        enabled: reflectionSettings.enabled,
        resolutionScale: reflectionSettings.resolutionScale,
      };
    },
    setTimeSettings: (nextSettings = {}) => {
      const nextOffset = normalizeTimeOffset(nextSettings.timeZoneOffsetHours);

      if (nextOffset === timeSettings.gmtOffsetHours) {
        return timeSettings.gmtOffsetHours;
      }

      timeSettings.gmtOffsetHours = nextOffset;
      updateTimeOfDay(true);
      return timeSettings.gmtOffsetHours;
    },
    setSpeedSettings: (nextSettings = {}) => {
      const nextMultiplier = normalizeSpeedMultiplier(
        nextSettings.playerSpeedMultiplier
      );

      if (nextMultiplier === speedSettings.playerSpeedMultiplier) {
        return speedSettings.playerSpeedMultiplier;
      }

      speedSettings.playerSpeedMultiplier = nextMultiplier;
      return speedSettings.playerSpeedMultiplier;
    },
    setGodMode: (enabled = false) => setGodModeEnabled(enabled),
    setGeoVisorEnabled: (enabled = true) => {
      const nextState = Boolean(enabled);

      if (geoVisorEnabled === nextState) {
        return geoVisorEnabled;
      }

      geoVisorEnabled = nextState;
      updateGeoVisorTerrainVisibility({ force: true });
      return geoVisorEnabled;
    },
    runGeoVisorTerrainVisibilityRegressionCheck: () =>
      runGeoVisorTerrainVisibilityRegressionCheck(),
    getTerrainScanTarget: () =>
      findTerrainIntersection({
        allowRevealedBeyondGeoVisorDistance: true,
      }),
    setTerrainVoidAtPosition,
    setJumpSettings: (nextSettings = {}) => {
      const nextMultiplier = normalizeJumpMultiplier(
        nextSettings.playerJumpMultiplier
      );
      const nextApexSmoothing = normalizeJumpApexSmoothing(
        nextSettings.jumpApexSmoothing
      );
      const nextApexVelocity = normalizeJumpApexVelocity(
        nextSettings.jumpApexVelocity
      );

      if (
        nextMultiplier === jumpSettings.playerJumpMultiplier &&
        nextApexSmoothing === jumpSettings.jumpApexSmoothing &&
        nextApexVelocity === jumpSettings.jumpApexVelocity
      ) {
        return jumpSettings.playerJumpMultiplier;
      }

      jumpSettings.playerJumpMultiplier = nextMultiplier;
      jumpSettings.jumpApexSmoothing = nextApexSmoothing;
      jumpSettings.jumpApexVelocity = nextApexVelocity;
      return jumpSettings.playerJumpMultiplier;
    },
    setViewSettings: (nextSettings = {}) => applyViewDistance(nextSettings),
    setStarsEnabled: (enabled) => {
      const nextState = Boolean(enabled);

      if (sceneSettings.showStars === nextState) {
        return;
      }

      sceneSettings.showStars = nextState;
      applyStarVisibility();
    },
    unlockPointerLock: () => {
      if (controls.isLocked) {
        controls.unlock();
        return true;
      }

      return false;
    },
    requestPointerLock: () => {
      attemptPointerLock();
    },
    getLiftFloors: () =>
      liftState.floors.map((floor) => ({
        id: floor.id,
        title: floor.title,
        description: floor.description,
      })),
    getActiveLiftFloor: () => {
      const current = getActiveLiftFloor();
      if (!current) {
        return null;
      }

      return {
        id: current.id,
        title: current.title,
        description: current.description,
      };
    },
    cycleLiftFloor: () => travelToNextLiftFloor(),
    setActiveLiftFloorById: (floorId) => {
      if (!floorId) {
        return false;
      }

      const index = liftState.floors.findIndex(
        (floor) => floor?.id === floorId
      );

      if (index < 0) {
        return false;
      }

      return typeof travelToLiftFloor === "function"
        ? travelToLiftFloor(index, { reason: "external" })
        : false;
    },
    launchDroneMiner: () => launchDroneMiner(),
    cancelDroneMinerSession: (options) => cancelDroneMinerSession(options),
    dispose: () => {
      disposeManifestPlacements();
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", attemptPointerLock);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("pointerdown", attemptPointerLock);
      canvas.removeEventListener(
        "resource-tool:action",
        handleResourceToolActionEvent
      );
      document.removeEventListener("mousedown", handlePrimaryActionDown);
      document.removeEventListener("mouseup", handlePrimaryActionUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cancelScheduledResourceToolResume();
      updateTerminalInteractableState(false);
      updateLiftInteractableState(false);
      if (resourceToolGroup.parent) {
        resourceToolGroup.parent.remove(resourceToolGroup);
      }
      resourceToolGeometries.forEach((geometry) => {
        if (geometry && typeof geometry.dispose === "function") {
          geometry.dispose();
        }
      });
      resourceToolMaterials.forEach((material) => {
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
      });
      resourceToolGeometries.length = 0;
      resourceToolMaterials.length = 0;
      if (droneMinerGroup.parent) {
        droneMinerGroup.parent.remove(droneMinerGroup);
      }
      droneMinerGeometries.forEach((geometry) => {
        if (geometry && typeof geometry.dispose === "function") {
          geometry.dispose();
        }
      });
      droneMinerMaterials.forEach((material) => {
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
      });
      droneMinerGeometries.length = 0;
      droneMinerMaterials.length = 0;
      if (typeof lastUpdatedDisplay.userData?.dispose === "function") {
        lastUpdatedDisplay.userData.dispose();
      }
      if (skyDome.parent) {
        skyDome.parent.remove(skyDome);
      }
      skyDome.geometry?.dispose?.();
      skyDome.material?.map?.dispose?.();
      skyDome.material?.dispose?.();
      if (sunSprite.parent) {
        sunSprite.parent.remove(sunSprite);
      }
      sunSprite.material?.map?.dispose?.();
      sunSprite.material?.dispose?.();
      resourceTargetsByEnvironment.clear();
      terrainTilesByEnvironment.clear();
      activeResourceTargets = [];
      activeTerrainTiles = [];
      registeredStarFields.clear();
      if (geoVisorRevealPersistTimeoutId) {
        window.clearTimeout(geoVisorRevealPersistTimeoutId);
        geoVisorRevealPersistTimeoutId = 0;
      }
      if (isPlayerStatePersistenceEnabled) {
        persistGeoVisorRevealStateNow(true);
      }
      savePlayerState(true);
      activateDeckEnvironment(null);
      colliderDescriptors.length = 0;
    },
  };
};
