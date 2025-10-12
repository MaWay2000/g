import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { PointerLockControls } from "./pointer-lock-controls.js";

export const initScene = (
  canvas,
  {
    onControlsLocked,
    onControlsUnlocked,
    onTerminalOptionSelected,
    onTerminalInteractableChange,
  } = {}
) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 1.6, 8);

  const textureLoader = new THREE.TextureLoader();

  const loadTexture = (path, repeatX = 1, repeatY = 1) => {
    const texture = textureLoader.load(new URL(path, import.meta.url).href);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  const createQuickAccessFallbackTexture = () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
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
  <rect width="1024" height="768" fill="url(#screen-bg)" />
  <rect width="1024" height="768" fill="url(#screen-vignette)" />
  <g fill="none" stroke="#60a5fa" stroke-width="3" opacity="0.28">
    <rect x="40" y="40" width="944" height="688" rx="36" ry="36" />
  </g>
  <g>
    <text x="96" y="116" fill="#94a3b8" fill-opacity="0.82" font-size="44" font-family="'Segoe UI', 'Inter', sans-serif" font-weight="600" letter-spacing="6">TERMINAL</text>
    <text x="96" y="220" fill="#38bdf8" font-size="102" font-family="'Segoe UI', 'Inter', sans-serif" font-weight="700">Quick Access</text>
  </g>
  <line x1="84" y1="256" x2="940" y2="256" stroke="#334155" stroke-opacity="0.55" stroke-width="3" />
  <g font-family="'Segoe UI', 'Inter', sans-serif">
    <g transform="translate(96 292)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">NEWS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Latest mission intelligence</text>
    </g>
    <g transform="translate(96 472)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">WEATHER</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Atmospheric reports</text>
    </g>
    <g transform="translate(96 652)">
      <rect width="832" height="156" rx="28" fill="url(#option-gradient)" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="4" />
      <text x="60" y="68" fill="#e2e8f0" font-size="88" font-weight="700">MISSIONS</text>
      <text x="60" y="120" fill="#94a3b8" fill-opacity="0.85" font-size="48" font-weight="500">Active assignments</text>
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
    const texture = textureLoader.load(
      new URL(path, import.meta.url).href,
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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x7dd3fc, 0.4, 50, 2);
  fillLight.position.set(-6, 4, -5);
  scene.add(fillLight);

  const roomWidth = 20;
  const roomHeight = 10;
  const roomDepth = 20;

  const wallTexture = loadTexture("../images/wallpapers/4.png", 2, 1);
  const oppositeWallTexture = loadTexture("../images/wallpapers/5.png", 2, 1);
  const floorTexture = loadTexture("../images/wallpapers/6.png", 4, 4);
  const ceilingTexture = loadTexture("../images/wallpapers/7.png", 2, 2);

  const roomMaterials = [
    new THREE.MeshStandardMaterial({
      map: wallTexture,
      side: THREE.BackSide,
      roughness: 0.6,
      metalness: 0.1,
    }),
    new THREE.MeshStandardMaterial({
      map: oppositeWallTexture,
      side: THREE.BackSide,
      roughness: 0.65,
      metalness: 0.15,
    }),
    new THREE.MeshStandardMaterial({
      map: ceilingTexture,
      side: THREE.BackSide,
      roughness: 0.8,
      metalness: 0.05,
    }),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      side: THREE.BackSide,
      roughness: 0.9,
      metalness: 0.1,
    }),
    new THREE.MeshStandardMaterial({
      map: wallTexture,
      side: THREE.BackSide,
      roughness: 0.6,
      metalness: 0.1,
    }),
    new THREE.MeshStandardMaterial({
      map: oppositeWallTexture,
      side: THREE.BackSide,
      roughness: 0.65,
      metalness: 0.15,
    }),
  ];

  const roomGeometry = new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth);
  const roomMesh = new THREE.Mesh(roomGeometry, roomMaterials);
  scene.add(roomMesh);

  const createComputerSetup = () => {
    const group = new THREE.Group();

    let quickAccessTextureSize = { width: 1024, height: 768 };
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
      const height = 768;

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
      ];

      const bezelInset = 48;
      const optionHeight = 132;
      const optionSpacing = 28;

      const getDevicePixelRatio = () => {
        if (typeof window === "undefined") {
          return 1;
        }

        const ratio = Number(window.devicePixelRatio);
        return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      };

      const snapToDevicePixel = (value, pixelRatio = getDevicePixelRatio()) =>
        Math.round(value * pixelRatio) / pixelRatio;

      const computeQuickAccessZones = () => {
        const optionX = bezelInset + 40;
        const optionWidth = width - optionX * 2;
        let optionY = bezelInset + 184;

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

        const matrixLineHeight = 44;
        const matrixColumnCount = 18;
        const matrixSpeed = 48;
        const matrixStrings = [
          "1010010110010110",
          "0010110100100101",
          "1101001011010010",
          "0101100101100101",
          "1010010110100101",
          "0101101001011010",
          "1001011010010110",
          "0010110100101101",
        ];

        const zoneStates = quickAccessZones.map((zone, index) => ({
          id: zone.id,
          progress: 0,
          target: 0,
          pulseOffset: index * 0.75,
        }));
        const zoneStateMap = new Map(zoneStates.map((state) => [state.id, state]));

        let hoveredZoneId = null;
        let matrixOffset = 0;
        let needsRedraw = true;

        const renderMatrixOverlay = () => {
          const pixelRatio = getDevicePixelRatio();
          const snap = (value) => snapToDevicePixel(value, pixelRatio);

          context.save();
          drawRoundedRect(innerInset, innerInset, innerWidth, innerHeight, 28);
          context.clip();

          context.globalAlpha = 1;
          context.fillStyle = "rgba(6, 182, 212, 0.06)";
          context.fillRect(innerInset, innerInset, innerWidth, innerHeight);

          const columnSpacing = innerWidth / Math.max(matrixColumnCount - 1, 1);
          context.font = "600 32px 'Share Tech Mono', 'Consolas', 'Courier New', monospace";
          context.textBaseline = "top";

          const totalRows = Math.ceil(innerHeight / matrixLineHeight) + 4;

          for (let column = 0; column < matrixColumnCount; column += 1) {
            const x = snap(innerInset + column * columnSpacing - 24);
            const columnHueShift = (column % 4) * 0.04;
            for (let row = -2; row < totalRows; row += 1) {
              const y = snap(
                innerInset +
                  row * matrixLineHeight +
                  matrixOffset -
                  matrixLineHeight
              );
              const sequence = matrixStrings[(column + row + matrixStrings.length) % matrixStrings.length];
              const brightness = 0.12 + columnHueShift + ((row + column) % 3) * 0.03;
              context.fillStyle = `rgba(45, 212, 191, ${Math.min(brightness, 0.35).toFixed(
                3
              )})`;
              context.fillText(sequence, x, y);
            }
          }

          context.globalAlpha = 1;
          context.fillStyle = "rgba(2, 6, 23, 0.45)";
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

          context.save();
          context.strokeStyle = "rgba(56, 189, 248, 0.18)";
          context.lineWidth = 2;
          context.setLineDash([12, 10]);
          context.beginPath();
          context.moveTo(bezelInset + 32, bezelInset + 160);
          context.lineTo(width - (bezelInset + 32), bezelInset + 160);
          context.stroke();
          context.restore();

          context.fillStyle = "rgba(148, 163, 184, 0.7)";
          context.font = "600 28px 'Segoe UI', 'Inter', sans-serif";
          context.textBaseline = "middle";
          context.fillText("TERMINAL", bezelInset + 36, bezelInset + 48);

          context.fillStyle = "#38bdf8";
          context.font = "700 70px 'Segoe UI', 'Inter', sans-serif";
          context.fillText("Quick Access", bezelInset + 36, bezelInset + 132);

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
            const previousOffset = matrixOffset;
            matrixOffset = (matrixOffset + delta * matrixSpeed) % matrixLineHeight;
            const pixelRatio = getDevicePixelRatio();
            const snappedPrevious = snapToDevicePixel(previousOffset, pixelRatio);
            const snappedCurrent = snapToDevicePixel(matrixOffset, pixelRatio);
            if (Math.abs(snappedPrevious - snappedCurrent) > 0.001) {
              needsRedraw = true;
            }

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

            if (!needsRedraw) {
              return;
            }

            render(elapsedTime);
            texture.needsUpdate = true;
            needsRedraw = false;
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
    frontPanel.position.set(towerX + 0.02, tower.position.y + 0.06, towerZ + 0.3);
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
    powerLight.position.set(towerX + 0.16, tower.position.y + 0.22, towerZ + 0.38);
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

    group.userData.monitorScreen = monitorScreen;
    group.scale.setScalar(2.5);

    return group;
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
  computerSetup.position.set(3, -roomHeight / 2, -6);
  scene.add(computerSetup);

  const lastUpdatedDisplay = createLastUpdatedDisplay();
  lastUpdatedDisplay.position.set(-roomWidth / 2 + 0.12, 3.2, 0);
  lastUpdatedDisplay.rotation.y = Math.PI / 2;
  scene.add(lastUpdatedDisplay);

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
  floorGrid.position.y = -roomHeight / 2 + 0.02;
  scene.add(floorGrid);

  const backWallGrid = createGridLines(roomWidth, roomHeight, 20, 10, gridColor, gridOpacity);
  backWallGrid.position.z = -roomDepth / 2 + 0.02;
  scene.add(backWallGrid);

  const frontWallGrid = createGridLines(roomWidth, roomHeight, 20, 10, gridColor, gridOpacity);
  frontWallGrid.rotation.y = Math.PI;
  frontWallGrid.position.z = roomDepth / 2 - 0.02;
  scene.add(frontWallGrid);

  const leftWallGrid = createGridLines(roomDepth, roomHeight, 20, 10, gridColor, gridOpacity);
  leftWallGrid.rotation.y = Math.PI / 2;
  leftWallGrid.position.x = -roomWidth / 2 + 0.02;
  scene.add(leftWallGrid);

  const rightWallGrid = createGridLines(roomDepth, roomHeight, 20, 10, gridColor, gridOpacity);
  rightWallGrid.rotation.y = -Math.PI / 2;
  rightWallGrid.position.x = roomWidth / 2 - 0.02;
  scene.add(rightWallGrid);

  const raycaster = new THREE.Raycaster();
  const quickAccessInteractables = [];
  const MAX_TERMINAL_INTERACTION_DISTANCE = 6.8;

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

  const controls = new PointerLockControls(camera, canvas);
  scene.add(controls.getObject());
  controls.getObject().position.set(0, 1.6, 8);

  controls.addEventListener("lock", () => {
    if (typeof onControlsLocked === "function") {
      onControlsLocked();
    }
  });

  controls.addEventListener("unlock", () => {
    if (typeof onControlsUnlocked === "function") {
      onControlsUnlocked();
    }

    updateTerminalInteractableState(false);
  });

  const attemptPointerLock = () => {
    if (!controls.isLocked) {
      canvas.focus();
      controls.lock();
    }
  };

  canvas.addEventListener("click", attemptPointerLock);
  canvas.addEventListener("pointerdown", attemptPointerLock);

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
    if (!controls.isLocked || quickAccessInteractables.length === 0) {
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
  };

  let movementEnabled = true;

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const clock = new THREE.Clock();

  const setMovementEnabled = (enabled) => {
    movementEnabled = Boolean(enabled);

    if (!movementEnabled) {
      movementState.forward = false;
      movementState.backward = false;
      movementState.left = false;
      movementState.right = false;
      velocity.set(0, 0, 0);
    }
  };

  const updateMovementState = (code, value) => {
    if (!movementEnabled && value) {
      return;
    }

    switch (code) {
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
      default:
        break;
    }
  };

  const onKeyDown = (event) => {
    if (!movementEnabled) {
      return;
    }

    updateMovementState(event.code, true);

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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event) => {
    updateMovementState(event.code, false);
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  const clampWithinRoom = () => {
    const player = controls.getObject().position;
    const halfWidth = roomWidth / 2 - 1;
    const halfDepth = roomDepth / 2 - 1;
    player.x = THREE.MathUtils.clamp(player.x, -halfWidth, halfWidth);
    player.z = THREE.MathUtils.clamp(player.z, -halfDepth, halfDepth);
    player.y = 1.6;
  };

  const animate = () => {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (movementEnabled) {
      velocity.x -= velocity.x * 8 * delta;
      velocity.z -= velocity.z * 8 * delta;

      direction.z =
        Number(movementState.forward) - Number(movementState.backward);
      direction.x = Number(movementState.right) - Number(movementState.left);

      if (direction.lengthSq() > 0) {
        direction.normalize();
      }

      if (movementState.forward || movementState.backward) {
        velocity.z -= direction.z * 40 * delta;
      }

      if (movementState.left || movementState.right) {
        velocity.x -= direction.x * 40 * delta;
      }

      if (controls.isLocked) {
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        clampWithinRoom();
      }
    } else {
      velocity.set(0, 0, 0);
    }

    let matchedZone = null;

    if (controls.isLocked) {
      matchedZone = getTargetedTerminalZone();
      updateTerminalInteractableState(Boolean(matchedZone));
    } else {
      updateTerminalInteractableState(false);
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

    renderer.render(scene, camera);
  };

  animate();

  const handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  window.addEventListener("resize", handleResize);

  return {
    scene,
    camera,
    renderer,
    controls,
    setMovementEnabled,
    dispose: () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", attemptPointerLock);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("pointerdown", attemptPointerLock);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      updateTerminalInteractableState(false);
      if (typeof lastUpdatedDisplay.userData?.dispose === "function") {
        lastUpdatedDisplay.userData.dispose();
      }
    },
  };
};
