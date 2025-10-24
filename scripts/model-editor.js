import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/STLLoader.js";
import { GLTFExporter } from "https://unpkg.com/three@0.160.0/examples/jsm/exporters/GLTFExporter.js";

const canvas = document.getElementById("editorCanvas");
const dropZone = document.querySelector("[data-dropzone]");
const fileInput = document.querySelector("[data-file-input]");
const sampleSelect = document.querySelector("[data-sample-select]");
const resetButton = document.querySelector("[data-reset-scene]");
const transformButtonsContainer = document.querySelector("[data-transform-buttons]");
const toggleSnappingButton = document.querySelector("[data-toggle-snapping]");
const focusSelectionButton = document.querySelector("[data-focus-selection]");
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

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1120");

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.position.set(6, 4, 8);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.screenSpacePanning = false;
orbitControls.maxDistance = 200;
orbitControls.minDistance = 0.25;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(1.1);
transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
});
transformControls.addEventListener("change", () => {
  updateHud(currentSelection);
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

const gltfExporter = new GLTFExporter();

let currentSelection = null;
let editableMeshes = [];
let snapEnabled = false;
let activeTransformMode = "translate";

const STORAGE_KEY = "model-editor-session-v1";

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

function animate() {
  requestAnimationFrame(animate);
  resizeRendererToDisplaySize();
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
}

function setCurrentSelection(object3D, sourceName = "Imported model") {
  if (currentSelection) {
    transformControls.detach();
    scene.remove(currentSelection);
  }

  currentSelection = object3D;
  if (!currentSelection) {
    editableMeshes = [];
    resetHud();
    return;
  }

  currentSelection.userData.sourceName = sourceName;
  scene.add(currentSelection);
  editableMeshes = collectEditableMeshes(currentSelection);
  transformControls.attach(currentSelection);
  setTransformMode(activeTransformMode);
  setStatus("ready", `Model: ${sourceName}`);
  syncMaterialInputs();
  focusObject(currentSelection);
  updateHud(currentSelection);
}

function clearSelection() {
  if (currentSelection) {
    transformControls.detach();
    scene.remove(currentSelection);
    currentSelection = null;
    editableMeshes = [];
  }
  resetHud();
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
      const data = text ?? new TextDecoder().decode(arrayBuffer);
      imported = loaders.obj.parse(data);
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

resetButton?.addEventListener("click", () => {
  clearSelection();
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

toggleSnappingButton?.addEventListener("click", () => {
  snapEnabled = !snapEnabled;
  transformControls.setTranslationSnap(snapEnabled ? 0.25 : null);
  transformControls.setRotationSnap(
    snapEnabled ? THREE.MathUtils.degToRad(15) : null
  );
  transformControls.setScaleSnap(snapEnabled ? 0.1 : null);
  toggleSnappingButton.dataset.active = snapEnabled ? "true" : "false";
  toggleSnappingButton.textContent = snapEnabled
    ? "Snapping: On"
    : "Snapping: Off";
});

focusSelectionButton?.addEventListener("click", () => {
  focusObject(currentSelection);
});

window.addEventListener("keydown", (event) => {
  if (!currentSelection) {
    return;
  }
  if (event.key.toLowerCase() === "g") {
    setTransformMode("translate");
  } else if (event.key.toLowerCase() === "r") {
    setTransformMode("rotate");
  } else if (event.key.toLowerCase() === "s") {
    setTransformMode("scale");
  } else if (event.key.toLowerCase() === "f") {
    focusObject(currentSelection);
  }
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
  if (!currentSelection) {
    setStatus("error", "No selection to save");
    hudInfo.textContent = "Import a model before saving a session.";
    return;
  }
  try {
    const sessionData = {
      version: 1,
      sourceName: currentSelection.userData.sourceName ?? "Imported model",
      snapEnabled,
      material: {
        color: colorInput.value,
        metalness: Number.parseFloat(metalnessInput.value),
        roughness: Number.parseFloat(roughnessInput.value),
      },
      objectJSON: currentSelection.toJSON(),
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
    const restored = loader.parse(parsed.objectJSON);
    setCurrentSelection(restored, parsed.sourceName ?? "Restored model");
    snapEnabled = Boolean(parsed.snapEnabled);
    transformControls.setTranslationSnap(snapEnabled ? 0.25 : null);
    transformControls.setRotationSnap(
      snapEnabled ? THREE.MathUtils.degToRad(15) : null
    );
    transformControls.setScaleSnap(snapEnabled ? 0.1 : null);
    toggleSnappingButton.textContent = snapEnabled
      ? "Snapping: On"
      : "Snapping: Off";
    toggleSnappingButton.dataset.active = snapEnabled ? "true" : "false";
    if (parsed.material) {
      const { color, metalness, roughness } = parsed.material;
      if (color) {
        colorInput.value = color;
        applyMaterialProperty("color", color);
      }
      if (typeof metalness === "number") {
        metalnessInput.value = metalness.toString();
        applyMaterialProperty("metalness", metalness);
      }
      if (typeof roughness === "number") {
        roughnessInput.value = roughness.toString();
        applyMaterialProperty("roughness", roughness);
      }
    }
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

function exportCurrentSelection() {
  if (!currentSelection) {
    setStatus("error", "No selection to export");
    hudInfo.textContent = "Import a model before exporting.";
    return;
  }

  setStatus("loading", "Exporting selection…");
  gltfExporter.parse(
    currentSelection,
    (result) => {
      const blob = new Blob([result], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName = (currentSelection.userData.sourceName || "model")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/gi, "")
        .toLowerCase();
      anchor.href = url;
      anchor.download = `${safeName || "model"}.glb`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("ready", "Export complete");
    },
    (error) => {
      console.error("Failed to export GLB", error);
      setStatus("error", "Export failed");
      hudInfo.textContent = error?.message ?? "Could not export the current model.";
    },
    { binary: true }
  );
}

saveSessionButton?.addEventListener("click", saveSession);
restoreSessionButton?.addEventListener("click", restoreSession);
clearSessionButton?.addEventListener("click", clearSession);
exportButton?.addEventListener("click", exportCurrentSelection);

setTransformMode("translate");
if (toggleSnappingButton) {
  toggleSnappingButton.textContent = "Snapping: Off";
  toggleSnappingButton.dataset.active = "false";
}

resetHud();

// Restore automatically on load if a session is available
try {
  const existingSession = localStorage.getItem(STORAGE_KEY);
  if (existingSession) {
    restoreSession();
  }
} catch (error) {
  console.warn("Unable to access storage", error);
}
