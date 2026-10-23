import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   VERNIER CALLIPER LABORATORY
   Original model, calibration and interface preserved.
   ========================================================= */

const MODEL = "./verniercaliper.glb";

const MM_PER_UNIT = 31.27;
const ZERO_X = -1.1227;
const FACE_X = -1.521;
const FACE_Z = 0.366;
const ROOT_Y = -0.17;
const TRAVEL = 3.47;

const SCALE_TEX_WIDTH = 2048;
const SCALE_TEX_HEIGHT = 512;
const ZERO_PX = 70;
const RULER_PX_PER_MM = 2.903 * 2;

/*
  MAIN SCALE DIRECTION

  If the main-scale numbers are still horizontally mirrored,
  change this value from 1 to -1.

  This changes the texture mapping direction, not the model.
*/
const MAIN_SCALE_DIRECTION = 1;

const $ = id => document.getElementById(id);

const viewer = $("viewer");
const status = $("status");

function say(message) {
  if (status) status.textContent = message;
}

if (!viewer) {
  throw new Error('Missing HTML element: "viewer".');
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const MOVING_NAMES = new Set([
  "Cube.004_2",
  "Cylinder_3"
].map(normalizeName));

const HIDE_NAMES = new Set([
  "Circle_4",
  "Cylinder.001_5"
].map(normalizeName));

/* =========================================================
   SCENE
   ========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

viewer.appendChild(renderer.domElement);

/* =========================================================
   LIGHTING
   ========================================================= */

scene.add(
  new THREE.HemisphereLight(
    0xd5dbe2,
    0x30343a,
    0.7
  )
);

[
  [1.45, 1.7, 2.0, 4.5],
  [0.55, -5.0, 2.8, 4.0],
  [0.30, 0.0, -3.5, -4.5]
].forEach(([intensity, x, y, z]) => {
  const light = new THREE.DirectionalLight(
    0xffffff,
    intensity
  );

  light.position.set(x, y, z);
  scene.add(light);
});

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();

scene.environment = pmrem.fromScene(room, 0.04).texture;

pmrem.dispose();

if (room.dispose) room.dispose();

/* =========================================================
   MEASUREMENT OBJECT MATERIALS
   ========================================================= */

const OBJECT_COLOURS = {
  sphere: 0xe24f67,
  cube: 0x4c9de8,
  cylinder: 0x44c49a,
  cuboid: 0xe5b34a,
  cone: 0xa879ec
};

function makeObjectMaterial(shapeName) {
  return new THREE.MeshPhysicalMaterial({
    color: OBJECT_COLOURS[shapeName] || 0xd7dce2,
    metalness: 0.48,
    roughness: 0.24,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.8
  });
}

/* =========================================================
   CAMERA CONTROLS
   ========================================================= */

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.09;

controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.75;
controls.panSpeed = 1.0;

controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;

controls.screenSpacePanning = true;
controls.zoomToCursor = true;

controls.minDistance = 0.6;
controls.maxDistance = 22;

controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;

controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN
};

let movedByUser = false;

controls.addEventListener("start", () => {
  movedByUser = true;
});

/* =========================================================
   MAIN SCALE TEXTURE
   ========================================================= */

