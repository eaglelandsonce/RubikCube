import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const controlsContainer = document.querySelector("#face-controls");
const scrambleButton = document.querySelector("#scramble");
const resetButton = document.querySelector("#reset");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1320");
scene.fog = new THREE.Fog("#0b1320", 14, 28);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(6.5, 5.5, 8.5);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 15;
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight("#dfefff", "#0a1120", 1.05);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight("#ffffff", 1.3);
keyLight.position.set(8, 11, 10);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight("#63c6ff", 0.5);
rimLight.position.set(-7, 5, -8);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 72),
  new THREE.MeshStandardMaterial({
    color: "#0f1f33",
    roughness: 0.95,
    metalness: 0.05,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.4;
scene.add(floor);

const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const TURN_SPEED = 5.8;
const CUBIE_SIZE = 0.92;
const SPACING = 1.02;

const COLORS = {
  right: "#e23f38",
  left: "#f07f2f",
  up: "#f3f6fa",
  down: "#ffd046",
  front: "#2f75ff",
  back: "#31b56e",
  core: "#090d15",
};

const FACE_MOVES = {
  F: { axis: "z", layer: 1, sign: 1 },
  B: { axis: "z", layer: -1, sign: -1 },
  R: { axis: "x", layer: 1, sign: 1 },
  L: { axis: "x", layer: -1, sign: -1 },
  U: { axis: "y", layer: 1, sign: 1 },
  D: { axis: "y", layer: -1, sign: -1 },
};

const cubies = [];
const moveQueue = [];
let activeMove = null;

function createFaceMaterial(stickerColor) {
  return new THREE.MeshStandardMaterial({
    color: stickerColor,
    roughness: 0.48,
    metalness: 0.05,
  });
}

function createCubie(gx, gy, gz) {
  const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
  const materials = [
    createFaceMaterial(gx === 1 ? COLORS.right : COLORS.core),
    createFaceMaterial(gx === -1 ? COLORS.left : COLORS.core),
    createFaceMaterial(gy === 1 ? COLORS.up : COLORS.core),
    createFaceMaterial(gy === -1 ? COLORS.down : COLORS.core),
    createFaceMaterial(gz === 1 ? COLORS.front : COLORS.core),
    createFaceMaterial(gz === -1 ? COLORS.back : COLORS.core),
  ];

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(gx * SPACING, gy * SPACING, gz * SPACING);
  mesh.userData.grid = new THREE.Vector3(gx, gy, gz);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: "#02050b" })
  );
  mesh.add(edge);

  cubies.push(mesh);
  cubeGroup.add(mesh);
}

function clearCube() {
  for (const cubie of cubies) {
    cubie.geometry.dispose();
    for (const material of cubie.material) {
      material.dispose();
    }
    if (cubie.children[0]) {
      cubie.children[0].geometry.dispose();
      cubie.children[0].material.dispose();
    }
    cubeGroup.remove(cubie);
  }
  cubies.length = 0;
}

function buildCube() {
  clearCube();
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        createCubie(x, y, z);
      }
    }
  }
}

function roundToGrid(value) {
  if (Math.abs(value) < 0.0001) {
    return 0;
  }
  return Math.round(value);
}

function snapCubie(cubie) {
  const grid = cubie.userData.grid;
  cubie.position.set(grid.x * SPACING, grid.y * SPACING, grid.z * SPACING);

  const euler = new THREE.Euler().setFromQuaternion(cubie.quaternion, "XYZ");
  const rightAngle = Math.PI / 2;
  euler.x = Math.round(euler.x / rightAngle) * rightAngle;
  euler.y = Math.round(euler.y / rightAngle) * rightAngle;
  euler.z = Math.round(euler.z / rightAngle) * rightAngle;
  cubie.quaternion.setFromEuler(euler);
}

function queueMove(face, prime = false) {
  const def = FACE_MOVES[face];
  if (!def) {
    return;
  }

  const angleSign = prime ? -1 : 1;
  const turn = angleSign * def.sign;

  moveQueue.push({
    face,
    prime,
    axis: def.axis,
    layer: def.layer,
    targetAngle: turn * (Math.PI / 2),
  });
  setStatus(`Queued: ${face}${prime ? "'" : ""} (${moveQueue.length} waiting)`);
}

