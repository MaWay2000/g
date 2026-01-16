import * as THREE from './three.module.js';
let showPanelIdsCheckbox;
import { TILESETS, getTileCount, loadAllTiles, clearTileCache } from './tileset.js';
import { parseMapGrid, getTilesetIndexFromTtp } from './maploader.js';
import { cameraState, resetCameraTarget, setupKeyboard } from './camera.js';
import { parsePie, loadPieGeometry } from "./pie.js";
import { buildStructureGroup } from "./structureGroup.js";

const tilesetSelect = document.getElementById('tilesetSelect');
const fileListDiv = document.getElementById('fileList');
const infoDiv = document.getElementById('info');
const mapFilenameSpan = document.getElementById('mapFilename');
const uiBar = document.getElementById('uiBar');
const threeContainer = document.getElementById('threeContainer');
const overlayMsg = document.getElementById('overlayMsg');
const overlayText = document.getElementById('overlayText');
function setOverlayText(msg){
  if (overlayText) { overlayText.textContent = msg; }
  else if (overlayMsg) { overlayMsg.textContent = msg; }
}
function showOverlay(msg){
  // If a message is provided, show it; otherwise hide the text block and only show the button
  if (typeof msg === 'string' && msg.length > 0) {
    setOverlayText(msg);
    if (overlayText) overlayText.style.display = 'block';
  } else {
    if (overlayText) overlayText.style.display = 'none';
  }
  if (overlayMsg) overlayMsg.style.display = 'flex';
}
// ensure single showOverlay
window.showOverlay = showOverlay;
function hideOverlay(){
  if (overlayMsg) overlayMsg.style.display = 'none';
}
// ensure single hideOverlay
window.hideOverlay = hideOverlay;
// ---- Configurable assets base paths (root defaults) ----
if (typeof window !== 'undefined') {
  if (typeof window.STRUCTURES_JSON === 'undefined') window.STRUCTURES_JSON = 'structure.json';
  if (typeof window.PIES_BASE === 'undefined') window.PIES_BASE = 'pies/';
  if (typeof window.TEX_BASE === 'undefined') window.TEX_BASE = 'classic/texpages/texpages/';
}
// ---------------------------------------------------------

const showTileIdCheckbox = document.getElementById('showTileId');
const showHeightCheckbox = document.getElementById('showHeight');
// Tile types on 3D map toggle
const showTileTypesOnMapCheckbox = document.getElementById('showTileTypesOnMap');
// New: top-level map toggle for tile-type dots
const showTileTypesCheckbox = document.getElementById('showTileTypes');
showPanelIdsCheckbox = document.getElementById('showPanelIds');
if (showPanelIdsCheckbox) {
  showPanelIdsCheckbox.addEventListener('change', () => {
    if (typeof renderTexturePalette === 'function') renderTexturePalette();
  });
}
let STRUCTURE_DEFS = [];
// STRUCTURE_TURRETS moved to module
import { STRUCTURE_TURRETS } from "./structure_turrets.js";
let selectedStructureIndex = -1;
let objectsGroup = new THREE.Group();
let selectedStructureRotation = 0;
let previewScene = null;
let previewCamera = null;
let previewRenderer = null;
let previewMesh = null;
let previewLoadToken = 0;
let highlightLoadToken = 0;


