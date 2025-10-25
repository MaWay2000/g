import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { GLTFExporter } from "https://unpkg.com/three@0.160.0/examples/jsm/exporters/GLTFExporter.js";

const canvas = document.getElementById("editorCanvas");
const dropZone = document.querySelector("[data-dropzone]");
const fileInput = document.querySelector("[data-file-input]");
const sampleSelect = document.querySelector("[data-sample-select]");
const resetButton = document.querySelector("[data-reset-scene]");
const transformButtonsContainer = document.querySelector("[data-transform-buttons]");
const primitiveContainer = document.querySelector("[data-create-primitive-container]");
const colorInput = document.querySelector("[data-color-input]");
const metalnessInput = document.querySelector("[data-metalness-input]");
const roughnessInput = document.querySelector("[data-roughness-input]");
const swatchButtons = Array.from(
  document.querySelectorAll("[data-material-swatches] button")
);
const saveSessionButton = document.querySelector("[data-save-session]");
const restoreSessionButton = document.querySelector("[data-restore-session]");
const clearSessionButton = document.querySelector("[data-clear-session]");
const exportButton = document.querySelector("[data-export-gltf]");
const statusBadge = document.querySelector("[data-status-badge]");
const hudModel = document.querySelector("[data-hud-model]");
const hudInfo = document.querySelector("[data-hud-info]");
const panelButtons = Array.from(
  document.querySelectorAll("[data-panel-target]")
);
const panelSections = Array.from(document.querySelectorAll("[data-panel]"));

let activePanelId =
  panelButtons.find((button) => button.dataset.active === "true")?.dataset
    .panelTarget ?? panelButtons[0]?.dataset.panelTarget ?? null;

if (!activePanelId && panelSections[0]) {
  activePanelId = panelSections[0].id;
}

function updatePanelVisibility({ focusActive = false } = {}) {
  panelButtons.forEach((button) => {
    const isActive = button.dataset.panelTarget === activePanelId;
    button.dataset.active = String(isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
    if (isActive && focusActive) {
      button.focus();
    }
  });

  panelSections.forEach((section) => {
    const isActive = section.id === activePanelId;
    section.dataset.active = String(isActive);
    section.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
}

function setActivePanel(panelId, options = {}) {
  if (!panelId || panelId === activePanelId) {
    return;
  }

  activePanelId = panelId;
  updatePanelVisibility(options);
}

function focusAdjacentPanel(offset) {
  if (!panelButtons.length) {
    return;
  }

  const currentIndex = panelButtons.findIndex(
    (button) => button.dataset.panelTarget === activePanelId
  );
  const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    (fallbackIndex + offset + panelButtons.length) % panelButtons.length;
  const nextButton = panelButtons[nextIndex];
  if (nextButton) {
    setActivePanel(nextButton.dataset.panelTarget, { focusActive: true });
  }
}

panelButtons.forEach((button) => {
  button.setAttribute(
    "aria-selected",
    button.dataset.active === "true" ? "true" : "false"
  );
  button.setAttribute("tabindex", button.dataset.active === "true" ? "0" : "-1");
  button.addEventListener("click", () => {
    setActivePanel(button.dataset.panelTarget, { focusActive: false });
  });

  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAdjacentPanel(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAdjacentPanel(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstButton = panelButtons[0];
      if (firstButton) {
        setActivePanel(firstButton.dataset.panelTarget, { focusActive: true });
      }
    } else if (event.key === "End") {
      event.preventDefault();
      const lastButton = panelButtons[panelButtons.length - 1];
      if (lastButton) {
        setActivePanel(lastButton.dataset.panelTarget, { focusActive: true });
      }
    } else if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar" ||
      event.key === "Space"
    ) {
      event.preventDefault();
      setActivePanel(button.dataset.panelTarget, { focusActive: false });
    }
  });
});

updatePanelVisibility();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1120");

const sceneRoot = new THREE.Group();
sceneRoot.name = "EditableScene";
scene.add(sceneRoot);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(6, 4, 8);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.screenSpacePanning = false;
orbitControls.maxDistance = 200;
orbitControls.minDistance = 0.25;

const navigationState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const navigationKeyMap = new Map([
  ["w", "forward"],
  ["s", "backward"],
  ["a", "left"],
  ["d", "right"],
]);

const worldUp = new THREE.Vector3(0, 1, 0);
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const movementVector = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const POINTER_CLICK_THRESHOLD = 5;
let pointerDownInfo = null;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(1.1);
transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
  isTransformDragging = event.value;
  if (event.value) {
    transformHasChanged = false;
  } else if (transformHasChanged) {
    transformHasChanged = false;
    pushHistorySnapshot();
  }
});
transformControls.addEventListener("change", () => {
  updateHud(currentSelection);
});
transformControls.addEventListener("objectChange", () => {
  transformHasChanged = true;
});
scene.add(transformControls);

