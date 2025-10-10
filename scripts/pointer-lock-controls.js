import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const _euler = new THREE.Euler(0, 0, 0, "YXZ");
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
    return this.camera;
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
    this.camera.updateMatrixWorld();
    _vector.setFromMatrixColumn(this.camera.matrixWorld, 0);
    _vector.crossVectors(this.camera.up, _vector);

    this.camera.position.addScaledVector(_vector, distance);
  }

  moveRight(distance) {
    this.camera.updateMatrixWorld();
    _vector.setFromMatrixColumn(this.camera.matrixWorld, 0);

    this.camera.position.addScaledVector(_vector, distance);
  }

  _onMouseMove(event) {
    if (!this.isLocked) {
      return;
    }

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    _euler.setFromQuaternion(this.camera.quaternion);

    _euler.y -= (movementX * 0.002) * this.pointerSpeed;
    _euler.x -= (movementY * 0.002) * this.pointerSpeed;

    _euler.x = Math.max(
      PI_2 - this.maxPolarAngle,
      Math.min(PI_2 - this.minPolarAngle, _euler.x)
    );

    this.camera.quaternion.setFromEuler(_euler);

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