async function loadStructureDefs() {
  try {
    const url = (typeof window !== 'undefined' && window.STRUCTURES_JSON) ? window.STRUCTURES_JSON : 'structure.json';
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    STRUCTURE_DEFS = Object.values(data).map(entry => ({
      id: entry.id,
      name: entry.name,
      sizeX: entry.width,
      sizeY: entry.breadth,
      pies: entry.structureModel
    }));
    populateStructureSelect();
  } catch (err) {
    console.error('Failed to load structure definitions:', err);
  }
}
function populateStructureSelect() {
  const structureSelect = document.getElementById('structureSelect');
  if (!structureSelect) return;
  while (structureSelect.firstChild) {
    structureSelect.removeChild(structureSelect.firstChild);
  }
  STRUCTURE_DEFS.forEach((def, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = def.name;
    structureSelect.appendChild(opt);
  });
  selectedStructureIndex = -1;
}
let activeTab = 'view';
let selectedTileId = 0;
let selectedRotation = 0;
let brushSize = 1;
let highlightMesh = null;
let previewGroup = null;
let lastMouseEvent = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let highlightCachedId = null;
let highlightCachedRot = null;
let highlightModelGroup = null;
let highlightLoadingId = null;
let highlightLoadingRot = null;
const initDom = () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      setActiveTab(tab);
    });
  });
  const rotLeft = document.getElementById('rotateLeft');
  const rotRight = document.getElementById('rotateRight');
  rotLeft && rotLeft.addEventListener('click', () => {
    selectedRotation = (selectedRotation + 3) % 4;
    updateSelectedInfo();
    renderTexturePalette();
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  });
  rotRight && rotRight.addEventListener('click', () => {
    selectedRotation = (selectedRotation + 1) % 4;
    updateSelectedInfo();
    renderTexturePalette();
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  });
  updateSelectedInfo();
  setActiveTab(activeTab);
    const brushInput = document.getElementById('brushSizeInput');
  const brushSlider = document.getElementById('brushSizeSlider');
  const setBrush = (v) => {
    const n = parseInt(v, 10);
    brushSize = isNaN(n) || n < 1 ? 1 : n;
    if (brushInput) brushInput.value = brushSize;
    if (brushSlider) brushSlider.value = String(brushSize);
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  if (brushInput) {
    brushSize = parseInt(brushInput.value, 10) || 1;
    brushInput.addEventListener('input', () => setBrush(brushInput.value));
    brushInput.addEventListener('change', () => setBrush(brushInput.value));
  }
  if (brushSlider) {
    brushSlider.value = String(brushSize);
    brushSlider.addEventListener('input', () => setBrush(brushSlider.value));
    brushSlider.addEventListener('change', () => setBrush(brushSlider.value));
  }const heightBrushInput = document.getElementById('heightBrushSizeInput');
const heightBrushSlider = document.getElementById('heightBrushSizeSlider');
if (heightBrushInput) {
  heightBrushInput.value = brushSize;
  const syncHeight = (v) => setBrush(v);
  heightBrushInput.addEventListener('input', () => syncHeight(heightBrushInput.value));
  heightBrushInput.addEventListener('change', () => syncHeight(heightBrushInput.value));
}
if (heightBrushSlider) {
  heightBrushSlider.value = String(brushSize);
  heightBrushSlider.addEventListener('input', () => setBrush(heightBrushSlider.value));
  heightBrushSlider.addEventListener('change', () => setBrush(heightBrushSlider.value));
}const typeSelect = document.getElementById('tileTypeSelect');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const val = parseInt(typeSelect.value, 10);
      selectedTileType = isNaN(val) ? 0 : val;
      if (tileTypesById.length > selectedTileId) {
        tileTypesById[selectedTileId] = selectedTileType;
      }
      renderTexturePalette();
    });
  }
  const typeToggle = document.getElementById('displayTileTypes');
  if (typeToggle) {
    typeToggle.addEventListener('change', () => {
      renderTexturePalette();
    });
  }
  const heightInput = document.getElementById('heightValueInput');
  const heightSlider = document.getElementById('heightSlider');
  if (heightInput && heightSlider) {
    selectedHeight = parseInt(heightInput.value, 10) || 0;
    const syncHeightControls = (val) => {
      const clamped = Math.max(0, Math.min(255, val));
      selectedHeight = clamped;
      heightInput.value = clamped;
      heightSlider.value = clamped;
    };
    heightInput.addEventListener('change', () => {
      const val = parseInt(heightInput.value, 10);
      if (!isNaN(val)) syncHeightControls(val);
    });
    heightSlider.addEventListener('input', () => {
      const val = parseInt(heightSlider.value, 10);
      syncHeightControls(val);
    });
    document.querySelectorAll('.height-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-val'), 10);
        if (!isNaN(val)) syncHeightControls(val);
      });
    });
  }
  const sizeXInput = document.getElementById('sizeXInput');
  const sizeYInput = document.getElementById('sizeYInput');
  const applySizeBtn = document.getElementById('applySizeBtn');
  if (applySizeBtn && sizeXInput && sizeYInput) {
    sizeXInput.value = mapW;
    sizeYInput.value = mapH;
    applySizeBtn.addEventListener('click', () => {
      const newW = parseInt(sizeXInput.value, 10);
      const newH = parseInt(sizeYInput.value, 10);
      if (!isNaN(newW) && !isNaN(newH) && newW > 0 && newH > 0 && newW <= 256 && newH <= 256) {
        resizeMap(newW, newH);
      }
    });
  }
  threeContainer.addEventListener('mousemove', handleMouseMove);
  threeContainer.addEventListener('mouseleave', () => {
    if (highlightMesh && scene) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup && scene) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
  });
  setTileset(tilesetIndex);
  const structureSelect = document.getElementById('structureSelect');
  if (structureSelect) {
    structureSelect.addEventListener('change', () => {
      const val = parseInt(structureSelect.value, 10);
      selectedStructureIndex = isNaN(val) ? -1 : val;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
      selectedStructureRotation = 0;
      updateStructurePreview();
    });
    loadStructureDefs();
  }
  const sRotLeft = document.getElementById('structRotateLeft');
  const sRotRight = document.getElementById('structRotateRight');
  if (sRotLeft) {
    sRotLeft.addEventListener('click', () => {
      selectedStructureRotation = (selectedStructureRotation + 3) % 4;
      updateStructurePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (sRotRight) {
    sRotRight.addEventListener('click', () => {
      selectedStructureRotation = (selectedStructureRotation + 1) % 4;
      updateStructurePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const previewDiv = document.getElementById('structurePreview');
  if (previewDiv) {
    const width = previewDiv.clientWidth;
    const height = previewDiv.clientHeight;
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(width, height);
    previewRenderer.setClearColor(0x151e28, 0);
    previewDiv.appendChild(previewRenderer.domElement);
    previewScene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    previewScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 10);
    previewScene.add(dirLight);
    previewCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    previewCamera.position.set(2.5, 2, 2.5);
    previewCamera.lookAt(0, 0, 0);
    const renderPreview = () => {
      if (previewRenderer && previewScene && previewCamera) {
        previewRenderer.render(previewScene, previewCamera);
      }
      requestAnimationFrame(renderPreview);
    };
    renderPreview();
    updateStructurePreview();
  }
  if (threeContainer) {
    threeContainer.addEventListener('click', handleEditClick);
  }
};

function handleEditClick(event) {
  if (activeTab !== 'textures' && activeTab !== 'height' && activeTab !== 'objects') return;
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) return;
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) return;
  if (activeTab === 'textures') {
    let __needsRedrawTex = false;
for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          mapTiles[ty][tx] = selectedTileId;
          __needsRedrawTex = true;
          mapRotations[ty][tx] = selectedRotation;
        }
      }
    }
if (__needsRedrawTex) drawMap3D();
} else if (activeTab === 'height') {let __needsRedrawHeight = false;
    let newHeight = selectedHeight;
    if (event.shiftKey) {
      newHeight = 0;
    }
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          mapHeights[ty][tx] = Math.max(0, Math.min(255, newHeight));
          __needsRedrawHeight = true;
        }
      }
    }
if (__needsRedrawHeight) drawMap3D();
} else if (activeTab === 'objects') {
    if (selectedStructureIndex < 0) return;
    const def = STRUCTURE_DEFS[selectedStructureIndex];
    let sizeX = def.sizeX || 1;
    let sizeY = def.sizeY || 1;
    if (selectedStructureRotation % 2 === 1) {
      const tmp = sizeX;
      sizeX = sizeY;
      sizeY = tmp;
    }
    if (tileX + sizeX - 1 >= mapW || tileY + sizeY - 1 >= mapH) {
      return;
    }
    let minH = Infinity;
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) {
        const h = mapHeights[tileY + dy][tileX + dx] * HEIGHT_SCALE;
        if (h < minH) minH = h;
      }
    }
