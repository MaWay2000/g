import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

export const colliderDescriptors = [];

export const registerColliderDescriptors = (descriptors) => {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return [];
  }

  const registeredDescriptors = [];

  descriptors.forEach((descriptor) => {
    if (!descriptor || !descriptor.object) {
      return;
    }

    const padding = descriptor.padding ? descriptor.padding.clone() : undefined;

    const providedBox =
      descriptor.box instanceof THREE.Box3 ? descriptor.box.clone() : null;

    const autoUpdate = !providedBox;
    const box = providedBox ?? new THREE.Box3();

    if (providedBox && padding) {
      box.min.sub(padding);
      box.max.add(padding);
    }

    const registeredDescriptor = {
      object: descriptor.object,
      padding: autoUpdate ? padding : undefined,
      box,
      autoUpdate,
    };

    if (descriptor.root) {
      registeredDescriptor.root = descriptor.root;
    }

    colliderDescriptors.push(registeredDescriptor);
    registeredDescriptors.push(registeredDescriptor);
  });

  return registeredDescriptors;
};

export const unregisterColliderDescriptors = (descriptors) => {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return;
  }

  const descriptorSet = new Set(descriptors);

  for (let index = colliderDescriptors.length - 1; index >= 0; index -= 1) {
    const descriptor = colliderDescriptors[index];

    if (!descriptorSet.has(descriptor)) {
      continue;
    }

    colliderDescriptors.splice(index, 1);
  }
};

export const rebuildStaticColliders = () => {
  colliderDescriptors.forEach((descriptor) => {
    const { object, padding, box, autoUpdate } = descriptor;

    if (!object || !box) {
      return;
    }

    if (autoUpdate) {
      object.updateWorldMatrix(true, false);
      box.setFromObject(object);

      if (padding) {
        box.min.sub(padding);
        box.max.add(padding);
      }
    }
  });
};

export const registerCollidersForImportedRoot = (root, { padding } = {}) => {
  if (!root) {
    return [];
  }

  const paddingVector =
    padding instanceof THREE.Vector3 && padding.lengthSq() > 0
      ? padding.clone()
      : null;

  root.updateMatrixWorld(true);

  const descriptors = [];

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(child);

    if (bounds.isEmpty()) {
      return;
    }

    const descriptor = { object: child, root };

    if (paddingVector) {
      descriptor.padding = paddingVector.clone();
    }

    descriptors.push(descriptor);
  });

  if (descriptors.length === 0) {
    return [];
  }

  return registerColliderDescriptors(descriptors);
};
