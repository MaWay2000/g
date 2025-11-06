import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/OBJLoader.js";

const defaultImportedMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x1f2937),
  roughness: 0.64,
  metalness: 0.18,
});

const cloneImportedMaterial = (material) => {
  if (!material) {
    return defaultImportedMaterial.clone();
  }

  if (Array.isArray(material)) {
    return material.map((entry) => cloneImportedMaterial(entry));
  }

  const cloned = material.clone();

  if (cloned.color?.isColor) {
    cloned.color = cloned.color.clone();
  }

  return cloned;
};

export const prepareImportedObject = (object) => {
  if (!object) {
    return object;
  }

  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
    child.layers.enable(0);
    child.material = cloneImportedMaterial(child.material);
  });

  return object;
};

export const resolveAssetUrl = (path) => {
  if (typeof path !== "string") {
    return null;
  }

  const trimmed = path.trim();

  if (!trimmed) {
    return null;
  }

  const windowHref = typeof window !== "undefined" ? window.location?.href : null;

  if (windowHref) {
    try {
      return new URL(trimmed, windowHref).href;
    } catch (error) {
      // Ignore and fall back to resolving relative to the module URL.
    }
  }

  try {
    return new URL(trimmed, import.meta.url).href;
  } catch (error) {
    return trimmed;
  }
};

const gltfCache = new Map();
const objCache = new Map();

export const loadGLTFModel = async (path) => {
  const resolvedUrl = resolveAssetUrl(path);

  if (!resolvedUrl) {
    throw new Error("Unable to resolve GLTF model path");
  }

  if (!gltfCache.has(resolvedUrl)) {
    const loader = new GLTFLoader();
    gltfCache.set(
      resolvedUrl,
      loader.loadAsync(resolvedUrl).catch((error) => {
        console.error(`Failed to load GLTF model from ${resolvedUrl}`, error);
        gltfCache.delete(resolvedUrl);
        throw error;
      })
    );
  }

  const gltf = await gltfCache.get(resolvedUrl);
  const root = gltf?.scene ? gltf.scene.clone(true) : new THREE.Group();

  return prepareImportedObject(root);
};

export const loadOBJModel = async (path) => {
  const resolvedUrl = resolveAssetUrl(path);

  if (!resolvedUrl) {
    throw new Error("Unable to resolve OBJ model path");
  }

  if (!objCache.has(resolvedUrl)) {
    const loader = new OBJLoader();
    objCache.set(
      resolvedUrl,
      loader.loadAsync(resolvedUrl).catch((error) => {
        console.error(`Failed to load OBJ model from ${resolvedUrl}`, error);
        objCache.delete(resolvedUrl);
        throw error;
      })
    );
  }

  const object = (await objCache.get(resolvedUrl)).clone(true);

  return prepareImportedObject(object);
};

const resolveManifestModelPath = (rawPath) => {
  if (typeof rawPath !== "string") {
    return null;
  }

  const trimmed = rawPath.trim();

  if (trimmed === "") {
    return null;
  }

  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `./models/${trimmed}`;
};

export const loadModelFromManifestEntry = async (entry) => {
  const resolvedPath = resolveManifestModelPath(entry?.path);

  if (!resolvedPath) {
    throw new Error("Invalid model manifest entry path");
  }

  const extensionMatch = resolvedPath.match(/\.([a-z0-9]+)$/i);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "";

  if (extension === "gltf" || extension === "glb") {
    return loadGLTFModel(resolvedPath);
  }

  if (extension === "obj") {
    return loadOBJModel(resolvedPath);
  }

  throw new Error(`Unsupported model format for path: ${resolvedPath}`);
};