buildStructureGroup(def, selectedStructureRotation, sizeX, sizeY, 1).then(group => {
  const cX = group.userData.centerX;
  const cZ = group.userData.centerZ;
  const cY = group.userData.centerY;
  const minYVal = group.userData.minY;
  let minH = Infinity;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const h = mapHeights[tileY + dy][tileX + dx] * HEIGHT_SCALE;
      if (h < minH) minH = h;
    }
  }
  const pX = tileX + sizeX / 2 - cX;
  const pZ = tileY + sizeY / 2 - cZ;
  const pY = minH + cY - minYVal;
  group.position.set(pX, pY, pZ);
  objectsGroup.add(group);
  if (!scene.children.includes(objectsGroup)) scene.add(objectsGroup);
  drawMap3D();
}).catch(() => {});
}
}
function __old_updateHighlight(event) {
  if (!threeContainer || !scene) return;
  if (activeTab !== 'textures' && activeTab !== 'height' && activeTab !== 'objects') {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    return;
  }
  let clientX, clientY;
  if (event) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return;
  }
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  const size = brushSize;
  if (highlightMesh) {
    scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
  if (previewGroup) {
    previewGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    scene.remove(previewGroup);
    previewGroup = null;
  }
  if (activeTab === 'textures') {
    previewGroup = new THREE.Group();
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) continue;
        const img = tileImages.length ? tileImages[selectedTileId % tileImages.length] : null;
        const canvas2 = document.createElement('canvas');
        canvas2.width = 32;
        canvas2.height = 32;
        const ctx2 = canvas2.getContext('2d');
        if (img && img.complete && img.naturalWidth > 0) {
          ctx2.save();
          ctx2.translate(16, 16);
          ctx2.rotate((selectedRotation * Math.PI) / 2);
          ctx2.translate(-16, -16);
          ctx2.drawImage(img, 0, 0, 32, 32);
          ctx2.restore();
        }
        const tex2 = new THREE.CanvasTexture(canvas2);
        tex2.magFilter = THREE.NearestFilter;
        tex2.minFilter = THREE.LinearMipMapLinearFilter;
        const mat2 = new THREE.MeshBasicMaterial({ map: tex2, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        const geo2 = new THREE.PlaneGeometry(1, 1);
        geo2.rotateX(-Math.PI / 2);
        const mesh2 = new THREE.Mesh(geo2, mat2);
        const baseHeight = mapHeights[ty][tx] * HEIGHT_SCALE;
        mesh2.position.set(tx + 0.5, baseHeight + 0.03, ty + 0.5);
        previewGroup.add(mesh2);
      }
    }
    scene.add(previewGroup);
  } else if (activeTab === 'height') {
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    highlightMesh = new THREE.Mesh(geo, mat);
    let maxH = 0;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          const h = mapHeights[ty][tx] * HEIGHT_SCALE;
          if (h > maxH) maxH = h;
        }
      }
    }
    highlightMesh.position.set(tileX + size / 2, maxH + 0.02, tileY + size / 2);
    scene.add(highlightMesh);
  } else if (activeTab === 'objects') {
    if (selectedStructureIndex < 0) return;
    const def = STRUCTURE_DEFS[selectedStructureIndex];
    let sizeX = def.sizeX || 1;
    let sizeY = def.sizeY || 1;
    if (selectedStructureRotation % 2 === 1) {
      const tmpXY = sizeX;
      sizeX = sizeY;
      sizeY = tmpXY;
    }
    let maxH2 = 0;
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          const h = mapHeights[ty][tx] * HEIGHT_SCALE;
          if (h > maxH2) maxH2 = h;
        }
      }
    }
    const newGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(sizeX, sizeY);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.position.set(tileX + sizeX / 2, maxH2 + 0.02, tileY + sizeY / 2);
    highlightMesh = planeMesh;
    newGroup.add(planeMesh);
    const currentToken = ++highlightLoadToken;
    const pieFile = (def.pies && def.pies.length) ? def.pies[0] : null;
    const repositionPreview = () => {
      if (!highlightModelGroup) return;
      const cX = highlightModelGroup.userData.centerX;
      const cY = highlightModelGroup.userData.centerY;
      const cZ = highlightModelGroup.userData.centerZ;
      const minYVal = highlightModelGroup.userData.minY;
      const pX = tileX + sizeX / 2 - cX;
      const pY = maxH2 + 0.02 - minYVal;
      const pZ = tileY + sizeY / 2 - cZ;
      highlightModelGroup.position.set(pX + cX, pY + cY, pZ + cZ);
    };
    if (!pieFile) {
      previewGroup = newGroup;
      scene.add(previewGroup);
    } else if (highlightModelGroup && highlightCachedId === def.id && highlightCachedRot === selectedStructureRotation) {
      repositionPreview();
      previewGroup = newGroup;
      scene.add(previewGroup);
      if (!scene.children.includes(highlightModelGroup)) scene.add(highlightModelGroup);
    } else if (highlightLoadingId === def.id && highlightLoadingRot === selectedStructureRotation) {
      previewGroup = newGroup;
      scene.add(previewGroup);
    } else {
      highlightLoadingId = def.id;
      highlightLoadingRot = selectedStructureRotation;
      if (highlightModelGroup) {
        scene.remove(highlightModelGroup);
        highlightModelGroup.traverse(child => {
          if (child.isMesh) {
            if (child.material && child.material.map) child.material.map.dispose();
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
          }
        });
        highlightModelGroup = null;
      }
      loadPieGeometry(pieFile).then(geo => {
        if (currentToken !== highlightLoadToken) return;
        const g = geo.clone();
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const width = bb.max.x - bb.min.x;
        const depth = bb.max.z - bb.min.z;
        let sX = width !== 0 ? (sizeX / width) : 1;
        let sZ = depth !== 0 ? (sizeY / depth) : 1;
        let scl = Math.min(sX, sZ);
        if (!isFinite(scl) || scl <= 0) scl = 1;
        g.scale(scl, scl, scl);
        g.computeBoundingBox();
        const bb2 = g.boundingBox;
        let baseMat;
        if (g.userData && g.userData.textureName) {
          const texLoader = new THREE.TextureLoader();
          const texName = g.userData.textureName.toLowerCase();
          const tex = texLoader.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName, undefined, undefined, () => {});
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.LinearMipMapLinearFilter;
          baseMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.5 });
        } else {
          baseMat = new THREE.MeshPhongMaterial({ color: 0x8888ff, transparent: true, opacity: 0.5 });
        }
        const cX = (bb2.min.x + bb2.max.x) / 2;
        const cY = (bb2.min.y + bb2.max.y) / 2;
        const cZ = (bb2.min.z + bb2.max.z) / 2;
        const minYVal = bb2.min.y;
        let connRel = null;
        if (g.userData && g.userData.connectors && g.userData.connectors.length) {
          const bc = g.userData.connectors[0];
          const cxScaled = bc.x * scl;
          const cyScaled = bc.y * scl;
          const czScaled = bc.z * scl;
          connRel = {
            x: cxScaled - cX,
            y: cyScaled - cY,
            z: czScaled - cZ
          };
        }
        const inner = new THREE.Group();
        const baseMesh = new THREE.Mesh(g, baseMat);
        baseMesh.position.set(-cX, -cY, -cZ);
        inner.add(baseMesh);
            const attachments = STRUCTURE_TURRETS[def.id];
            let loadAtts;
            if (attachments && attachments.length) {
              const sortedFiles = attachments.slice().sort((a, b) => {
                const aTur = a.toLowerCase().startsWith('tr') ? 0 : 1;
                const bTur = b.toLowerCase().startsWith('tr') ? 0 : 1;
                return aTur - bTur;
              });
              loadAtts = Promise.all(sortedFiles.map(file => loadPieGeometry(file))).then(attGeos => {
            if (currentToken !== highlightLoadToken) return;
            const gHeightVal = bb2.max.y - bb2.min.y;
            let offYVal = gHeightVal / 2;
            attGeos.forEach(attGeo => {
              const tg = attGeo.clone();
              tg.scale(scl, scl, scl);
              tg.computeBoundingBox();
              const tb = tg.boundingBox;
              let tMat;
              if (tg.userData && tg.userData.textureName) {
                const texLoader2 = new THREE.TextureLoader();
                const texName2 = tg.userData.textureName.toLowerCase();
                const tex2 = texLoader2.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName2, undefined, undefined, () => {});
                tex2.magFilter = THREE.NearestFilter;
                tex2.minFilter = THREE.LinearMipMapLinearFilter;
                tMat = new THREE.MeshLambertMaterial({ map: tex2, transparent: true, opacity: 0.5 });
              } else {
                tMat = new THREE.MeshLambertMaterial({ color: 0x6666ff, transparent: true, opacity: 0.5 });
              }
              const tMesh = new THREE.Mesh(tg, tMat);
              const tcX = (tb.min.x + tb.max.x) / 2;
              const tcZ = (tb.min.z + tb.max.z) / 2;
              const tMinY = tb.min.y;
              if (connRel) {
                const xPos = connRel.x - tcX;
                const yPos = connRel.y - tMinY;
                const zPos = connRel.z - tcZ;
                tMesh.position.set(xPos, yPos, zPos);
              } else {
                tMesh.position.set(-tcX, offYVal - tMinY, -tcZ);
                offYVal += (tb.max.y - tb.min.y);
              }
              inner.add(tMesh);
            });
          }).catch(() => {});
        } else {
          loadAtts = Promise.resolve();
        }
        Promise.resolve(loadAtts).then(() => {
          if (currentToken !== highlightLoadToken) return;
          const pX = tileX + sizeX / 2 - cX;
          const pY = maxH2 + 0.02 - minYVal;
          const pZ = tileY + sizeY / 2 - cZ;
          inner.position.set(pX + cX, pY + cY, pZ + cZ);
          inner.rotation.y = selectedStructureRotation * Math.PI / 2;
          inner.userData.centerX = cX;
          inner.userData.centerY = cY;
          inner.userData.centerZ = cZ;
          inner.userData.minY = minYVal;
          highlightModelGroup = inner;
          highlightCachedId = def.id;
          highlightCachedRot = selectedStructureRotation;
          highlightLoadingId = null;
          highlightLoadingRot = null;
          previewGroup = newGroup;
          scene.add(previewGroup);
          scene.add(highlightModelGroup);
        });
      }).catch(err => {
        console.warn('Failed to load structure preview for placement', err);
        highlightLoadingId = null;
        highlightLoadingRot = null;
        previewGroup = newGroup;
        scene.add(previewGroup);
        previewGroup.position.copy(getStructurePlacementPosition(previewGroup, tileX, tileY, sizeX, sizeY, minH));
      });
    }
  }
}
function handleMouseMove(event) {
  lastMouseEvent = event;
  updateHighlight(event);
}
function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', isActive);
  });
  const panels = document.querySelectorAll('#editPanel .panel');
  panels.forEach(p => { p.style.display = 'none'; });
  const panel = document.getElementById(tab + 'Panel');
  if (panel) panel.style.display = 'block';
  const tileToggle = document.getElementById('showTileId');
  if (tileToggle && tileToggle.parentElement) {
    tileToggle.parentElement.style.display = (tab === 'textures') ? 'flex' : 'none';
  }
  const panelIdsToggle = document.getElementById('showPanelIds');
  if (panelIdsToggle && panelIdsToggle.parentElement) {
    panelIdsToggle.parentElement.style.display = (tab === 'textures') ? 'flex' : 'none';
  }
  const heightToggle = document.getElementById('showHeight');
  if (heightToggle && heightToggle.parentElement) {
    heightToggle.parentElement.style.display = (tab === 'height') ? 'flex' : 'none';
  }
  const showOptions = document.getElementById('showOptions');
  if (showOptions) {
    if (tab === 'textures' || tab === 'height') {
      showOptions.style.display = 'flex';
    } else {
      showOptions.style.display = 'none';
    }
  }
  if (tab === 'objects') {
    updateStructurePreview();
  }
}
function updateSelectedInfo() {
  const span = document.getElementById('selectedTileIdDisplay');
  if (span) {
    span.textContent = selectedTileId;
  }
  const typeSelect = document.getElementById('tileTypeSelect');
  if (typeSelect && tileTypesById.length) {
    const typeVal = tileTypesById[selectedTileId] ?? 0;
    typeSelect.value = typeVal;
    selectedTileType = typeVal;
  }
  // Inline selected tile type next to the ID
  try {
    const span = document.getElementById('selectedTileIdDisplay');
    const parent = span ? span.parentElement : null;
    let typeLabel = document.getElementById('selectedTileTypeLabel');
    if (!typeLabel && parent) {
      typeLabel = document.createElement('span');
      typeLabel.id = 'selectedTileTypeLabel';
      typeLabel.style.marginLeft = '10px';
      typeLabel.style.color = '#cfe8ff';
      parent.appendChild(typeLabel);
    }
    const code = (Array.isArray(tileTypesById) && tileTypesById.length > selectedTileId)
      ? (tileTypesById[selectedTileId] ?? 0)
      : 0;
    const name = (Array.isArray(TILE_TYPE_NAMES) && TILE_TYPE_NAMES.length)
      ? (TILE_TYPE_NAMES[code % TILE_TYPE_NAMES.length] || 'Unknown')
      : String(code);
    if (typeLabel) typeLabel.textContent = 'Type: ' + name;
  } catch(e) {}
  // Ensure single-line + smaller font for type label
  try {
    const _lbl = document.getElementById('selectedTileTypeLabel');
    if (_lbl) {
      _lbl.style.fontSize = '12px';
      _lbl.style.whiteSpace = 'nowrap';
    }
    const _idSpan = document.getElementById('selectedTileIdDisplay');
    const _parent = _idSpan ? _idSpan.parentElement : null;
    if (_parent) {
      _parent.style.whiteSpace = 'nowrap';
    }
  } catch(e) {}
}
function updateStructurePreview() {
  const label = document.getElementById('structureNameLabel');
  if (!previewScene || !previewRenderer || !previewCamera) {
    if (label) label.textContent = '';
    return;
  }
  const previewDiv = document.getElementById('structurePreview');
  if (previewRenderer && previewDiv) {
    const w = previewDiv.clientWidth || 160;
    const h = previewDiv.clientHeight || 160;
    if (w > 0 && h > 0) {
      previewRenderer.setSize(w, h);
      previewCamera.aspect = w / h;
      previewCamera.updateProjectionMatrix();
    }
  }
  const currentToken = ++previewLoadToken;
  if (previewScene) {
    for (let i = previewScene.children.length - 1; i >= 0; i--) {
      const child = previewScene.children[i];
      if (child.isMesh || child.type === "Group") {
        previewScene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        if (child.children) {
          child.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
          });
        }
      }
    }
    previewMesh = null;
  }
  if (selectedStructureIndex < 0) {
    if (label) label.textContent = '';
    return;
  }
  const def = STRUCTURE_DEFS[selectedStructureIndex];
  if (label) label.textContent = def.name || '';
    buildStructureGroup(def, selectedStructureRotation, def.sizeX, def.sizeY, null, 1).then(group => {
  if (currentToken !== previewLoadToken) return;
  group.traverse(obj => {
    if (obj.material) obj.material.transparent = true;
  });
  previewMesh = group;
  previewScene.add(previewMesh);
  const box = new THREE.Box3().setFromObject(previewMesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = previewCamera.fov * (Math.PI / 180);
  const cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  const offset = cameraZ * 1.4;
  previewCamera.position.set(
    center.x + offset,
    center.y + offset,
    center.z + offset
  );
  previewCamera.lookAt(center);
  previewCamera.updateProjectionMatrix();
}).catch(() => {});
}
function renderTexturePalette() {
  const palette = document.getElementById('texturePalette');
  if (!palette) return;
  palette.innerHTML = '';
  // Use the actual number of loaded tile images rather than the
  // expected count from the tileset definition. This ensures we
  // don't accidentally clip tiles when a tileset provides more (or
  // fewer) images than the hard-coded metadata. For example the
  // Rocky Mountains tileset should display all 80 tiles.
  const total = tileImages.length;
  for (let idx = 0; idx < total; idx++) {
    const img = tileImages[idx];
    const canvas = document.createElement('canvas');
    canvas.width = TILE_ICON_SIZE;
    canvas.height = TILE_ICON_SIZE;
    const ctx = canvas.getContext('2d');
    const center = TILE_ICON_SIZE / 2;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate((selectedRotation * Math.PI) / 2);
      ctx.translate(-center, -center);
      ctx.drawImage(img, 0, 0, TILE_ICON_SIZE, TILE_ICON_SIZE);
      ctx.restore();
    }
    const typeToggle = document.getElementById('displayTileTypes');
    if (typeToggle && typeToggle.checked && tileTypesById.length) {
      const typeCode = tileTypesById[idx] ?? 0;
      const colour = TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length];
      ctx.fillStyle = colour;
      const dotSize = TILE_ICON_SIZE * 0.25;
      ctx.fillRect(2, 2, dotSize, dotSize);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(2, 2, dotSize, dotSize);
    }
    // Panel: big centered tile ID label (independent of type toggle)
    (function() {
      const el = (typeof showPanelIdsCheckbox !== 'undefined' && showPanelIdsCheckbox)
        ? showPanelIdsCheckbox
        : document.getElementById('showPanelIds');
      if (!el || el.checked) {
        const label = String(idx);
        const cx = TILE_ICON_SIZE / 2;
        const cy = TILE_ICON_SIZE / 2;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.arc(cx, cy, TILE_ICON_SIZE * 0.38, 0, Math.PI * 2);
        ctx.fill();
        const fontSize = Math.floor(TILE_ICON_SIZE * 0.55);
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, Math.floor(TILE_ICON_SIZE * 0.08));
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(label, cx, cy);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy);
      }
    })();
    const imgElem = new Image();
    imgElem.src = canvas.toDataURL();
    imgElem.dataset.index = idx;
    imgElem.style.width = TILE_ICON_SIZE + 'px';
    imgElem.style.height = TILE_ICON_SIZE + 'px';
    imgElem.style.cursor = 'pointer';
    imgElem.style.border = '1px solid #435066';
    imgElem.style.boxSizing = 'border-box';
    imgElem.addEventListener('click', () => {
      selectedTileId = idx;
      updateSelectedInfo();
      palette.querySelectorAll('img').forEach(el => el.style.outline = '');
      imgElem.style.outline = '2px solid #8cf';
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
    palette.appendChild(imgElem);
  }
  const selectedImg = palette.querySelector("img[data-index='" + selectedTileId + "']");
  if (selectedImg) {
    selectedImg.style.outline = '2px solid #8cf';
  }
}
const DEFAULT_GRID = 16;
const CAM_EDGE_MARGIN = 400;
const TTP_TILESET_MAP = {
  0x0100: 0,
  0x0200: 1,
  0x0000: 2
};
let tilesetIndex = 0;
let mapW = DEFAULT_GRID, mapH = DEFAULT_GRID;
let mapTiles = Array(mapH).fill().map(() => Array(mapW).fill(0));
let mapHeights = Array(mapH).fill().map(() => Array(mapW).fill(0));
let mapRotations = Array(mapH).fill().map(() => Array(mapW).fill(0));
let tileImages = [];
const TILE_TYPE_NAMES = [
  "Sand",
  "Sandy Brush",
  "Rubble",
  "Green Mud",
  "Red Brush",
  "Pink Rock",
  "Road",
  "Water",
  "Cliff Face",
  "Baked Earth",
  "Sheet Ice",
  "Slush"
];
// Adds a colored square before each tile type option in the dropdown.
function colorizeTileTypeOptions() {
  const sel = document.getElementById('tileTypeSelect');
  if (!sel) return;
  for (let i = 0; i < sel.options.length; i++) {
    const opt = sel.options[i];
    const baseName = opt.getAttribute('data-name') || opt.textContent.replace(/^â– \s*/,'').trim();
    const color = (typeof TILE_TYPE_COLORS !== 'undefined' && TILE_TYPE_COLORS[i]) ? TILE_TYPE_COLORS[i] : '#888';
    opt.textContent = 'â–  ' + baseName;
    opt.style.color = color;
  }
}
const TILE_TYPE_COLORS = [
  '#ff0',
  '#0f0',
  '#f00',
  '#00f',
  '#f0f',
  '#0ff',
  '#fff',
  '#000',
  '#888',
  '#ffa500',
  '#8a2be2',
  '#00ced1'
];
const TILE_ICON_SIZE = 40;
let tileTypesById = [];
let selectedTileType = 0;
let selectedHeight = 0;
function parseTileTypes(data) {
  if (!data || data.length < 12) return [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entryCount = dv.getUint32(8, true);
  const arr = [];
  for (let i = 0; i < entryCount; i++) {
    const val = dv.getUint16(12 + i * 2, true);
    arr.push(val);
  }
  return arr;
}
let animationId = null;
TILESETS.forEach((ts, i) => {
  let opt = document.createElement("option");
  opt.value = i;
  opt.textContent = ts.name;
  tilesetSelect.appendChild(opt);
});
tilesetSelect.value = tilesetIndex;
if (tilesetSelect && !tilesetSelect.__wzBound) {
  tilesetSelect.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    setTileset(isNaN(idx) ? 0 : idx);
  });
  tilesetSelect.addEventListener('input', (e) => {
    const idx = parseInt(e.target.value, 10);
    setTileset(isNaN(idx) ? 0 : idx);
  });
  tilesetSelect.__wzBound = true;
}
setupKeyboard(() => resetCameraTarget(mapW, mapH, threeContainer));
async function setTileset(idx) {
  // ensure fresh tiles when switching sets
  clearTileCache(idx);

  if (idx < 0 || idx >= TILESETS.length) idx = 0;
  tilesetIndex = idx;
  tilesetSelect.value = tilesetIndex;
  tileImages = await loadAllTiles(tilesetIndex);
  renderTexturePalette();
  updateSelectedInfo();
  drawMap3D();
}