function makeMainScaleTexture() {
  const canvas = document.createElement("canvas");

  canvas.width = SCALE_TEX_WIDTH;
  canvas.height = SCALE_TEX_HEIGHT;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create main-scale texture.");
  }

  /* Brushed silver base */

  const background = ctx.createLinearGradient(
    0, 0, 0, canvas.height
  );

  background.addColorStop(0, "#cbd1d7");
  background.addColorStop(0.25, "#e0e4e8");
  background.addColorStop(0.5, "#cbd1d7");
  background.addColorStop(0.75, "#e0e4e8");
  background.addColorStop(1, "#c5cbd1");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bands = [
    {
      top: 52,
      bottom: 194,
      tickTop: 59,
      short: 27,
      mid: 47,
      long: 69,
      labelY: 153,
      font: 23
    },
    {
      top: 220,
      bottom: 328,
      tickTop: 227,
      short: 22,
      mid: 39,
      long: 57,
      labelY: 298,
      font: 21
    },
    {
      top: 360,
      bottom: 462,
      tickTop: 367,
      short: 21,
      mid: 38,
      long: 55,
      labelY: 438,
      font: 21
    }
  ];

  const maxMM = Math.floor(
    (SCALE_TEX_WIDTH - ZERO_PX - 35) /
    RULER_PX_PER_MM
  );

  bands.forEach(band => {
    const strip = ctx.createLinearGradient(
      0, band.top, 0, band.bottom
    );

    strip.addColorStop(0, "#dce1e6");
    strip.addColorStop(0.5, "#c5ccd3");
    strip.addColorStop(1, "#e0e4e8");

    ctx.fillStyle = strip;

    ctx.fillRect(
      0,
      band.top,
      canvas.width,
      band.bottom - band.top
    );

    /* Main-scale tick marks */

    for (let mm = 0; mm <= maxMM; mm++) {
      const x = ZERO_PX + mm * RULER_PX_PER_MM;

      if (x >= canvas.width - 2) break;

      const isTen = mm % 10 === 0;
      const isFive = mm % 5 === 0;

      const tickLength = isTen
        ? band.long
        : isFive
          ? band.mid
          : band.short;

      ctx.beginPath();

      ctx.moveTo(Math.round(x) + 0.5, band.tickTop);

      ctx.lineTo(
        Math.round(x) + 0.5,
        band.tickTop + tickLength
      );

      ctx.strokeStyle = "#000000";

      ctx.lineWidth = isTen
        ? 3.5
        : isFive
          ? 2.8
          : 2.2;

      ctx.stroke();
    }

    /* Main-scale numbers: draw normally, not mirrored */

    ctx.fillStyle = "#000000";
    ctx.font = `bold ${band.font}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (let mm = 0; mm <= maxMM; mm += 10) {
      const x = ZERO_PX + mm * RULER_PX_PER_MM;

      if (x >= canvas.width - 2) break;

      ctx.save();

      ctx.fillText(String(mm), x, band.labelY);

      ctx.restore();
    }

    ctx.strokeStyle = "#747b82";
    ctx.lineWidth = 1;

    ctx.strokeRect(
      0,
      band.top,
      canvas.width,
      band.bottom - band.top
    );
  });

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  /*
    Use the standard canvas-texture orientation.
    The ruler's UV coordinates determine which direction
    the texture appears on the physical model.
  */
  texture.flipY = true;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  texture.generateMipmaps = true;

  texture.anisotropy =
    renderer.capabilities.getMaxAnisotropy();

  texture.needsUpdate = true;

  return texture;
}

/* =========================================================
   MATERIAL HELPERS
   ========================================================= */

function getMaterials(mesh) {
  return Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
}

/* =========================================================
   MAIN RULER MATERIAL
   ========================================================= */

function assignCleanMainScale(mesh, scaleTexture) {
  const materials = getMaterials(mesh).map(original => {
    const material = original.clone();

    material.map = scaleTexture;
    material.color.set(0xffffff);

    material.metalness = 0.08;
    material.roughness = 0.78;
    material.envMapIntensity = 0.25;

    material.needsUpdate = true;

    return material;
  });

  mesh.material = Array.isArray(mesh.material)
    ? materials
    : materials[0];
}

/* =========================================================
   PRESERVE ORIGINAL VERNIER MARKINGS
   ========================================================= */

function polishModelMaterials(model, ruler) {
  model.traverse(object => {
    if (!object.isMesh || object === ruler) return;

    const materials = getMaterials(object).map(original => {
      const material = original.clone();

      /*
        Preserve the original texture and colour.

        Do not replace the original Vernier texture.
        Do not darken or whiten the texture itself.
      */

      material.color.copy(original.color);

      /*
        Preserve original metalness and roughness.
        Avoid adding a strong reflective wash.
      */

      material.metalness = original.metalness;
      material.roughness = original.roughness;

      material.envMapIntensity = 0.15;

      material.needsUpdate = true;

      return material;
    });

    object.material = Array.isArray(object.material)
      ? materials
      : materials[0];

    object.castShadow = false;
    object.receiveShadow = false;
  });
}

/* =========================================================
   MAIN SCALE CALIBRATION
   ========================================================= */

function calibrateMainScale(mesh) {
  mesh.updateWorldMatrix(true, false);

  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;

  if (!position || !uv) {
    throw new Error(
      "Main ruler is missing position or UV data."
    );
  }

  const worldPosition = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    worldPosition
      .fromBufferAttribute(position, i)
      .applyMatrix4(mesh.matrixWorld);

    const mm =
      (worldPosition.x - ZERO_X) * MM_PER_UNIT;

    const textureX =
      ZERO_PX +
      MAIN_SCALE_DIRECTION *
      RULER_PX_PER_MM *
      mm;

    uv.setX(
      i,
      textureX / SCALE_TEX_WIDTH
    );
  }

  uv.needsUpdate = true;

  mesh.geometry.computeBoundingSphere();
}

/* =========================================================
   LOAD MODEL
   ========================================================= */

let rig = null;
let slider = null;
let ready = false;

let W = 6;
let H = 2.5;

new GLTFLoader().load(
  MODEL,

  gltf => {
    try {
      setup(gltf.scene);
    } catch (error) {
      console.error(error);

      say(
        "Model setup problem: " +
        (error.message || "Unknown error.")
      );
    }
  },

  undefined,

  error => {
    console.error(error);

    say(
      "Model could not load. Check that " +
      "verniercaliper.glb is beside index.html."
    );
  }
);

/* =========================================================
   SET UP MODEL
   ========================================================= */

function setup(model) {
  rig = new THREE.Group();

  rig.add(model);
  scene.add(rig);

  rig.updateMatrixWorld(true);

  const movingParts = [];

  model.traverse(object => {
    const name = normalizeName(object.name);

    if (HIDE_NAMES.has(name)) {
      object.visible = false;
    }

    if (MOVING_NAMES.has(name)) {
      movingParts.push(object);
    }
  });

  if (movingParts.length !== MOVING_NAMES.size) {
    throw new Error(
      "Could not identify both moving parts. Found: " +
      movingParts.map(part => part.name).join(", ")
    );
  }

  const ruler = model.getObjectByName("Object_4");

  if (!ruler || !ruler.isMesh) {
    throw new Error(
      'The model ruler mesh "Object_4" was not found.'
    );
  }

  const scaleTexture = makeMainScaleTexture();

  calibrateMainScale(ruler);

  assignCleanMainScale(ruler, scaleTexture);

  polishModelMaterials(model, ruler);

  slider = new THREE.Group();
  rig.add(slider);

  movingParts.forEach(part => {
    slider.attach(part);
  });

  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3();

  model.traverse(object => {
    if (!object.isMesh) return;

    let parent = object;

    while (parent) {
      if (!parent.visible) return;
      parent = parent.parent;
    }

    bounds.union(
      new THREE.Box3().setFromObject(object)
    );
  });

  if (bounds.isEmpty()) {
    throw new Error("The model has no visible geometry.");
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  W = size.x;
  H = size.y;

  rig.position.copy(center).negate();
  rig.updateMatrixWorld(true);

  ready = true;

  viewFull(true);

  say(
    "Caliper ready. Drag to rotate, use two fingers to pan and zoom."
  );
}

/* =========================================================
   CAMERA VIEWS
   ========================================================= */

let fly = null;

function cameraDistance(span) {
  return span / (
    2 * Math.tan(
      THREE.MathUtils.degToRad(camera.fov / 2)
    )
  );
}

function go(position, target, instant = false) {
  if (instant) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();

    fly = null;
    return;
  }

  fly = {
    started: performance.now(),

    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),

    toPosition: position.clone(),
    toTarget: target.clone()
  };
}

function viewFull(instant = false) {
  const aspect = Math.max(camera.aspect, 0.1);

  const span = Math.max(W / aspect, H) * 1.18;

  const z = cameraDistance(span) + 0.8;

  go(
    new THREE.Vector3(0, 0, z),
    new THREE.Vector3(0, 0, 0),
    instant
  );
}

function viewJaws() {
  if (!ready || !rig || !slider) return;

  const gap = slider.position.x;

  const target = rig.localToWorld(
    new THREE.Vector3(
      FACE_X + gap / 2,
      -0.55,
      FACE_Z
    )
  );

  const span = Math.max(
    2.2,
    (gap + 1.4) / Math.max(camera.aspect, 0.1)
  );

  const z = cameraDistance(span) + 0.25;

  go(
    new THREE.Vector3(
      target.x,
      target.y,
      target.z + z
    ),
    target
  );
}

$("fitButton").addEventListener("click", () => {
  if (ready) viewFull();
});

$("jawsButton").addEventListener("click", viewJaws);

/* =========================================================
   JAW SLIDER
   ========================================================= */

$("jawSlider").addEventListener("input", () => {
  const value = Number($("jawSlider").value);

  $("jawValue").textContent = value + "%";

  if (ready && slider && !obj) {
    slider.position.x = (value / 100) * TRAVEL;
  }
});

/* =========================================================
   MEASURABLE SHAPES
   ========================================================= */

const SHAPES = {
  sphere: {
    fields: ["Diameter"],
    max: 100,

    geometry: a =>
      new THREE.SphereGeometry(a / 2, 64, 40),

    measuredHeight: a => a
  },

  cube: {
    fields: ["Side"],
    max: 100,

    geometry: a =>
      new THREE.BoxGeometry(a, a, a),

    measuredHeight: a => a
  },

  cylinder: {
    fields: ["Diameter", "Height"],
    max: 100,

    geometry: (a, b) =>
      new THREE.CylinderGeometry(a / 2, a / 2, b, 64),

    measuredHeight: (a, b) => b
  },

  cuboid: {
    fields: ["Length", "Width", "Height"],
    max: 100,

    geometry: (a, b, c) =>
      new THREE.BoxGeometry(a, c, b),

    measuredHeight: (a, b, c) => c
  },

  cone: {
    fields: ["Base diameter", "Height"],
    max: 100,

    geometry: (a, b) =>
      new THREE.ConeGeometry(a / 2, b, 64),

    measuredHeight: (a, b) => b
  }
};

let shape = null;
let obj = null;

/* =========================================================
   READ DIMENSIONS
   ========================================================= */

function readDimensions() {
  const definition = SHAPES[shape];

  const dimensions = definition.fields.map(
    (_, index) =>
      parseFloat($("dim" + "ABC"[index]).value)
  );

  if (
    dimensions.some(
      value => !(value >= 1 && value <= definition.max)
    )
  ) {
    say(
      `Enter every size between 1 and ${definition.max} mm.`
    );

    return null;
  }

  const openingLimit = Math.min(
    definition.max,
    Math.floor(TRAVEL * MM_PER_UNIT)
  );

  if (dimensions[0] > openingLimit) {
    say(
      `The jaws open to ${openingLimit} mm at most. Reduce the first size.`
    );

    return null;
  }

  return dimensions;
}

/* =========================================================
   POSITION OBJECT
   ========================================================= */

function placeObject() {
  if (!obj || !shape || !slider) return;

  const dimensions = readDimensions();

  if (!dimensions) return;

  const definition = SHAPES[shape];

  const units = dimensions.map(
    value => value / MM_PER_UNIT
  );

  obj.geometry.dispose();
  obj.geometry = definition.geometry(...units);

  slider.position.x = units[0];

  const measuredHeight =
    definition.measuredHeight(...units);

  const top = shape === "cone"
    ? ROOT_Y - 0.05
    : ROOT_Y;

  let y = top - measuredHeight / 2;

  if (shape === "sphere") {
    y = Math.max(y, -1.05);
  }

  obj.rotation.set(
    0,
    0,
    shape === "cone" ? Math.PI : 0
  );

  obj.position.set(
    FACE_X + units[0] / 2,
    y,
    FACE_Z
  );

  $("measurementAnswer").textContent =
    definition.fields
      .map(
        (name, index) =>
          `${name}: ${dimensions[index]} mm`
      )
      .join("  ·  ");

  say(
    "Object is held between the jaws. " +
    `First dimension: ${dimensions[0]} mm.`
  );
}

/* =========================================================
   SELECT SHAPE
   ========================================================= */

function selectShape(selectedShape) {
  if (!ready || !rig) {
    say("Wait for the caliper to load.");
    return;
  }

  shape = selectedShape;

  const defaults = {
    sphere: [20, 20, 20],
    cube: [20, 20, 20],
    cylinder: [20, 30, 20],
    cuboid: [30, 18, 12],
    cone: [20, 30, 20]
  };

  const values = defaults[selectedShape];

  if (values) {
    $("dimA").value = values[0];
    $("dimB").value = values[1];
    $("dimC").value = values[2];
  }

  if (!obj) {
    obj = new THREE.Mesh(
      new THREE.BufferGeometry(),
      makeObjectMaterial(shape)
    );

    obj.name = "Measured object";
    rig.add(obj);
  } else {
    obj.material.dispose();
    obj.material = makeObjectMaterial(shape);
  }

  document.querySelectorAll("[data-shape]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.shape === selectedShape
    );
  });

  "ABC".split("").forEach((key, index) => {
    const visible =
      index < SHAPES[selectedShape].fields.length;

    $("field" + key).hidden = !visible;

    if (visible) {
      $("label" + key).textContent =
        SHAPES[selectedShape].fields[index] + " (mm)";
    }
  });

  $("objectPanel").hidden = false;
  $("jawControlPanel").hidden = true;

  placeObject();
}

/* =========================================================
   REMOVE OBJECT
   ========================================================= */

function removeObject() {
  if (!obj) return;

  rig.remove(obj);

  obj.geometry.dispose();
  obj.material.dispose();

  obj = null;
  shape = null;

  document.querySelectorAll("[data-shape]").forEach(button => {
    button.classList.remove("active");
  });

  $("objectPanel").hidden = true;
  $("jawControlPanel").hidden = false;

  const percent = slider
    ? Math.round((slider.position.x / TRAVEL) * 100)
    : 0;

  $("jawSlider").value = String(percent);
  $("jawValue").textContent = percent + "%";

  say("Object removed. Move the jaws freely.");
}

/* =========================================================
   BUTTONS AND INPUTS
   ========================================================= */

document.querySelectorAll("[data-shape]").forEach(button => {
  button.addEventListener("click", () => {
    selectShape(button.dataset.shape);
  });
});

["dimA", "dimB", "dimC"].forEach(id => {
  $(id).addEventListener("input", placeObject);
});

$("removeButton").addEventListener("click", removeObject);

/* =========================================================
   RESIZE
   ========================================================= */

function resizeViewer() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height, false);

  if (ready && !movedByUser) {
    viewFull(true);
  }
}

new ResizeObserver(resizeViewer).observe(viewer);
resizeViewer();

/* =========================================================
   ANIMATION
   ========================================================= */

function animate(now) {
  requestAnimationFrame(animate);

  if (fly) {
    const progress = Math.min(
      1,
      (now - fly.started) / 520
    );

    const eased =
      progress * progress * (3 - 2 * progress);

    camera.position.lerpVectors(
      fly.fromPosition,
      fly.toPosition,
      eased
    );

    controls.target.lerpVectors(
      fly.fromTarget,
      fly.toTarget,
      eased
    );

    if (progress >= 1) {
      fly = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
