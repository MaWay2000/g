import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { PointerLockControls } from "./pointer-lock-controls.js";

export const initScene = (
  canvas,
  { onControlsLocked, onControlsUnlocked } = {}
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

    const retroComputerGroup = new THREE.Group();
    retroComputerGroup.position.set(0.08, deskHeight + deskTopThickness + 0.02, -0.1);

    const retroHousingMaterial = new THREE.MeshStandardMaterial({
      color: 0x101827,
      roughness: 0.55,
      metalness: 0.18,
    });

    const retroAccentMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2a3d,
      roughness: 0.48,
      metalness: 0.2,
    });

    const crtWidth = 1.3;
    const crtHeight = 0.92;
    const crtDepth = 0.9;
    const crtBody = new THREE.Mesh(
      new THREE.BoxGeometry(crtWidth, crtHeight, crtDepth),
      retroHousingMaterial
    );
    crtBody.position.set(0, 0.52, 0.16);
    retroComputerGroup.add(crtBody);

    const crtFrontInset = new THREE.Mesh(
      new THREE.BoxGeometry(crtWidth * 0.88, crtHeight * 0.84, 0.16),
      retroAccentMaterial
    );
    crtFrontInset.position.set(0, 0.52, 0.54);
    retroComputerGroup.add(crtFrontInset);

    const screenWidth = crtWidth * 0.72;
    const screenHeight = crtHeight * 0.6;
    const screenTexture = loadClampedTexture("../images/index/monitor2 old.png");
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
      transparent: true,
    });
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth, screenHeight),
      screenMaterial
    );
    screenMesh.position.set(0, 0.54, crtBody.position.z + crtDepth / 2 + 0.01);
    screenMesh.renderOrder = 1;
    retroComputerGroup.add(screenMesh);

    const screenFrame = new THREE.Mesh(
      new THREE.BoxGeometry(crtWidth * 0.9, crtHeight * 0.78, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.65,
        metalness: 0.12,
      })
    );
    screenFrame.position.set(0, 0.53, crtBody.position.z + crtDepth / 2);
    retroComputerGroup.add(screenFrame);

    const screenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(screenWidth * 1.05, screenHeight * 1.05),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
      })
    );
    screenGlow.position.copy(screenMesh.position);
    screenGlow.position.z += 0.01;
    retroComputerGroup.add(screenGlow);

    const crtBackVent = new THREE.Mesh(
      new THREE.BoxGeometry(crtWidth * 0.7, 0.1, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.6,
        metalness: 0.1,
      })
    );
    crtBackVent.position.set(0, 0.92, -0.12);
    retroComputerGroup.add(crtBackVent);

    const crtBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.16, 0.72),
      retroAccentMaterial
    );
    crtBase.position.set(0, 0.15, -0.12);
    retroComputerGroup.add(crtBase);

    const keyboardBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.32, 0.12, 1.1),
      retroHousingMaterial
    );
    keyboardBase.position.set(-0.05, -0.05, -0.22);
    retroComputerGroup.add(keyboardBase);

    const keyboardDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.04, 1.02),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.6,
        metalness: 0.15,
      })
    );
    keyboardDeck.position.set(-0.05, 0.01, -0.24);
    retroComputerGroup.add(keyboardDeck);

    const keyRows = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.02, 0.82),
      new THREE.MeshStandardMaterial({
        color: 0x1f2a3e,
        roughness: 0.45,
        metalness: 0.2,
      })
    );
    keyRows.position.set(-0.05, 0.06, -0.3);
    keyRows.rotation.x = -Math.PI / 12;
    retroComputerGroup.add(keyRows);

    const functionRow = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.015, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x24334a,
        roughness: 0.4,
        metalness: 0.18,
      })
    );
    functionRow.position.set(-0.05, 0.1, 0.02);
    functionRow.rotation.x = -Math.PI / 18;
    retroComputerGroup.add(functionRow);

    const controlPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.015, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color(0x0d9488),
        emissiveIntensity: 0.18,
      })
    );
    controlPad.position.set(0.52, 0.08, 0.2);
    controlPad.rotation.x = -Math.PI / 18;
    retroComputerGroup.add(controlPad);

    const floppyDrive = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.04, 0.3),
      retroAccentMaterial
    );
    floppyDrive.position.set(-0.48, 0.04, 0.32);
    floppyDrive.rotation.x = -Math.PI / 14;
    retroComputerGroup.add(floppyDrive);

    const floppySlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.01, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.5,
        metalness: 0.1,
      })
    );
    floppySlot.position.set(-0.48, 0.08, 0.42);
    floppySlot.rotation.x = -Math.PI / 14;
    retroComputerGroup.add(floppySlot);

    const powerButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 0.35,
        metalness: 0.3,
        roughness: 0.3,
      })
    );
    powerButton.rotation.x = Math.PI / 2;
    powerButton.position.set(0.58, 0.08, 0.44);
    retroComputerGroup.add(powerButton);

    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.4,
        metalness: 0.3,
        emissive: new THREE.Color(0x1e293b),
        emissiveIntensity: 0.2,
        side: THREE.DoubleSide,
      })
    );
    badge.position.set(-0.02, 0.12, crtBody.position.z + crtDepth / 2 + 0.18);
    retroComputerGroup.add(badge);

    group.add(retroComputerGroup);

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
  lastUpdatedDisplay.position.set(3.2, 3.2, -roomDepth / 2 + 0.12);
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
  });

  const attemptPointerLock = () => {
    if (!controls.isLocked) {
      canvas.focus();
      controls.lock();
    }
  };

  canvas.addEventListener("click", attemptPointerLock);
  canvas.addEventListener("pointerdown", attemptPointerLock);

  const movementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const clock = new THREE.Clock();

  const updateMovementState = (code, value) => {
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

    velocity.x -= velocity.x * 8 * delta;
    velocity.z -= velocity.z * 8 * delta;

    direction.z = Number(movementState.forward) - Number(movementState.backward);
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
    dispose: () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", attemptPointerLock);
      canvas.removeEventListener("pointerdown", attemptPointerLock);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (typeof lastUpdatedDisplay.userData?.dispose === "function") {
        lastUpdatedDisplay.userData.dispose();
      }
    },
  };
};