async function loadMapFile(file) {
  fileListDiv.innerHTML = "";
  infoDiv.textContent = "";
  if (mapFilenameSpan) mapFilenameSpan.textContent = file.name;
  try {
    const inputEl = document.getElementById('wzLoader');
    if (inputEl) inputEl.style.display = 'none';
    if (mapFilenameSpan) mapFilenameSpan.style.display = 'none';
    if (typeof uiBar !== 'undefined' && uiBar) uiBar.style.display = 'none';
    try {
      const threeEl = document.getElementById('threeContainer');
      if (threeEl) { threeEl.style.top = '0px'; threeEl.style.height = '100vh'; }
      const overlayEl = document.getElementById('overlayMsg');
      if (overlayEl) overlayEl.style.top = '0px';
    } catch(e) {}
  } catch(e) {}
  let fileExt = file.name.toLowerCase().split('.').pop();
  let found = false;
  let autoTs = 0;
  if (fileExt === 'map') {
    const buf = await file.arrayBuffer();
    const fileData = new Uint8Array(buf);
    await setTileset(autoTs);
    const result = parseMapGrid(fileData);
    if (result) {
      mapW = result.mapW;
      mapH = result.mapH;
      mapTiles = result.mapTiles;
      mapRotations = result.mapRotations;
      mapHeights = result.mapHeights;
      resetCameraTarget(mapW, mapH, threeContainer);
      infoDiv.innerHTML = '<b>Loaded map grid:</b> <span style="color:yellow">' + file.name + '</span><br>Tileset: ' + TILESETS[tilesetIndex].name + '<br>Size: ' + mapW + 'x' + mapH;
      drawMap3D();
      hideOverlay();
      return;
    }
    infoDiv.innerHTML = '<b style="color:red">Failed to decode this map file!</b>';
    showOverlay("Failed to load map. Please select another file.");
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    let names = Object.keys(zip.files).map(n => n.replace(/\\/g, '/'));
    autoTs = await getTilesetIndexFromTtp(zip, TTP_TILESET_MAP);
    let allMapNames = Object.keys(zip.files)
      .filter(fname => fname.toLowerCase().endsWith(".map") && !zip.files[fname].dir);
    let mapFileName = allMapNames.find(f => f.toLowerCase().endsWith("game.map")) || allMapNames[0];
    if (mapFileName) {
      let fileData = await zip.files[mapFileName].async("uint8array");
      await setTileset(autoTs);
      const result = parseMapGrid(fileData);
      if (result) {
        mapW = result.mapW;
        mapH = result.mapH;
        mapTiles = result.mapTiles;
        mapRotations = result.mapRotations;
        mapHeights = result.mapHeights;
        const ttpName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('.ttp') && !zip.files[fn].dir);
        if (ttpName) {
          const ttpData = await zip.files[ttpName].async('uint8array');
          tileTypesById = parseTileTypes(ttpData);
          if (tileTypesById.length < tileImages.length) {
            for (let i = tileTypesById.length; i < tileImages.length; i++) tileTypesById[i] = 0;
          }
        } else {
          tileTypesById = new Array(tileImages.length).fill(0);
        }
        resetCameraTarget(mapW, mapH, threeContainer);
        infoDiv.innerHTML = '<b>Loaded map grid:</b> <span style="color:yellow">' + mapFileName + '</span><br>Tileset: ' + TILESETS[tilesetIndex].name + '<br>Size: ' + mapW + 'x' + mapH;
        drawMap3D();
        hideOverlay();
        found = true;
        const typeSelect = document.getElementById('tileTypeSelect');
        if (typeSelect) {
          if (!typeSelect.options.length) {
            TILE_TYPE_NAMES.forEach((name, idx) => {
              const opt = document.createElement('option');
              opt.value = idx;
              opt.textContent = name;
              typeSelect.appendChild(opt);
            });
                      try{colorizeTileTypeOptions();}catch(e){}
}
          if (tileTypesById.length > selectedTileId) {
            typeSelect.value = tileTypesById[selectedTileId] ?? 0;
          } else {
            typeSelect.value = 0;
          }
        }
        renderTexturePalette();
        const sizeXInputEl = document.getElementById('sizeXInput');
        const sizeYInputEl = document.getElementById('sizeYInput');
        if (sizeXInputEl) sizeXInputEl.value = mapW;
        if (sizeYInputEl) sizeYInputEl.value = mapH;
      }
    }
    if (!found) {
      infoDiv.innerHTML = '<b style=\"color:red\">Failed to decode any map grid in this archive!</b>';
      showOverlay("Failed to load map. Please select another file.");
      resetCameraTarget(mapW, mapH, threeContainer);
    }
  } catch (err) {
    infoDiv.innerHTML = '<b style=\"color:red\">Failed to open archive!</b>';
    showOverlay("Failed to open file. Please select another map.");
    resetCameraTarget(mapW, mapH, threeContainer);
  }
}

