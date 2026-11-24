import * as THREE from
"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const container = document.querySelector("#game");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x83c7e5);
scene.fog = new THREE.Fog(0x83c7e5, 30, 110);

const camera = new THREE.PerspectiveCamera(
  75, innerWidth / innerHeight, 0.1, 150
);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

container.appendChild(renderer.domElement);

// LIGHTS

scene.add(new THREE.HemisphereLight(
  0xe7f5ff, 0x536a3f, 2
));

const sunlight = new THREE.DirectionalLight(
  0xffe6b3, 2.5
);

sunlight.position.set(-20, 35, 15);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
scene.add(sunlight);

// MATERIALS

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x70ad50 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x93613e }),
  stone: new THREE.MeshStandardMaterial({ color: 0x92999b }),
  wood: new THREE.MeshStandardMaterial({ color: 0x80502e }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x367d3e }),
  sand: new THREE.MeshStandardMaterial({ color: 0xe0ca87 }),
  snow: new THREE.MeshStandardMaterial({ color: 0xe7eeee })
};

const cube = new THREE.BoxGeometry(1, 1, 1);

const blocks = new Map();
const chunkSize = 16;
const loadedChunks = new Set();

let playing = false;
let locked = false;
let paused = false;
let mode = "creative";
let cameraMode = 0;
let selectedBlock = "grass";

const player = {
  x: 0,
  y: 5,
  z: 8,
  vy: 0,
  yaw: 0,
  pitch: 0,
  onGround: false
};

const blockTypes = [
  "grass", "dirt", "stone",
  "wood", "leaves", "sand"
];

const icons = ["🟩", "🟫", "⬜", "🪵", "🌿", "🟨"];

const key = (x, y, z) => `${x},${y},${z}`;

function addBlock(x, y, z, type = "grass") {
  const id = key(x, y, z);

  if (blocks.has(id)) return;

  const mesh = new THREE.Mesh(
    cube,
    materials[type] || materials.grass
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.userData = { x, y, z, type };

  scene.add(mesh);
  blocks.set(id, mesh);
}

function removeBlock(mesh) {
  const d = mesh.userData;

  scene.remove(mesh);
  blocks.delete(key(d.x, d.y, d.z));
}

function terrainHeight(x, z) {
  return Math.floor(
    2 * Math.sin(x * .12) +
    2 * Math.cos(z * .13) +
    Math.sin((x + z) * .08)
  );
}

// SIMPLE TREE GENERATION

function makeTree(x, y, z) {
  for (let i = 0; i < 4; i++) {
    addBlock(x, y + i, z, "wood");
  }

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 2; dy <= 4; dy++) {
        if (Math.abs(dx) + Math.abs(dz) < 4) {
          addBlock(x + dx, y + dy, z + dz, "leaves");
        }
      }
    }
  }
}

// CHUNK GENERATION

function generateChunk(cx, cz) {
  const id = `${cx},${cz}`;

  if (loadedChunks.has(id)) return;

  loadedChunks.add(id);

  for (let x = cx * chunkSize; x < (cx + 1) * chunkSize; x++) {
    for (let z = cz * chunkSize; z < (cz + 1) * chunkSize; z++) {

      const h = terrainHeight(x, z);

      for (let y = -3; y <= h; y++) {
        const type =
          y === h ? "grass" :
          y < -1 ? "stone" : "dirt";

        addBlock(x, y, z, type);
      }

      if (
        Math.abs(x * 17 + z * 31) % 97 === 0 &&
        Math.abs(x) > 3 &&
        Math.abs(z) > 3
      ) {
        makeTree(x, h + 1, z);
      }
    }
  }
}

function updateChunks() {
  const cx = Math.floor(player.x / chunkSize);
  const cz = Math.floor(player.z / chunkSize);

  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      generateChunk(x, z);
    }
  }
}

// WATER

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({
    color: 0x3dadd2,
    transparent: true,
    opacity: .8,
    roughness: .25
  })
);

water.rotation.x = -Math.PI / 2;
water.position.set(25, -2, -20);
scene.add(water);

// HOTBAR

const hotbar = document.querySelector("#hotbar");

blockTypes.forEach((type, i) => {
  const slot = document.createElement("div");

  slot.className = "slot" + (i === 0 ? " active" : "");
  slot.textContent = icons[i];

  slot.addEventListener("click", () => selectBlock(type, i));

  hotbar.appendChild(slot);
});