const gridHelper = new THREE.GridHelper(40, 40, 0x334155, 0x1e293b);
gridHelper.position.y = -0.001;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(1.5);
axesHelper.position.y = 0.001;
scene.add(axesHelper);

const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.55);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
keyLight.position.set(5, 10, 7);
keyLight.castShadow = true;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.3);
rimLight.position.set(-6, 8, -4);
scene.add(rimLight);

const loaders = {
  gltf: new GLTFLoader(),
  glb: new GLTFLoader(),
  obj: new OBJLoader(),
  fbx: new FBXLoader(),
  stl: new STLLoader(),
};

const mtlLoader = new MTLLoader();

const gltfExporter = new GLTFExporter();

let currentSelection = null;
const selectedObjects = new Set();
let editableMeshes = [];
let activeTransformMode = "translate";
let transformHasChanged = false;
let isTransformDragging = false;

const STORAGE_KEY = "model-editor-session-v1";

const HISTORY_LIMIT = 50;
const historyState = {
  undoStack: [],
  redoStack: [],
  lastSignature: null,
};
let historyDebounceHandle = null;
let isRestoringHistory = false;

function extractMtllibReference(objText) {
  if (!objText) {
    return null;
  }

  const pattern = /^[ \t]*mtllib[ \t]+(.+?)\s*$/gim;
  let match;
  while ((match = pattern.exec(objText))) {
    const rawValue = match[1]?.trim();
    if (!rawValue) {
      continue;
    }
    const commentIndex = rawValue.indexOf("#");
    const cleaned = (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

function normalizeReferencePath(value) {
  return value.replace(/\\/g, "/");
}

function getCandidateFileMapKeys(reference) {
  const normalized = normalizeReferencePath(reference).toLowerCase();
  const candidates = new Set([normalized]);
  if (normalized.startsWith("./")) {
    candidates.add(normalized.slice(2));
  }
  const filename = normalized.split("/").pop();
  if (filename) {
    candidates.add(filename);
  }
  return Array.from(candidates);
}

async function readFileLikeAsText(fileLike) {
  if (!fileLike) {
    return null;
  }

  if (typeof fileLike.text === "function") {
    return await fileLike.text();
  }

  if (typeof FileReader === "undefined") {
    return null;
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(fileLike);
  });
}

async function loadMaterialsForObj({ objText, fileMap, sourceUrl }) {
  const mtllibReference = extractMtllibReference(objText);
  if (!mtllibReference) {
    return null;
  }

  const normalizedReference = normalizeReferencePath(mtllibReference);
  const candidateKeys = fileMap ? getCandidateFileMapKeys(normalizedReference) : [];
  let materialsText = null;
  let materialPath = "./";

  if (fileMap && fileMap.size) {
    for (const key of candidateKeys) {
      const fileEntry = fileMap.get(key);
      if (!fileEntry) {
        continue;
      }
      try {
        materialsText = await readFileLikeAsText(fileEntry);
      } catch (error) {
        console.warn(`Failed to read MTL file from upload: ${normalizedReference}`, error);
      }
      if (materialsText) {
        const slashIndex = normalizedReference.lastIndexOf("/");
        if (slashIndex !== -1) {
          materialPath = normalizedReference.slice(0, slashIndex + 1);
        }
        break;
      }
    }
  }

  if (!materialsText && sourceUrl) {
    try {
      const baseUrl = new URL(sourceUrl, window.location.href);
      const resolvedUrl = new URL(normalizedReference, baseUrl);
      const response = await fetch(resolvedUrl.href);
      if (response.ok) {
        materialsText = await response.text();
        materialPath = new URL("./", resolvedUrl).href;
      } else {
        console.warn(
          `Failed to fetch MTL file: ${resolvedUrl.href} (status ${response.status})`
        );
      }
    } catch (error) {
      console.warn(`Failed to fetch MTL file: ${normalizedReference}`, error);
    }
  }

  if (!materialsText) {
    return null;
  }

  try {
    const materials = mtlLoader.parse(materialsText, materialPath);
    materials.preload();
    return materials;
  } catch (error) {
    console.warn(`Failed to parse MTL file: ${normalizedReference}`, error);
    return null;
  }
}

function cancelScheduledHistoryCommit() {
  if (historyDebounceHandle) {
    clearTimeout(historyDebounceHandle);
    historyDebounceHandle = null;
  }
}

function clearHistoryTracking() {
  cancelScheduledHistoryCommit();
  historyState.undoStack = [];
  historyState.redoStack = [];
  historyState.lastSignature = null;
}

function flushHistoryCommit() {
  if (isRestoringHistory) {
    cancelScheduledHistoryCommit();
    return;
  }
  if (!historyDebounceHandle) {
    return;
  }
  clearTimeout(historyDebounceHandle);
  historyDebounceHandle = null;
  pushHistorySnapshot();
}

function captureSceneSnapshot() {
  const objectJSON = sceneRoot.toJSON();
  const material = currentSelection
    ? {
        color: colorInput?.value ?? "#ffffff",
        metalness: Number.parseFloat(metalnessInput?.value ?? "0") || 0,
        roughness: Number.parseFloat(roughnessInput?.value ?? "1") || 1,
      }
    : null;

  const selectionUUID = currentSelection?.uuid ?? null;
  const snapshot = {
    objectJSON,
    selectionUUID,
    material,
    signature: JSON.stringify({
      object: objectJSON,
      selectionUUID,
      material,
    }),
  };

  return snapshot;
}

function resetHistoryTracking() {
  if (isRestoringHistory) {
    return;
  }
  clearHistoryTracking();
  const snapshot = captureSceneSnapshot();
  if (snapshot) {
    historyState.undoStack.push(snapshot);
    historyState.lastSignature = snapshot.signature;
  }
}

function pushHistorySnapshot() {
  if (isRestoringHistory) {
    return;
  }
  const snapshot = captureSceneSnapshot();
  if (!snapshot) {
    return;
  }
  if (snapshot.signature === historyState.lastSignature) {
    return;
  }

  historyState.undoStack.push(snapshot);
  if (historyState.undoStack.length > HISTORY_LIMIT) {
    historyState.undoStack.shift();
  }
  historyState.lastSignature = snapshot.signature;
  historyState.redoStack = [];
}

function scheduleHistoryCommit() {
  if (isRestoringHistory) {
    return;
  }
  cancelScheduledHistoryCommit();
  historyDebounceHandle = setTimeout(() => {
    historyDebounceHandle = null;
    pushHistorySnapshot();
  }, 250);
}

function applySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  isRestoringHistory = true;
  cancelScheduledHistoryCommit();
  try {
    const loader = new THREE.ObjectLoader();
    const restoredRoot = loader.parse(snapshot.objectJSON);

    sceneRoot.clear();
    sceneRoot.position.copy(restoredRoot.position);
    sceneRoot.quaternion.copy(restoredRoot.quaternion);
    sceneRoot.scale.copy(restoredRoot.scale);
    while (restoredRoot.children.length) {
      const child = restoredRoot.children[0];
      sceneRoot.add(child);
    }

    const selection = snapshot.selectionUUID
      ? sceneRoot.getObjectByProperty("uuid", snapshot.selectionUUID)
      : null;

    if (selection) {
      const sourceName = selection.userData?.sourceName ?? "Imported model";
      setCurrentSelection(selection, sourceName, { focus: false, addToScene: false });
    } else {
      setCurrentSelection(null, undefined, { focus: false });
    }

    transformControls.setTranslationSnap(null);
    transformControls.setRotationSnap(null);
    transformControls.setScaleSnap(null);

    if (snapshot.material && currentSelection) {
      const { color, metalness, roughness } = snapshot.material;
      if (colorInput && color) {
        colorInput.value = color;
      }
      if (metalnessInput && typeof metalness === "number") {
        metalnessInput.value = metalness.toString();
      }
      if (roughnessInput && typeof roughness === "number") {
        roughnessInput.value = roughness.toString();
      }
    }

    syncMaterialInputs();
  } finally {
    isRestoringHistory = false;
  }
}

function undoLastChange() {
  flushHistoryCommit();
  if (historyState.undoStack.length <= 1) {
    return;
  }
  const current = historyState.undoStack.pop();
  historyState.redoStack.push(current);
  const previous = historyState.undoStack[historyState.undoStack.length - 1];
  applySnapshot(previous);
  historyState.lastSignature = previous.signature;
  setStatus("ready", "Undo applied");
}

function redoLastChange() {
  flushHistoryCommit();
  if (!historyState.redoStack.length) {
    return;
  }
  const snapshot = historyState.redoStack.pop();
  historyState.undoStack.push(snapshot);
  applySnapshot(snapshot);
  historyState.lastSignature = snapshot.signature;
  setStatus("ready", "Redo applied");
}

function resizeRendererToDisplaySize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function updateCameraNavigation(delta) {
  if (!orbitControls.enabled) {
    return;
  }

  const { forward, backward, left, right } = navigationState;
  if (!forward && !backward && !left && !right) {
    return;
  }

  cameraForward.set(0, 0, 0);
  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;

  if (cameraForward.lengthSq() < 1e-6) {
    return;
  }

  cameraForward.normalize();
  cameraRight.copy(cameraForward).cross(worldUp).normalize();

  if (cameraRight.lengthSq() < 1e-6) {
    cameraRight.set(1, 0, 0);
  }

  movementVector.set(0, 0, 0);

  if (forward) {
    movementVector.add(cameraForward);
  }
  if (backward) {
    movementVector.sub(cameraForward);
  }
  if (left) {
    movementVector.sub(cameraRight);
  }
  if (right) {
    movementVector.add(cameraRight);
  }

  if (movementVector.lengthSq() < 1e-6) {
    return;
  }

  movementVector.normalize();
  const distance = camera.position.distanceTo(orbitControls.target);
  const speed = Math.max(distance * 0.6, 0.5);
  const moveDistance = speed * delta;

  movementVector.multiplyScalar(moveDistance);
  camera.position.add(movementVector);
  orbitControls.target.add(movementVector);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  resizeRendererToDisplaySize();
  updateCameraNavigation(delta);
  orbitControls.update();
  renderer.render(scene, camera);
}

animate();

function setStatus(state, message) {
  const badgeState = state === "error" ? "error" : state;
  statusBadge.dataset.state = badgeState;
  if (state === "loading") {
    statusBadge.textContent = "Loading";
  } else if (state === "ready") {
    statusBadge.textContent = "Ready";
  } else if (state === "error") {
    statusBadge.textContent = "Error";
  } else {
    statusBadge.textContent = "Idle";
  }

  if (message) {
    hudModel.textContent = message;
  }
}

function resetHud() {
  hudModel.textContent = "Drop a model to begin.";
  hudInfo.textContent = "";
  setStatus("idle");
}

function ensureStandardMaterial(material) {
  if (!material) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      metalness: 0.2,
      roughness: 0.8,
    });
  }

  if (Array.isArray(material)) {
    return material.map((mat) => ensureStandardMaterial(mat));
  }

  if (material.isMeshStandardMaterial) {
    return material;
  }

  const params = {
    color: material.color ? material.color.clone() : new THREE.Color("#ffffff"),
    map: material.map ?? null,
    metalness:
      typeof material.metalness === "number" ? material.metalness : 0.2,
    roughness:
      typeof material.roughness === "number" ? material.roughness : 0.8,
    transparent: material.transparent ?? false,
    opacity: material.opacity ?? 1,
    side: material.side ?? THREE.FrontSide,
  };

  const standardMaterial = new THREE.MeshStandardMaterial(params);
  if (material.map) {
    standardMaterial.map = material.map;
  }

  if (material.emissive) {
    standardMaterial.emissive = material.emissive.clone();
    standardMaterial.emissiveIntensity = material.emissiveIntensity ?? 1;
  }

  material.dispose?.();
  return standardMaterial;
}