document.getElementById('wzLoader').addEventListener('change', async evt => {
  const file = evt.target.files[0];
  if (!file) return;
  await loadMapFile(file);
});

async function loadServerMap(filename) {
  try {
    const resp = await fetch('maps/' + filename);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const file = new File([blob], filename);
    await loadMapFile(file);
  } catch (err) {
    infoDiv.innerHTML = '<b style="color:red">Failed to load server map!</b>';
    console.error(err);
  }
}
window.loadServerMap = loadServerMap;
loadAllTiles(tilesetIndex).then(images => {
  tileImages = images;
  showOverlay("Please select map");
  resetCameraTarget(mapW, mapH, threeContainer);
});
let scene, camera, renderer, mesh;
let isDragging = false, lastX = 0, lastY = 0;
const HEIGHT_SCALE = 0.015;
// Culling settings (added 2025-08-16)
const ENABLE_DISTANCE_CULLING = true;
const CULL_DISTANCE = 350; // world units
const ENABLE_FRUSTUM_CULLING = true;
function drawMap3D() {
  if (!threeContainer) return;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (scene && mesh) {
    scene.remove(mesh);
    mesh = null;
  }
  if (scene) {
    for (let i = scene.children.length - 1; i >= 0; --i) {
      const obj = scene.children[i];
      if (obj.type === "Mesh" || obj.type === "InstancedMesh") {
        scene.remove(obj);
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => {
            if (mat && mat.map && typeof mat.map.dispose === "function") mat.map.dispose();
            if (mat && typeof mat.dispose === "function") mat.dispose();
          });
        } else if (obj.material) {
          if (obj.material.map && typeof obj.material.map.dispose === "function") obj.material.map.dispose();
          if (typeof obj.material.dispose === "function") obj.material.dispose();
        }
        if (obj.geometry && typeof obj.geometry.dispose === "function") obj.geometry.dispose();
      }
    }
  } else {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x151e28);
    threeContainer.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.93));
    let dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(100, 200, 150);
    scene.add(dir);
    camera = new THREE.PerspectiveCamera(
      55,
      threeContainer.offsetWidth / threeContainer.offsetHeight,
      0.1,
      4000
    );
    window.addEventListener('resize', () => {
      renderer.setSize(threeContainer.offsetWidth, threeContainer.offsetHeight);
      camera.aspect = threeContainer.offsetWidth / threeContainer.offsetHeight;
      camera.updateProjectionMatrix();
      resetCameraTarget(mapW, mapH, threeContainer);
    });
    threeContainer.addEventListener('mousedown', e => {
      if (activeTab === 'textures') return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      let dx = e.clientX - lastX, dy = e.clientY - lastY;
      cameraState.rotationY -= dx * 0.008;
      cameraState.rotationX -= dy * 0.008;
      cameraState.rotationX = Math.max(-1.1, Math.min(-0.08, cameraState.rotationX));
      lastX = e.clientX; lastY = e.clientY;
    });
    threeContainer.addEventListener('wheel', e => {
      cameraState.zoom *= (1 + e.deltaY * 0.0015);
      cameraState.zoom = Math.max(0.01, Math.min(cameraState.zoom, 6));
    });
  }
  renderer.setSize(threeContainer.offsetWidth, threeContainer.offsetHeight);
  const showTileId = !!(typeof showTileIdCheckbox !== "undefined" && showTileIdCheckbox && showTileIdCheckbox.checked);
  const showHeight = !!(typeof showHeightCheckbox !== "undefined" && showHeightCheckbox && showHeightCheckbox.checked);
  const tileCount = tileImages.length || getTileCount(tilesetIndex);
  const uniqueTiles = new Set();
  for (let y = 0; y < mapH; ++y) {
    for (let x = 0; x < mapW; ++x) {
      uniqueTiles.add(mapTiles[y][x] % tileCount);
    }
  }
  const tileGeometry = new THREE.BoxGeometry(1, 1, 1);
  uniqueTiles.forEach(tileIdx => {
    let img = tileImages[tileIdx];
    let tex;
    if (img && img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 32, 32);
// --- draw small type swatch on map when enabled ---
try {
  if (typeof showTileTypesOnMapCheckbox !== 'undefined' && showTileTypesOnMapCheckbox && showTileTypesOnMapCheckbox.checked) {
    const typeCode = (typeof tileTypesById !== 'undefined' && tileTypesById.length) ? (tileTypesById[tileIdx] ?? 0) : 0;
    const col = (typeof TILE_TYPE_COLORS !== 'undefined' && TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length]) ? TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length] : '#888';
    ctx.fillStyle = col;
    const d = 6; ctx.fillRect(2, 2, d, d);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(2, 2, d, d);
  }
} catch(e) {}
      if (showTileId) {
        ctx.save();
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.strokeText(tileIdx, 16, 0);
        ctx.fillStyle = "#FFF";
        ctx.fillText(tileIdx, 16, 0);
        ctx.restore();
      }
      if (showHeight) {
      }
      tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    } else {
      tex = null;
    }
    const material = tex ?
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }) :
      new THREE.MeshLambertMaterial({ color: 0x393, side: THREE.DoubleSide });
    let count = 0;
    for (let y = 0; y < mapH; ++y) {
      for (let x = 0; x < mapW; ++x) {
        if ((mapTiles[y][x] % tileCount) === tileIdx) count++;
      }
    }
    if (count === 0) return;
    const instancedMesh = new THREE.InstancedMesh(tileGeometry, material, count);
    let i = 0;
    for (let y = 0; y < mapH; ++y) {
      for (let x = 0; x < mapW; ++x) {
        if ((mapTiles[y][x] % tileCount) !== tileIdx) continue;
        let height = Math.max(mapHeights[y][x] * HEIGHT_SCALE, 0.01);
        const rotation = (mapRotations[y][x] % 4) * Math.PI / 2;
const matrix = new THREE.Matrix4();
const rotationMatrix = new THREE.Matrix4().makeRotationY(rotation);
const scaleMatrix = new THREE.Matrix4().makeScale(1, height, 1);
const translationMatrix = new THREE.Matrix4().makeTranslation(x + 0.5, height / 2, y + 0.5);
matrix.multiply(translationMatrix).multiply(rotationMatrix).multiply(scaleMatrix);
instancedMesh.setMatrixAt(i, matrix);
        i++;
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);
  });
  if (objectsGroup && !scene.children.includes(objectsGroup)) {
    scene.add(objectsGroup);
  }