function beginNextMove() {
  if (activeMove || moveQueue.length === 0) {
    return;
  }

  const next = moveQueue.shift();
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  const layerCubies = cubies.filter(
    (cubie) => roundToGrid(cubie.userData.grid[next.axis]) === next.layer
  );

  for (const cubie of layerCubies) {
    pivot.attach(cubie);
  }

  activeMove = {
    ...next,
    pivot,
    layerCubies,
    progressed: 0,
  };
}

function completeMove(move) {
  const axisVector =
    move.axis === "x"
      ? new THREE.Vector3(1, 0, 0)
      : move.axis === "y"
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);

  for (const cubie of move.layerCubies) {
    cubeGroup.attach(cubie);
    cubie.userData.grid.applyAxisAngle(axisVector, move.targetAngle);
    cubie.userData.grid.set(
      roundToGrid(cubie.userData.grid.x),
      roundToGrid(cubie.userData.grid.y),
      roundToGrid(cubie.userData.grid.z)
    );
    snapCubie(cubie);
  }

  cubeGroup.remove(move.pivot);
  setStatus(`Move: ${move.face}${move.prime ? "'" : ""}`);
}

function updateMove(deltaSeconds) {
  if (!activeMove) {
    beginNextMove();
    return;
  }

  const remaining = activeMove.targetAngle - activeMove.progressed;
  const stepMagnitude = TURN_SPEED * deltaSeconds;
  const step = Math.sign(remaining) * Math.min(Math.abs(remaining), stepMagnitude);

  activeMove.pivot.rotation[activeMove.axis] += step;
  activeMove.progressed += step;

  if (Math.abs(activeMove.targetAngle - activeMove.progressed) < 0.00001) {
    completeMove(activeMove);
    activeMove = null;
  }
}

function parseMove(moveText) {
  const face = moveText[0];
  const prime = moveText.includes("'");
  return { face, prime };
}

function scrambleCube(turns = 25) {
  const faces = ["F", "B", "R", "L", "U", "D"];
  let previousFace = "";

  for (let i = 0; i < turns; i += 1) {
    let face = faces[Math.floor(Math.random() * faces.length)];
    while (face === previousFace) {
      face = faces[Math.floor(Math.random() * faces.length)];
    }

    previousFace = face;
    const prime = Math.random() > 0.5;
    queueMove(face, prime);
  }

  setStatus(`Scramble queued (${turns} turns)`);
}

function hardReset() {
  moveQueue.length = 0;
  activeMove = null;

  for (let i = cubeGroup.children.length - 1; i >= 0; i -= 1) {
    const child = cubeGroup.children[i];
    if (child.type === "Group") {
      cubeGroup.remove(child);
    }
  }

  buildCube();
  setStatus("Cube reset");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function createControls() {
  const labels = ["F", "B", "R", "L", "U", "D"];
  const buttons = [];

  for (const face of labels) {
    buttons.push(face, `${face}'`);
  }

  controlsContainer.innerHTML = "";
  for (const move of buttons) {
    const button = document.createElement("button");
    button.className = "btn";
    button.textContent = move;
    button.dataset.move = move;
    button.addEventListener("click", () => {
      const parsed = parseMove(move);
      queueMove(parsed.face, parsed.prime);
    });
    controlsContainer.appendChild(button);
  }
}

function onResize() {
  const viewer = canvas.parentElement;
  const width = Math.max(320, viewer.clientWidth);
  const height = Math.max(320, viewer.clientHeight);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);
}

window.addEventListener("resize", onResize);

window.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();
  if (!FACE_MOVES[key]) {
    return;
  }

  queueMove(key, event.shiftKey);
});

scrambleButton.addEventListener("click", () => {
  scrambleCube(25);
});

resetButton.addEventListener("click", () => {
  hardReset();
});

createControls();
buildCube();
onResize();
setStatus("Ready");

const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  updateMove(delta);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();