function collectEditableMeshes(object3D) {
  const meshes = [];
  object3D.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = ensureStandardMaterial(child.material);
      if (child.geometry) {
        child.geometry.computeVertexNormals();
      }
      meshes.push(child);
    }
  });
  return meshes;
}

function collectEditableMeshesForSelection(selectionSet) {
  const seen = new Set();
  const meshes = [];
  selectionSet.forEach((object3D) => {
    if (!object3D) {
      return;
    }
    const collected = collectEditableMeshes(object3D);
    collected.forEach((mesh) => {
      if (!seen.has(mesh.uuid)) {
        seen.add(mesh.uuid);
        meshes.push(mesh);
      }
    });
  });
  return meshes;
}

const primitiveFactories = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(1, 1, 1, 1),
};

const primitiveDisplayNames = {
  box: "Box",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
};

function createPrimitiveMesh(shape) {
  const geometryFactory = primitiveFactories[shape];
  if (!geometryFactory) {
    return null;
  }

  const geometry = geometryFactory();
  const material = new THREE.MeshStandardMaterial({
    color: colorInput?.value ?? "#ffffff",
    metalness: Number.parseFloat(metalnessInput?.value ?? "0") || 0,
    roughness: Number.parseFloat(roughnessInput?.value ?? "1") || 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (shape === "plane") {
    mesh.rotation.x = -Math.PI / 2;
  }

  centerObject(mesh);

  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  const offset = new THREE.Vector3(
    (Math.random() - 0.5) * 4,
    size.y / 2,
    (Math.random() - 0.5) * 4
  );
  mesh.position.add(offset);

  return mesh;
}

function centerObject(object3D) {
  const box = new THREE.Box3().setFromObject(object3D);
  const center = box.getCenter(new THREE.Vector3());
  object3D.position.sub(center);
}

function focusObject(object3D) {
  if (!object3D) {
    return;
  }

  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance =
    maxSize /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.5;

  const direction = new THREE.Vector3(1, 0.75, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  orbitControls.target.copy(center);
  orbitControls.update();
}

function updateHud(object3D) {
  if (!object3D) {
    resetHud();
    return;
  }

  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  let vertexCount = 0;
  let drawCallCount = 0;
  object3D.traverse((child) => {
    if (child.isMesh && child.geometry) {
      drawCallCount += 1;
      const positionAttr = child.geometry.getAttribute("position");
      if (positionAttr) {
        vertexCount += positionAttr.count;
      }
    }
  });

  const sizeText = `Size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(
    2
  )}`;
  const centerText = `Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(
    2
  )})`;
  const countsText = `Vertices: ${vertexCount.toLocaleString()} · Draw calls: ${drawCallCount}`;

  hudInfo.textContent = `${sizeText}\n${centerText}\n${countsText}`;
}

function setMaterialControlsEnabled(enabled) {
  colorInput.disabled = !enabled;
  metalnessInput.disabled = !enabled;
  roughnessInput.disabled = !enabled;
  swatchButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function syncMaterialInputs() {
  if (!editableMeshes.length) {
    setMaterialControlsEnabled(false);
    colorInput.value = "#ffffff";
    metalnessInput.value = "0";
    roughnessInput.value = "1";
    return;
  }

  setMaterialControlsEnabled(true);
  const firstMesh = editableMeshes[0];
  const material = Array.isArray(firstMesh.material)
    ? firstMesh.material[0]
    : firstMesh.material;
  if (material && material.color) {
    colorInput.value = `#${material.color.getHexString()}`;
  }
  if (typeof material?.metalness === "number") {
    metalnessInput.value = material.metalness.toString();
  }
  if (typeof material?.roughness === "number") {
    roughnessInput.value = material.roughness.toString();
  }
}

function applyMaterialProperty(property, value) {
  editableMeshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((mat) => {
      if (!mat) {
        return;
      }
      if (property === "color") {
        mat.color.set(value);
      } else {
        mat[property] = value;
      }
      mat.needsUpdate = true;
    });
  });
  updateHud(currentSelection);
  if (!isRestoringHistory) {
    scheduleHistoryCommit();
  }
}

function findSceneObjectFromChild(child) {
  let current = child;
  while (current && current.parent && current.parent !== sceneRoot) {
    current = current.parent;
  }
  if (!current) {
    return null;
  }
  return current.parent === sceneRoot ? current : null;
}

function pickSceneObject(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((clientY - rect.top) / rect.height) * 2 + 1;
  pointerNDC.set(normalizedX, normalizedY);
  raycaster.setFromCamera(pointerNDC, camera);
  const intersections = raycaster.intersectObjects(sceneRoot.children, true);
  for (const hit of intersections) {
    const candidate = findSceneObjectFromChild(hit.object);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function handlePointerDown(event) {
  if (event.button !== 0) {
    pointerDownInfo = null;
    return;
  }
  pointerDownInfo = {
    x: event.clientX,
    y: event.clientY,
    active: event.target === renderer.domElement,
  };
}

function handlePointerUp(event) {
  if (event.button !== 0) {
    pointerDownInfo = null;
    return;
  }
  if (!pointerDownInfo || !pointerDownInfo.active) {
    pointerDownInfo = null;
    return;
  }

  const { x, y } = pointerDownInfo;
  pointerDownInfo = null;

  if (isTransformDragging) {
    return;
  }

  const movement = Math.hypot(event.clientX - x, event.clientY - y);
  if (movement > POINTER_CLICK_THRESHOLD) {
    return;
  }

  const picked = pickSceneObject(event.clientX, event.clientY);
  if (picked) {
    const sourceName = picked.userData?.sourceName ?? "Scene object";
    const multiSelect = event.ctrlKey || event.metaKey;
    if (multiSelect) {
      toggleSelection(picked, sourceName);
    } else {
      setCurrentSelection(picked, sourceName, {
        focus: false,
        addToScene: false,
      });
    }
  } else if (!event.ctrlKey && !event.metaKey && selectedObjects.size) {
    setCurrentSelection(null, undefined, { focus: false });
  }
}

function setCurrentSelection(
  object3D,
  sourceName = "Imported model",
  { focus = true, addToScene = true, append = false } = {}
) {
  cancelScheduledHistoryCommit();
  transformHasChanged = false;

  if (!append && currentSelection && currentSelection !== object3D) {
    transformControls.detach();
  }

  if (!object3D) {
    currentSelection = null;
    selectedObjects.clear();
    editableMeshes = [];
    syncMaterialInputs();
    if (sceneRoot.children.length) {
      hudModel.textContent = "No object selected.";
      hudInfo.textContent = "";
      setStatus("idle", "No selection");
    } else {
      resetHud();
      setStatus("idle", "No selection");
    }
    return;
  }

  if (addToScene && object3D.parent !== sceneRoot) {
    sceneRoot.add(object3D);
  }

  if (!append) {
    selectedObjects.clear();
  }

  selectedObjects.add(object3D);

  if (append && currentSelection && currentSelection !== object3D) {
    transformControls.detach();
  }

  currentSelection = object3D;
  currentSelection.userData.sourceName = sourceName;
  editableMeshes = collectEditableMeshesForSelection(selectedObjects);
  transformControls.attach(currentSelection);
  setTransformMode(activeTransformMode);
  const selectionCount = selectedObjects.size;
  const statusMessage =
    selectionCount > 1
      ? `Selected ${selectionCount} objects (active: ${sourceName})`
      : `Selected: ${sourceName}`;
  setStatus("ready", statusMessage);
  syncMaterialInputs();
  if (focus) {
    focusObject(currentSelection);
  }
  updateHud(currentSelection);
}

function toggleSelection(object3D, sourceName, options = {}) {
  if (!object3D) {
    return;
  }

  if (selectedObjects.has(object3D)) {
    selectedObjects.delete(object3D);
    if (!selectedObjects.size) {
      setCurrentSelection(null, undefined, { focus: false });
      return;
    }

    const nextActive = Array.from(selectedObjects).pop();
    const nextName = nextActive.userData?.sourceName ?? "Scene object";
    setCurrentSelection(nextActive, nextName, {
      focus: false,
      addToScene: false,
      append: true,
      ...options,
    });
    return;
  }

  setCurrentSelection(object3D, sourceName, {
    focus: false,
    addToScene: false,
    append: true,
    ...options,
  });
}

function deleteSelectedObjects() {
  if (!selectedObjects.size) {
    return;
  }

  const toRemove = Array.from(selectedObjects);
  toRemove.forEach((object3D) => {
    object3D?.removeFromParent?.();
  });

  const count = toRemove.length;
  setCurrentSelection(null, undefined, { focus: false });
  hudInfo.textContent = "";
  setStatus(
    "ready",
    `Deleted ${count} object${count === 1 ? "" : "s"}`
  );
  pushHistorySnapshot();
}

function clearScene() {
  flushHistoryCommit();
  transformControls.detach();
  currentSelection = null;
  selectedObjects.clear();
  editableMeshes = [];
  sceneRoot.clear();
  syncMaterialInputs();
  resetHud();
  transformHasChanged = false;
  setStatus("idle", "Scene cleared");
  if (!isRestoringHistory) {
    pushHistorySnapshot();
  }
}

function getExtensionFromName(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function parseGLTF(content, name) {
  return new Promise((resolve, reject) => {
    loaders.gltf.parse(content, "", resolve, (error) => {
      console.error(`Failed to parse GLTF ${name}`, error);
      reject(error);
    });
  });
}

function configureGLTFFileMap(fileMap) {
  if (!fileMap || !fileMap.size) {
    return () => {};
  }

  const manager = loaders.gltf.manager;
  if (!manager || typeof manager.setURLModifier !== "function") {
    return () => {};
  }

  const previousModifier = manager.urlModifier ?? null;
  const objectURLCache = new Map();

  manager.setURLModifier((url) => {
    if (typeof url !== "string") {
      return previousModifier ? previousModifier(url) : url;
    }

    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }

    const decodedURL = decodeURI(url);
    const sanitized = decodedURL.split(/[?#]/)[0];
    const normalized = sanitized.replace(/^\.\//, "").replace(/^\//, "");
    const lowerFullPath = normalized.toLowerCase();
    const lowerFileName = lowerFullPath.split("/").pop();

    const matchKey = fileMap.has(lowerFullPath)
      ? lowerFullPath
      : lowerFileName && fileMap.has(lowerFileName)
      ? lowerFileName
      : null;

    if (matchKey) {
      if (!objectURLCache.has(matchKey)) {
        const file = fileMap.get(matchKey);
        objectURLCache.set(matchKey, URL.createObjectURL(file));
      }
      return objectURLCache.get(matchKey);
    }

    return previousModifier ? previousModifier(url) : url;
  });

  return () => {
    if (previousModifier) {
      manager.setURLModifier(previousModifier);
    } else {
      manager.setURLModifier(undefined);
    }
    objectURLCache.forEach((objectURL) => {
      URL.revokeObjectURL(objectURL);
    });
    objectURLCache.clear();
  };
}

function parseGLB(arrayBuffer, name) {
  return new Promise((resolve, reject) => {
    loaders.glb.parse(arrayBuffer, "", resolve, (error) => {
      console.error(`Failed to parse GLB ${name}`, error);
      reject(error);
    });
  });
}

async function loadModelFromData({ name, extension, arrayBuffer, text, url, fileMap }) {
  setStatus("loading", `Loading ${name}…`);
  try {
    let imported = null;
    if (extension === "gltf") {
      const restoreModifier = configureGLTFFileMap(fileMap);
      try {
        if (url) {
          const gltf = await loaders.gltf.loadAsync(url);
          imported = gltf.scene || gltf.scenes?.[0];
        } else if (arrayBuffer) {
          const textContent = new TextDecoder().decode(arrayBuffer);
          const gltf = await parseGLTF(textContent, name);
          imported = gltf.scene || gltf.scenes?.[0];
        } else if (text) {
          const gltf = await parseGLTF(text, name);
          imported = gltf.scene || gltf.scenes?.[0];
        }
      } finally {
        restoreModifier();
      }
    } else if (extension === "glb") {
      if (url) {
        const gltf = await loaders.glb.loadAsync(url);
        imported = gltf.scene || gltf.scenes?.[0];
      } else {
        const gltf = await parseGLB(arrayBuffer, name);
        imported = gltf.scene || gltf.scenes?.[0];
      }
    } else if (extension === "obj") {
      let data = text;
      if (!data && arrayBuffer) {
        data = new TextDecoder().decode(arrayBuffer);
      }
      if (!data && url) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch OBJ file: ${response.status}`);
        }
        data = await response.text();
      }
      if (!data) {
        throw new Error("OBJ data unavailable");
      }

      const materials = await loadMaterialsForObj({
        objText: data,
        fileMap,
        sourceUrl: url,
      });

      try {
        if (materials) {
          loaders.obj.setMaterials(materials);
        }
        imported = loaders.obj.parse(data);
      } finally {
        loaders.obj.setMaterials(null);
      }
    } else if (extension === "fbx") {
      const buffer = arrayBuffer ?? (await fetch(url).then((res) => res.arrayBuffer()));
      imported = loaders.fbx.parse(buffer, name);
    } else if (extension === "stl") {
      const buffer = arrayBuffer ?? (await fetch(url).then((res) => res.arrayBuffer()));
      const geometry = loaders.stl.parse(buffer);
      imported = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.1, roughness: 0.8 })
      );
    } else {
      throw new Error(`Unsupported file type: ${extension}`);
    }

    if (!imported) {
      throw new Error("Unable to import model");
    }

    centerObject(imported);
    setCurrentSelection(imported, name);
    pushHistorySnapshot();
  } catch (error) {
    console.error("Unable to load model", error);
    setStatus("error", `Failed to load ${name}`);
    hudInfo.textContent = error?.message ?? "Check the browser console for details.";
  }
}

function handleFileList(files) {
  if (!files || !files.length) {
    return;
  }

  const fileArray = Array.from(files);
  const fileMap = new Map();

  fileArray.forEach((entry) => {
    const lowerName = entry.name.toLowerCase();
    if (!fileMap.has(lowerName)) {
      fileMap.set(lowerName, entry);
    }
    if (entry.webkitRelativePath) {
      const relativePath = entry.webkitRelativePath.toLowerCase();
      if (relativePath && !fileMap.has(relativePath)) {
        fileMap.set(relativePath, entry);
      }
      const relativeName = relativePath.split("/").pop();
      if (relativeName && !fileMap.has(relativeName)) {
        fileMap.set(relativeName, entry);
      }
    }
  });

  const primaryFile =
    fileArray.find((entry) => {
      const ext = getExtensionFromName(entry.name);
      return ["gltf", "glb", "obj", "fbx", "stl"].includes(ext);
    }) ?? fileArray[0];

  if (!primaryFile) {
    return;
  }

  const extension = getExtensionFromName(primaryFile.name);
  const reader = new FileReader();

  if (extension === "gltf") {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        text: reader.result,
        fileMap,
      });
    };
    reader.readAsText(primaryFile);
  } else if (["glb", "fbx", "stl"].includes(extension)) {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        arrayBuffer: reader.result,
        fileMap,
      });
    };
    reader.readAsArrayBuffer(primaryFile);
  } else if (extension === "obj") {
    reader.onload = () => {
      loadModelFromData({
        name: primaryFile.name,
        extension,
        text: reader.result,
        fileMap,
      });
    };
    reader.readAsText(primaryFile);
  } else {
    setStatus("error", "Unsupported file type");
    hudInfo.textContent = `Supported formats: GLTF/GLB, OBJ, FBX, STL.`;
  }
}

fileInput?.addEventListener("change", (event) => {
  const files = event.target.files;
  handleFileList(files);
  fileInput.value = "";
});

dropZone?.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.dataset.state = "drag";
});

dropZone?.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone?.addEventListener("dragleave", () => {
  dropZone.dataset.state = "idle";
});

dropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.dataset.state = "idle";
  const files = event.dataTransfer?.files;
  handleFileList(files);
});

sampleSelect?.addEventListener("change", async (event) => {
  const value = event.target.value;
  if (!value) {
    return;
  }
  const name = value.split("/").pop();
  const extension = getExtensionFromName(name);
  await loadModelFromData({ name, extension, url: value });
  sampleSelect.value = "";
});

primitiveContainer?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-create-shape]");
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const shape = button.dataset.createShape;
  const mesh = createPrimitiveMesh(shape);
  if (!mesh) {
    return;
  }

  const displayName = primitiveDisplayNames[shape] ?? "Primitive";
  setCurrentSelection(mesh, `${displayName} primitive`, { focus: true });
  pushHistorySnapshot();
});

resetButton?.addEventListener("click", () => {
  clearScene();
});

function setTransformMode(mode) {
  activeTransformMode = mode;
  transformControls.setMode(mode);
  if (!transformButtonsContainer) {
    return;
  }
  Array.from(transformButtonsContainer.querySelectorAll("button")).forEach(
    (button) => {
      button.dataset.active = button.dataset.mode === mode ? "true" : "false";
    }
  );
}

transformButtonsContainer?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }
  const mode = button.dataset.mode;
  setTransformMode(mode);
});

renderer.domElement?.addEventListener("pointerdown", handlePointerDown);
window.addEventListener("pointerup", handlePointerUp);

function isEditableTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  if (!tagName) {
    return false;
  }

  const normalized = tagName.toLowerCase();
  return normalized === "input" || normalized === "textarea" || normalized === "select";
}

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  const modifierActive = event.metaKey || event.ctrlKey;

  if (modifierActive && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoLastChange();
    } else {
      undoLastChange();
    }
    return;
  }

  if (modifierActive && key === "y") {
    event.preventDefault();
    redoLastChange();
    return;
  }

  const navigationKey = navigationKeyMap.get(key);
  if (navigationKey) {
    navigationState[navigationKey] = true;
    event.preventDefault();
  }

  if (key === "f") {
    focusObject(currentSelection);
  }

  if (key === "delete" || key === "backspace") {
    if (selectedObjects.size) {
      event.preventDefault();
      deleteSelectedObjects();
    }
    return;
  }

  if (!currentSelection) {
    return;
  }

  if (key === "g") {
    setTransformMode("translate");
  } else if (key === "r") {
    setTransformMode("rotate");
  } else if (key === "s") {
    setTransformMode("scale");
  }
});

window.addEventListener("keyup", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  const navigationKey = navigationKeyMap.get(key);
  if (navigationKey) {
    navigationState[navigationKey] = false;
    event.preventDefault();
  }
});

window.addEventListener("blur", () => {
  Object.keys(navigationState).forEach((stateKey) => {
    navigationState[stateKey] = false;
  });
});

colorInput?.addEventListener("input", (event) => {
  applyMaterialProperty("color", event.target.value);
});

metalnessInput?.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  applyMaterialProperty("metalness", THREE.MathUtils.clamp(value, 0, 1));
});

roughnessInput?.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  applyMaterialProperty("roughness", THREE.MathUtils.clamp(value, 0, 1));
});

swatchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.color;
    if (!color) {
      return;
    }
    colorInput.value = color;
    applyMaterialProperty("color", color);
  });
});

function saveSession() {
  if (!sceneRoot.children.length) {
    setStatus("error", "No scene to save");
    hudInfo.textContent = "Add a model before saving a session.";
    return;
  }
  try {
    const snapshot = captureSceneSnapshot();
    const sessionData = {
      version: 3,
      selectionUUID: snapshot.selectionUUID,
      material: snapshot.material,
      objectJSON: snapshot.objectJSON,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    setStatus("ready", "Session saved locally");
  } catch (error) {
    console.error("Unable to save session", error);
    setStatus("error", "Failed to save session");
    hudInfo.textContent = error?.message ?? "Local storage is unavailable.";
  }
}

function restoreSession() {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      setStatus("error", "No saved session found");
      hudInfo.textContent = "Save a session before trying to restore.";
      return;
    }

    const parsed = JSON.parse(serialized);
    const loader = new THREE.ObjectLoader();
    let snapshot;

    const version = parsed.version ?? 1;

    if (version === 1) {
      const restored = loader.parse(parsed.objectJSON);
      restored.userData.sourceName = parsed.sourceName ?? "Restored model";
      const tempRoot = new THREE.Group();
      tempRoot.add(restored);
      snapshot = {
        objectJSON: tempRoot.toJSON(),
        selectionUUID: restored.uuid,
        material: parsed.material ?? null,
        signature: null,
      };
    } else {
      snapshot = {
        objectJSON: parsed.objectJSON,
        selectionUUID: parsed.selectionUUID ?? null,
        material: parsed.material ?? null,
        signature: null,
      };
    }

    applySnapshot(snapshot);
    resetHistoryTracking();
    setStatus("ready", "Session restored");
  } catch (error) {
    console.error("Unable to restore session", error);
    setStatus("error", "Failed to restore session");
    hudInfo.textContent = error?.message ?? "Corrupted session data.";
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  setStatus("idle", "Saved session cleared");
  hudInfo.textContent = "";
}

function exportScene() {
  if (!sceneRoot.children.length) {
    setStatus("error", "No scene to export");
    hudInfo.textContent = "Add a model before exporting.";
    return;
  }

  setStatus("loading", "Exporting scene…");
  gltfExporter.parse(
    sceneRoot,
    (result) => {
      const blob = new Blob([result], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const activeName = currentSelection?.userData?.sourceName;
      const safeName = (activeName || "scene")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/gi, "")
        .toLowerCase();
      anchor.href = url;
      anchor.download = `${safeName || "scene"}.glb`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("ready", "Export complete");
    },
    (error) => {
      console.error("Failed to export GLB", error);
      setStatus("error", "Export failed");
      hudInfo.textContent = error?.message ?? "Could not export the current scene.";
    },
    { binary: true }
  );
}

saveSessionButton?.addEventListener("click", saveSession);
restoreSessionButton?.addEventListener("click", restoreSession);
clearSessionButton?.addEventListener("click", clearSession);
exportButton?.addEventListener("click", exportScene);

setTransformMode("translate");

resetHud();
resetHistoryTracking();

// Restore automatically on load if a session is available
try {
  const existingSession = localStorage.getItem(STORAGE_KEY);
  if (existingSession) {
    restoreSession();
  }
} catch (error) {
  console.warn("Unable to access storage", error);
}