// --- Frustum & distance culling (added 2025-08-16) ---
const __frustum = new THREE.Frustum();
const __projScreenMatrix = new THREE.Matrix4();
const __tmpVec3 = new THREE.Vector3();
function updateCulling() {
  if ((!ENABLE_DISTANCE_CULLING && !ENABLE_FRUSTUM_CULLING) || !camera || !scene) return;
  if (ENABLE_FRUSTUM_CULLING) {
    __projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    __frustum.setFromProjectionMatrix(__projScreenMatrix);
  }
  const camPos = camera.position;
  scene.traverse(obj => {
    const ud = obj.userData || {};
    if (!ud.cullable) return;
    // Start visible by default
    let visible = true;
    if (ENABLE_DISTANCE_CULLING) {
      obj.getWorldPosition(__tmpVec3);
      const dist = __tmpVec3.distanceTo(camPos);
      if (dist > CULL_DISTANCE) visible = false;
    }
    if (visible && ENABLE_FRUSTUM_CULLING) {
      let bs = ud.boundingSphere;
      if (!bs) {
        // compute once and store
        const box = new THREE.Box3().setFromObject(obj);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        ud.boundingSphere = sphere;
        obj.userData = ud;
        bs = sphere;
      }
      if (bs) {
        // transform sphere center to world
        const worldCenter = obj.localToWorld(bs.center.clone());
        const worldSphere = new THREE.Sphere(worldCenter, bs.radius);
        visible = __frustum.intersectsSphere(worldSphere);
      }
    }
    obj.visible = visible;
  });
}
  function animate() {
    let moveX = 0, moveZ = 0;
    if (cameraState.keys['w']) moveZ -= cameraState.camMoveSpeed * cameraState.zoom;
    if (cameraState.keys['s']) moveZ += cameraState.camMoveSpeed * cameraState.zoom;
    if (cameraState.keys['a']) moveX -= cameraState.camMoveSpeed * cameraState.zoom;
    if (cameraState.keys['d']) moveX += cameraState.camMoveSpeed * cameraState.zoom;
    if (moveX || moveZ) {
      const angle = cameraState.rotationY;
      const fx = Math.sin(angle);
      const fz = Math.cos(angle);
      const rx = Math.sin(angle + Math.PI / 2);
      const rz = Math.cos(angle + Math.PI / 2);
      cameraState.camTargetX += fx * moveZ + rx * moveX;
      cameraState.camTargetZ += fz * moveZ + rz * moveX;
      cameraState.camTargetX = Math.max(-CAM_EDGE_MARGIN, Math.min(mapW - 1 + CAM_EDGE_MARGIN, cameraState.camTargetX));
      cameraState.camTargetZ = Math.max(-CAM_EDGE_MARGIN, Math.min(mapH - 1 + CAM_EDGE_MARGIN, cameraState.camTargetZ));
    }
    let dist = Math.max(mapW, mapH) * 1.5 * cameraState.zoom;
    let camY = Math.abs(Math.sin(cameraState.rotationX)) * dist + 3;
    camera.position.x = cameraState.camTargetX + Math.sin(cameraState.rotationY) * Math.cos(cameraState.rotationX) * dist;
    camera.position.y = camY;
    camera.position.z = cameraState.camTargetZ + Math.cos(cameraState.rotationY) * Math.cos(cameraState.rotationX) * dist;
    camera.lookAt(cameraState.camTargetX, 0, cameraState.camTargetZ);
    updateCulling();
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  }
  animate();
}
if (showTileIdCheckbox) showTileIdCheckbox.addEventListener('change', () => drawMap3D());
if (showHeightCheckbox) showHeightCheckbox.addEventListener('change', () => drawMap3D());
if (showTileTypesOnMapCheckbox) showTileTypesOnMapCheckbox.addEventListener('change', () => drawMap3D());
if (showTileTypesCheckbox) showTileTypesCheckbox.addEventListener('change', () => {
  try {
    const pal = document.getElementById('displayTileTypes');
    if (pal) pal.checked = !!showTileTypesCheckbox.checked;
    // if tiles.js exposed palette refresh, call it; otherwise drawMap3D is enough
    if (typeof window.refreshTexturePalette === 'function') window.refreshTexturePalette();
  } catch(e) {}
  drawMap3D();
});
function resizeMap(newW, newH) {
  const oldW = mapW;
  const oldH = mapH;
  const newTiles = Array(newH).fill().map(() => Array(newW).fill(0));
  const newRotationsArr = Array(newH).fill().map(() => Array(newW).fill(0));
  const newHeightsArr = Array(newH).fill().map(() => Array(newW).fill(0));
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      if (y < oldH && x < oldW) {
        newTiles[y][x] = mapTiles[y][x];
        newRotationsArr[y][x] = mapRotations[y][x];
        newHeightsArr[y][x] = mapHeights[y][x];
      }
    }
  }
  mapW = newW;
  mapH = newH;
  mapTiles = newTiles;
  mapRotations = newRotationsArr;
  mapHeights = newHeightsArr;
  const sizeXInput = document.getElementById('sizeXInput');
  const sizeYInput = document.getElementById('sizeYInput');
  if (sizeXInput) sizeXInput.value = newW;
  if (sizeYInput) sizeYInput.value = newH;
  resetCameraTarget(mapW, mapH, threeContainer);
  drawMap3D();
  if (highlightMesh) {
    scene.remove(highlightMesh);
    highlightMesh = null;
  }
  if (previewGroup) {
    previewGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    scene.remove(previewGroup);
    previewGroup = null;
  }
}
function getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH) {
  const centerX = group.userData.centerX;
  const centerZ = group.userData.centerZ;
  const posX = tileX + sizeX / 2 - centerX;
  const posY = minH - group.userData.minY;
  const posZ = tileY + sizeY / 2 - centerZ;
  return new THREE.Vector3(posX, posY, posZ);
}
// --- Repatch: unified objects preview using buildStructureGroup (2025-08-19) ---
function updateHighlight(event) {
  // For textures & height we keep existing behavior
  if (activeTab !== 'objects') {
    return __old_updateHighlight(event);
  }
  if (!threeContainer || !scene) return;
  // If not in objects, original covers it, but double-check
  if (activeTab !== 'objects') return;
  // Read mouse
  let clientX, clientY;
  if (event) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return;
  }
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    if (highlightModelGroup) {
      scene.remove(highlightModelGroup);
      highlightModelGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      highlightModelGroup = null;
    }
    return;
  }
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    if (highlightModelGroup) {
      scene.remove(highlightModelGroup);
      highlightModelGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      highlightModelGroup = null;
    }
    return;
  }
  if (selectedStructureIndex < 0 || !STRUCTURE_DEFS || !STRUCTURE_DEFS.length) {
    return;
  }
  const def = STRUCTURE_DEFS[selectedStructureIndex];
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  if (selectedStructureRotation % 2 === 1) {
    const tmpXY = sizeX;
    sizeX = sizeY;
    sizeY = tmpXY;
  }
  // Ground plane highlight (green)
  let maxH2 = 0;
  let minH2 = Infinity;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
        const h = mapHeights[ty][tx] * HEIGHT_SCALE;
        if (h > maxH2) maxH2 = h;
        if (h < minH2) minH2 = h;
      }
    }
  }
  if (highlightMesh) {
    scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
  if (previewGroup) {
    previewGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    scene.remove(previewGroup);
    previewGroup = null;
  }
  previewGroup = new THREE.Group();
  const planeGeo = new THREE.PlaneGeometry(sizeX, sizeY);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.position.set(tileX + sizeX / 2, maxH2 + 0.02, tileY + sizeY / 2);
  highlightMesh = planeMesh;
  previewGroup.add(planeMesh);
  scene.add(previewGroup);
  // Clear old model preview
  if (highlightModelGroup) {
    scene.remove(highlightModelGroup);
    highlightModelGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    highlightModelGroup = null;
  }
  const thisToken = ++highlightLoadToken;
  // Build unified preview using the same function as final placement
  buildStructureGroup(def, selectedStructureRotation, sizeX, sizeY, null, 0.55)
    .then(group => {
      if (thisToken !== highlightLoadToken) return; // stale
      // Place it by tile center, sit on the minimum ground height
      const baseY = (isFinite(minH2) ? minH2 : 0) + 0.02;
      group.position.set(tileX + sizeX / 2, baseY, tileY + sizeY / 2);
      scene.add(group);
      highlightModelGroup = group;
      highlightCachedId = def.id;
      highlightCachedRot = selectedStructureRotation;
    })
    .catch(err => {
      console.warn("Unified preview failed:", err);
    });
}
// Ensure "Selected Tile" row uses smaller font size and stays in one line
(function(){
  try {
    const idSpan = document.getElementById('selectedTileIdDisplay');
    const parent = idSpan ? idSpan.parentElement : null;
    if (parent) {
      parent.style.whiteSpace = 'nowrap';
      parent.style.fontSize = '12px';
      // also tighten the number span a bit
      idSpan.style.fontSize = '12px';
    }
  } catch(e) {}
})();

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initDom);
} else {
  initDom();
}
