import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

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

  const loadClampedTexture = (path) => {
    const texture = textureLoader.load(new URL(path, import.meta.url).href);
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

    const deskHeight = 0.75;
    const deskTopThickness = 0.08;
    const deskWidth = 2.8;
    const deskDepth = 1.2;

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

    const legGeometry = new THREE.BoxGeometry(0.12, deskHeight, 0.12);
    const legPositions = [
      [-deskWidth / 2 + 0.2, deskHeight / 2, -deskDepth / 2 + 0.2],
      [deskWidth / 2 - 0.2, deskHeight / 2, -deskDepth / 2 + 0.2],
      [-deskWidth / 2 + 0.2, deskHeight / 2, deskDepth / 2 - 0.2],
      [deskWidth / 2 - 0.2, deskHeight / 2, deskDepth / 2 - 0.2],
    ];

    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeometry, deskMaterial);
      leg.position.set(x, y, z);
      group.add(leg);
    });

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0, deskHeight + deskTopThickness, -0.1);

    const monitorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.35,
      roughness: 0.35,
    });

    const monitorBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.08),
      monitorMaterial
    );
    monitorBack.position.y = 0.45;
    monitorGroup.add(monitorBack);

    const screenTexture = loadClampedTexture("../images/index/monitor2.png");
    const monitorScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.6),
      new THREE.MeshBasicMaterial({ map: screenTexture, transparent: true })
    );
    monitorScreen.position.set(0, 0.45, 0.045);
    monitorGroup.add(monitorScreen);

    const monitorStand = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.4, 0.12),
      monitorMaterial
    );
    monitorStand.position.set(0, 0.2, 0.01);
    monitorGroup.add(monitorStand);

    const monitorBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.4),
      monitorMaterial
    );
    monitorBase.position.set(0, 0.025, 0.05);
    monitorGroup.add(monitorBase);

    group.add(monitorGroup);

    const keyboard = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 0.35),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.2,
        roughness: 0.6,
      })
    );
    keyboard.position.set(0, deskHeight + deskTopThickness + 0.03, 0.2);
    group.add(keyboard);

    const mouse = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.05, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
    );
    mouse.position.set(0.8, deskHeight + deskTopThickness + 0.025, 0.25);
    mouse.rotation.y = Math.PI / 10;
    group.add(mouse);

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.8, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0x0b1120,
        roughness: 0.5,
        metalness: 0.25,
      })
    );
    tower.position.set(-deskWidth / 2 + 0.4, 0.4, 0.15);
    group.add(tower);

    const frontPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        emissive: new THREE.Color(0x1f2937),
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide,
      })
    );
    frontPanel.position.set(tower.position.x, 0.45, 0.4);
    group.add(frontPanel);

    const ventGeometry = new THREE.BoxGeometry(0.34, 0.02, 0.02);
    const ventMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.2,
    });

    for (let i = 0; i < 4; i += 1) {
      const vent = new THREE.Mesh(ventGeometry, ventMaterial);
      vent.position.set(tower.position.x, 0.2 + i * 0.08, 0.44);
      group.add(vent);
    }

    const powerLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    powerLight.position.set(tower.position.x + 0.12, 0.58, 0.48);
    group.add(powerLight);

    return group;
  };

  const computerSetup = createComputerSetup();
  computerSetup.position.set(3, -roomHeight / 2, -6);
  scene.add(computerSetup);

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
    },
  };
};