function selectBlock(type, index) {
  selectedBlock = type;

  [...hotbar.children].forEach((slot, i) => {
    slot.classList.toggle("active", i === index);
  });
}

// RAYCASTING

const raycaster = new THREE.Raycaster();

raycaster.far = 7;

function getTarget() {
  raycaster.setFromCamera(
    new THREE.Vector2(0, 0), camera
  );

  return raycaster.intersectObjects(
    [...blocks.values()]
  )[0];
}

function breakBlock() {
  const hit = getTarget();

  if (!hit || hit.object.userData.y < -3) return;

  removeBlock(hit.object);
  syncBlock("remove", hit.object.userData);
}

function placeBlock() {
  const hit = getTarget();

  if (!hit) return;

  const p = hit.object.position.clone()
    .add(hit.face.normal);

  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const z = Math.round(p.z);

  if (
    Math.abs(x - player.x) < .8 &&
    Math.abs(z - player.z) < .8 &&
    Math.abs(y - player.y) < 2
  ) return;

  addBlock(x, y, z, selectedBlock);

  syncBlock("add", {
    x, y, z, type: selectedBlock
  });
}

// MULTIPLAYER CONNECTION

let socket = null;
const otherPlayers = new Map();

function connectMultiplayer() {
  if (typeof io === "undefined") {
    console.warn("Multiplayer server not connected.");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    console.log("Connected to BLOCKVERSE server");
  });

  socket.on("players", players => {
    for (const [id, p] of Object.entries(players)) {
      if (id !== socket.id) addOtherPlayer(id, p);
    }
  });

  socket.on("playerJoined", data => {
    if (data.id !== socket.id) addOtherPlayer(data.id, data);
  });

  socket.on("playerMoved", data => {
    const mesh = otherPlayers.get(data.id);

    if (mesh) {
      mesh.position.set(data.x, data.y, data.z);
    }
  });

  socket.on("playerLeft", id => {
    const mesh = otherPlayers.get(id);

    if (mesh) scene.remove(mesh);

    otherPlayers.delete(id);
  });

  socket.on("blockChanged", data => {
    if (data.action === "remove") {
      const mesh = blocks.get(key(data.x, data.y, data.z));
      if (mesh) removeBlock(mesh);
    } else {
      addBlock(data.x, data.y, data.z, data.type);
    }
  });
}

function addOtherPlayer(id, data) {
  if (otherPlayers.has(id)) return;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(.7, 1.8, .7),
    new THREE.MeshStandardMaterial({ color: 0x4979ad })
  );

  mesh.position.set(data.x || 0, data.y || 3, data.z || 0);

  scene.add(mesh);
  otherPlayers.set(id, mesh);
}

function syncBlock(action, data) {
  if (socket?.connected) {
    socket.emit("blockChange", { action, ...data });
  }
}

// CONTROLS

const keys = {};

document.addEventListener("keydown", e => {
  keys[e.code] = true;

  if (e.code.startsWith("Digit")) {
    const i = Number(e.code.slice(5)) - 1;
    if (blockTypes[i]) selectBlock(blockTypes[i], i);
  }

  if (e.code === "F5" && playing) {
    e.preventDefault();
    cameraMode = (cameraMode + 1) % 2;
  }

  if (e.code === "Escape" && playing) {
    paused = true;
    document.exitPointerLock();
    document.querySelector("#pause").classList.remove("hidden");
  }
});

document.addEventListener("keyup", e => {
  keys[e.code] = false;
});

renderer.domElement.addEventListener("click", () => {
  if (playing && !paused) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener("mousemove", e => {
  if (!locked) return;

  player.yaw -= e.movementX * .002;
  player.pitch -= e.movementY * .002;

  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch));
});

document.addEventListener("contextmenu", e => {
  if (playing) e.preventDefault();
});

document.addEventListener("mousedown", e => {
  if (!playing || !locked) return;

  if (e.button === 0) breakBlock();
  if (e.button === 2) placeBlock();
});

// SAVE SYSTEM

function saveWorld() {
  const data = {
    name: document.querySelector("#worldName").value,
    mode,
    player,
    blocks: [...blocks.values()].map(mesh => mesh.userData)
  };

  localStorage.setItem("blockverse-world", JSON.stringify(data));

  alert("World saved successfully!");
}

