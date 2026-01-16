import * as THREE from "./three.module.js";
import { loadPieGeometry } from "./pie.js";
import { STRUCTURE_TURRETS } from "./structure_turrets.js";
export async function buildStructureGroup(def, rotation, sizeX, sizeY, scaleOverride = null, opacityOverride = null) {
  if (!def.pies || !def.pies.length) {
    const fallback = new THREE.Group();
    fallback.add(new THREE.Mesh(
      new THREE.BoxGeometry(sizeX || 1, 0.6, sizeY || 1),
      new THREE.MeshPhongMaterial({ color: 0x8888ff, opacity: 0.9, transparent: true })
    ));
    return fallback;
  }
  const basePieFiles = def.pies;
  const baseGeos = await Promise.all(basePieFiles.map(file => loadPieGeometry(file).then(g => g.clone())));
  let scale;
  let blockCenters = [];
  let blockHeights = [];
  let yOffset = 0;
  let baseMeshes = [];
  {
    let bbox = (baseGeos[0].computeBoundingBox(), baseGeos[0].boundingBox);
    let width = bbox.max.x - bbox.min.x;
    let depth = bbox.max.z - bbox.min.z;
    if (scaleOverride !== null) {
      scale = scaleOverride;
    } else if (sizeX && sizeY) {
      let sX = width !== 0 ? (sizeX / width) : 1;
      let sZ = depth !== 0 ? (sizeY / depth) : 1;
      scale = Math.min(sX, sZ);
      if (!isFinite(scale) || scale <= 0) scale = 1;
    } else {
      let maxDim = Math.max(width, bbox.max.y - bbox.min.y, depth);
      if (maxDim === 0) maxDim = 1;
      scale = 1.5 / maxDim;
    }
  }
  for (let i = 0; i < baseGeos.length; ++i) {
    let geo = baseGeos[i];
    geo.scale(scale, scale, scale);
    geo.computeBoundingBox();
    let bbox = geo.boundingBox;
    let cX = (bbox.min.x + bbox.max.x) / 2;
    let cY = (bbox.min.y + bbox.max.y) / 2;
    let cZ = (bbox.min.z + bbox.max.z) / 2;
    let h = bbox.max.y - bbox.min.y;
    blockCenters[i] = { cX, cY, cZ };
    blockHeights[i] = h;
    let mat;
    if (geo.userData && geo.userData.textureName) {
      const texLoader = new THREE.TextureLoader();
      const texName = geo.userData.textureName.toLowerCase();
      const tex = texLoader.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName, undefined, undefined, () => {});
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      mat = new THREE.MeshLambertMaterial({ map: tex, transparent: opacityOverride !== null, opacity: (opacityOverride != null ? opacityOverride : 1) });
    } else {
      mat = new THREE.MeshLambertMaterial({ color: 0xc8c8c8, transparent: opacityOverride !== null, opacity: (opacityOverride != null ? opacityOverride : 1) });
    }
    let mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-cX, yOffset - cY, -cZ);
    mesh.rotation.y = rotation * Math.PI / 2;
    baseMeshes.push(mesh);
    if (i < baseGeos.length - 1) {
      yOffset += h;
    }
  }
  const group = new THREE.Group();
  baseMeshes.forEach(mesh => group.add(mesh));
  const topIdx = baseGeos.length - 1;
  const topGeo = baseGeos[topIdx];
  const topC = blockCenters[topIdx];
  let connectorPos = null;
  if (topGeo.userData && topGeo.userData.connectors && topGeo.userData.connectors.length) {
    let bc = topGeo.userData.connectors[0];
    connectorPos = {
      x: bc.x * scale - topC.cX,
      y: bc.y * scale - topC.cY,
      z: bc.z * scale - topC.cZ
    };
  }
  const attachments = STRUCTURE_TURRETS[def.id];
  if (attachments && attachments.length && connectorPos) {
    let gunYOffset = blockHeights.slice(0, topIdx).reduce((a, b) => a + b, 0);
    const attGeo = await loadPieGeometry(attachments[0]).then(g => g.clone());
    attGeo.scale(scale, scale, scale);
    attGeo.computeBoundingBox();
    let tb = attGeo.boundingBox;
    let tcX = (tb.min.x + tb.max.x) / 2;
    let tcY = (tb.min.y + tb.max.y) / 2;
    let tcZ = (tb.min.z + tb.max.z) / 2;
    let tMat;
    if (attGeo.userData && attGeo.userData.textureName) {
      const texLoader2 = new THREE.TextureLoader();
      const texName2 = attGeo.userData.textureName.toLowerCase();
      const tex2 = texLoader2.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName2, undefined, undefined, () => {});
      tex2.magFilter = THREE.NearestFilter;
      tex2.minFilter = THREE.LinearMipMapLinearFilter;
      tMat = new THREE.MeshLambertMaterial({ map: tex2, transparent: opacityOverride !== null, opacity: (opacityOverride != null ? opacityOverride : 1) });
    } else {
      tMat = new THREE.MeshLambertMaterial({ color: 0xff0000, transparent: opacityOverride !== null, opacity: (opacityOverride != null ? opacityOverride : 1) });
    }
    let tMesh = new THREE.Mesh(attGeo, tMat);
    tMesh.rotation.y = rotation * Math.PI / 2;
const turretBottomOffset = tb.min.y;
tMesh.position.set(
  connectorPos.x - tcX,
  gunYOffset + connectorPos.y - turretBottomOffset,
  connectorPos.z - tcZ
);
    group.add(tMesh);
  }
group.updateMatrixWorld(true);
const bbox = new THREE.Box3().setFromObject(group);
const minY = bbox.min.y;
group.userData.minY = minY;
if (minY !== 0) {
  group.position.y -= minY;
}
  // Expose base block center for placement calculations
  group.userData.centerX = blockCenters[0].cX;
  group.userData.centerY = blockCenters[0].cY;
  group.userData.centerZ = blockCenters[0].cZ;
  // Precompute bounding sphere for culling
  const __sphere = new THREE.Sphere();
  bbox.getBoundingSphere(__sphere);
  group.userData.boundingSphere = __sphere;
  group.userData.cullable = true;
  group.userData.structureId = def.id;
  return group;
}
