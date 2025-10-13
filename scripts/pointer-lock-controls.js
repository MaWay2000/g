import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const _vector = new THREE.Vector3();
const CHANGE_EVENT = { type: "change" };
const LOCK_EVENT = { type: "lock" };
const UNLOCK_EVENT = { type: "unlock" };
const PI_2 = Math.PI / 2;

export class PointerLockControls extends THREE.EventDispatcher {
  constructor(camera, domElement = document.body) {
    super();

    this.domElement = domElement;
    this.camera = camera;
    this.isLocked = false;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.pointerSpeed = 1.0;

    this.camera.rotation.set(0, 0, 0);

    this._cameraOffset = new THREE.Vector3();

    const initialCameraPosition = camera.position.clone();

    this._yawObject = new THREE.Group();
    this._yawObject.rotation.order = "YXZ";
    this._yawObject.position.copy(initialCameraPosition);

    this._pitchObject = new THREE.Group();
    this._pitchObject.rotation.order = "YXZ";
    this._yawObject.add(this._pitchObject);
    this._pitchObject.add(this.camera);

    this.setCameraOffset(initialCameraPosition.set(0, 0, 0));

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerlockChange = this._onPointerlockChange.bind(this);
    this._onPointerlockError = this._onPointerlockError.bind(this);

    this.connect();
  }

  connect() {
    const ownerDocument = this.domElement.ownerDocument;

    if (!ownerDocument) {
      return;
    }

    ownerDocument.addEventListener("mousemove", this._onMouseMove);
    ownerDocument.addEventListener(
      "pointerlockchange",
      this._onPointerlockChange
    );
    ownerDocument.addEventListener(
      "pointerlockerror",
      this._onPointerlockError
    );
  }

  disconnect() {
    const ownerDocument = this.domElement.ownerDocument;

    if (!ownerDocument) {
      return;
    }

    ownerDocument.removeEventListener("mousemove", this._onMouseMove);
    ownerDocument.removeEventListener(
      "pointerlockchange",
      this._onPointerlockChange
    );
    ownerDocument.removeEventListener(
      "pointerlockerror",
      this._onPointerlockError
    );
  }

  dispose() {
    this.disconnect();
  }

  getObject() {
    return this._yawObject;
  }

  lock() {
    const { domElement } = this;

    if (domElement?.requestPointerLock) {
      domElement.requestPointerLock();
    }
  }

  unlock() {
    const ownerDocument = this.domElement.ownerDocument;

    if (ownerDocument?.exitPointerLock) {
      ownerDocument.exitPointerLock();
    }
  }

  moveForward(distance) {
    this._yawObject.updateMatrixWorld(true);
    _vector.setFromMatrixColumn(this._yawObject.matrixWorld, 0);
    _vector.crossVectors(this._yawObject.up, _vector);
    _vector.y = 0;
    _vector.normalize();

    this._yawObject.position.addScaledVector(_vector, distance);
  }

  moveRight(distance) {
    this._yawObject.updateMatrixWorld(true);
    _vector.setFromMatrixColumn(this._yawObject.matrixWorld, 0);
    _vector.y = 0;
    _vector.normalize();

    this._yawObject.position.addScaledVector(_vector, distance);
  }

  getPitch() {
    return this._pitchObject.rotation.x;
  }

  setPitch(value) {
    if (!Number.isFinite(value)) {
      return;
    }

    const min = PI_2 - this.maxPolarAngle;
    const max = PI_2 - this.minPolarAngle;
    this._pitchObject.rotation.x = THREE.MathUtils.clamp(value, min, max);
  }

  getYaw() {
    return this._yawObject.rotation.y;
  }

  setYaw(value) {
    if (!Number.isFinite(value)) {
      return;
    }

    this._yawObject.rotation.y = value;
  }

  getCameraOffset(target = new THREE.Vector3()) {
    target.copy(this._cameraOffset);
    return target;
  }

  setCameraOffset(offset) {
    if (offset instanceof THREE.Vector3) {
      this._cameraOffset.copy(offset);
    } else {
      this._cameraOffset.set(0, 0, 0);
    }

    this.camera.position.copy(this._cameraOffset);
  }

  _onMouseMove(event) {
    if (!this.isLocked) {
      return;
    }

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    const yawDelta = (movementX * 0.002) * this.pointerSpeed;
    const pitchDelta = (movementY * 0.002) * this.pointerSpeed;

    this._yawObject.rotation.y -= yawDelta;
    this.setPitch(this._pitchObject.rotation.x - pitchDelta);

    this.dispatchEvent(CHANGE_EVENT);
  }

  _onPointerlockChange() {
    const ownerDocument = this.domElement.ownerDocument;

    if (!ownerDocument) {
      return;
    }

    if (ownerDocument.pointerLockElement === this.domElement) {
      this.isLocked = true;
      this.dispatchEvent(LOCK_EVENT);
    } else {
      this.isLocked = false;
      this.dispatchEvent(UNLOCK_EVENT);
    }
  }

  _onPointerlockError() {
    console.error("PointerLockControls: Unable to use Pointer Lock API");
  }
}