function loadWorld() {
  const saved = localStorage.getItem("blockverse-world");

  if (!saved) {
    alert("No saved world found.");
    return;
  }

  const data = JSON.parse(saved);

  for (const mesh of blocks.values()) scene.remove(mesh);

  blocks.clear();

  loadedChunks.clear();

  mode = data.mode || "creative";

  if (data.player) Object.assign(player, data.player);

  document.querySelector("#worldName").value =
    data.name || "My World";

  for (const b of data.blocks || []) {
    addBlock(b.x, b.y, b.z, b.type);
  }

  startGame();
}

function saveAutomatically() {
  if (playing) {
    const data = {
      name: document.querySelector("#worldLabel").textContent,
      mode,
      player,
      blocks: [...blocks.values()].map(mesh => mesh.userData)
    };

    localStorage.setItem("blockverse-world", JSON.stringify(data));
  }
}

// START

function startGame() {
  playing = true;
  paused = false;

  document.querySelector("#launcher").classList.add("hidden");
  document.querySelector("#hud").classList.remove("hidden");
  document.querySelector("#pause").classList.add("hidden");

  document.querySelector("#worldLabel").textContent =
    document.querySelector("#worldName").value.toUpperCase();

  updateChunks();

  camera.position.set(player.x, player.y, player.z);

  connectMultiplayer();

  renderer.domElement.requestPointerLock();
}

document.querySelector("#play").addEventListener("click", () => {
  mode = document.querySelector("#mode").value;

  player.x = 0;
  player.y = 5;
  player.z = 8;

  startGame();
});

document.querySelector("#load").addEventListener("click", loadWorld);

document.querySelector("#save").addEventListener("click", saveWorld);

document.querySelector("#resume").addEventListener("click", () => {
  paused = false;

  document.querySelector("#pause").classList.add("hidden");

  renderer.domElement.requestPointerLock();
});

document.querySelector("#exit").addEventListener("click", () => {
  saveAutomatically();

  playing = false;
  paused = false;

  document.exitPointerLock();

  document.querySelector("#hud").classList.add("hidden");
  document.querySelector("#pause").classList.add("hidden");
  document.querySelector("#launcher").classList.remove("hidden");
});

// GAME LOOP

let previousTime = performance.now();
let lastNetworkUpdate = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - previousTime) / 1000, .04);
  previousTime = now;

  if (playing && !paused && locked) {

    const forward =
      Number(keys.KeyW) - Number(keys.KeyS);

    const side =
      Number(keys.KeyD) - Number(keys.KeyA);

    const speed = keys.ShiftLeft ? 9 : 5;

    player.x += (
      -Math.sin(player.yaw) * forward +
      Math.cos(player.yaw) * side
    ) * speed * dt;

    player.z += (
      -Math.cos(player.yaw) * forward -
      Math.sin(player.yaw) * side
    ) * speed * dt;

    if (keys.Space && player.onGround) {
      player.vy = 7;
      player.onGround = false;
    }

    player.vy -= 18 * dt;
    player.y += player.vy * dt;

    const ground =
      terrainHeight(
        Math.round(player.x),
        Math.round(player.z)
      ) + 2.65;

    if (player.y < ground) {
      player.y = ground;
      player.vy = 0;
      player.onGround = true;
    }

    updateChunks();

    // FIRST-PERSON / THIRD-PERSON

    const direction = new THREE.Vector3(
      -Math.sin(player.yaw),
      0,
      -Math.cos(player.yaw)
    );

    if (cameraMode === 0) {
      camera.position.set(player.x, player.y, player.z);
    } else {
      camera.position.set(
        player.x - direction.x * 5,
        player.y + 2,
        player.z - direction.z * 5
      );
    }

    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    document.querySelector("#coordinates").textContent =
      `X: ${Math.round(player.x)} Y: ${Math.round(player.y)} Z: ${Math.round(player.z)}`;

    if (socket?.connected && now - lastNetworkUpdate > 80) {
      socket.emit("move", {
        x: player.x,
        y: player.y,
        z: player.z
      });

      lastNetworkUpdate = now;
    }
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

setInterval(saveAutomatically, 30000);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
