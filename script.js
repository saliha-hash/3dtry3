import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   VERNIER CALLIPER
   Polished silver materials
   Dark, readable scale markings
   Original GLB model and movable jaws
   ========================================================= */

const MODEL = "./verniercaliper.glb";

/* Model calibration */
const MM_PER_UNIT = 31.27;
const ZERO_X = -1.1227;
const FACE_X = -1.521;
const FACE_Z = 0.366;
const ROOT_Y = -0.17;
const TRAVEL = 3.47;

/* Scale texture */
const SCALE_TEX_WIDTH = 2048;
const SCALE_TEX_HEIGHT = 512;
const ZERO_PX = 70;
const RULER_PX_PER_MM = 2.903 * 2;

/* Original model node names */
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

const $ = id => document.getElementById(id);
const viewer = $("viewer");
const status = $("status");

function say(message) {
  if (status) status.textContent = message;
}

if (!viewer) {
  throw new Error('Missing HTML element: "viewer".');
}

/* =========================================================
   SCENE
   ========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);

const camera = new THREE.PerspectiveCamera(
  30,
  1,
  0.01,
  1000
);

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
renderer.toneMappingExposure = 1.25;

viewer.appendChild(renderer.domElement);

/* Studio lighting */
scene.add(
  new THREE.HemisphereLight(
    0xf5f7fa,
    0x30343a,
    2.1
  )
);

[
  [4.0, 4.5, 5.0, 7.0],
  [3.1, -5.0, 2.8, 4.0],
  [2.5, 0.0, -3.5, -4.5]
].forEach(([intensity, x, y, z]) => {
  const light = new THREE.DirectionalLight(
    0xffffff,
    intensity
  );

  light.position.set(x, y, z);
  scene.add(light);
});

/* Environment reflections for metal */
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();

scene.environment = pmrem.fromScene(
  room,
  0.04
).texture;

pmrem.dispose();

if (room.dispose) room.dispose();

/* =========================================================
   MATERIALS FOR MEASURED OBJECTS
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
    metalness: 0.58,
    roughness: 0.17,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.5
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
controls.dampingFactor = 0.075;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.minDistance = 0.25;
controls.maxDistance = 30;

controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN
};

let movedByUser = false;

controls.addEventListener("start", () => {
  movedByUser = true;
});

/* =========================================================
   REPLACEMENT MAIN-SCALE TEXTURE
   This replaces the texture on the existing ruler mesh.
   It does not add a second 3D scale over the original.
   ========================================================= */

function makeMainScaleTexture() {
  const canvas = document.createElement("canvas");

  canvas.width = SCALE_TEX_WIDTH;
  canvas.height = SCALE_TEX_HEIGHT;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "Could not create the ruler texture."
    );
  }

  /* Polished brushed-silver background */
  const base = ctx.createLinearGradient(
    0,
    0,
    0,
    SCALE_TEX_HEIGHT
  );

  base.addColorStop(0.00, "#9fa7b0");
  base.addColorStop(0.14, "#e9edf1");
  base.addColorStop(0.31, "#b9c0c8");
  base.addColorStop(0.49, "#f2f4f6");
  base.addColorStop(0.67, "#adb5be");
  base.addColorStop(0.84, "#e4e8ec");
  base.addColorStop(1.00, "#a4acb5");

  ctx.fillStyle = base;
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  /* Very subtle metallic brushing */
  for (let y = 0; y < canvas.height; y += 5) {
    ctx.fillStyle =
      y % 10 === 0
        ? "rgba(255,255,255,0.075)"
        : "rgba(25,30,36,0.025)";

    ctx.fillRect(y * 0, y, canvas.width, 1);
  }

  /*
    Three strips preserve the existing texture's
    three-row layout. They are part of one texture.
  */

  const bands = [
    {
      top: 52,
      bottom: 194,
      tickTop: 59,
      short: 27,
      mid: 47,
      long: 69,
      labelY: 166
    },
    {
      top: 220,
      bottom: 328,
      tickTop: 227,
      short: 22,
      mid: 39,
      long: 57,
      labelY: 312
    },
    {
      top: 360,
      bottom: 462,
      tickTop: 367,
      short: 21,
      mid: 38,
      long: 55,
      labelY: 449
    }
  ];

  const maxMillimetres = Math.floor(
    (SCALE_TEX_WIDTH - ZERO_PX - 35) /
    RULER_PX_PER_MM
  );

  bands.forEach((band, bandIndex) => {
    /* Silver strip */
    const strip = ctx.createLinearGradient(
      0,
      band.top,
      0,
      band.bottom
    );

    strip.addColorStop(0, "#dfe4e9");
    strip.addColorStop(0.42, "#c4cbd3");
    strip.addColorStop(0.78, "#e9edf0");
    strip.addColorStop(1, "#b8c0c8");

    ctx.fillStyle = strip;

    ctx.fillRect(
      0,
      band.top,
      canvas.width,
      band.bottom - band.top
    );

    /* Thin strip boundaries */
    ctx.strokeStyle = "rgba(40,46,53,0.48)";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(0, band.top + 1);
    ctx.lineTo(canvas.width, band.top + 1);

    ctx.moveTo(0, band.bottom - 1);
    ctx.lineTo(canvas.width, band.bottom - 1);
    ctx.stroke();

    /* Dark, clear millimetre divisions */
    for (
      let mm = 0;
      mm <= maxMillimetres;
      mm++
    ) {
      const x =
        ZERO_PX + mm * RULER_PX_PER_MM;

      if (x >= canvas.width - 2) break;

      const isTen = mm % 10 === 0;
      const isFive = mm % 5 === 0;

      const length = isTen
        ? band.long
        : isFive
          ? band.mid
          : band.short;

      ctx.strokeStyle = "#080a0c";

      ctx.lineWidth = isTen
        ? 2.7
        : isFive
          ? 2.15
          : 1.65;

      ctx.beginPath();
      ctx.moveTo(x, band.tickTop);
      ctx.lineTo(x, band.tickTop + length);
      ctx.stroke();

      /* Numbers every 10 mm */
      if (isTen) {
        ctx.fillStyle = "#050607";

        ctx.font =
          `700 ${bandIndex === 0 ? 21 : 19}px Arial`;

        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";

        ctx.fillText(
          String(mm),
          x,
          band.labelY
        );
      }
    }
  });

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

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
   DARKEN ORIGINAL TEXTURE MARKINGS
   No additional vernier ticks are drawn over the original.
   ========================================================= */

const enhancedTextures = new WeakSet();

function clampByte(value) {
  return Math.max(
    0,
    Math.min(255, Math.round(value))
  );
}

function enhanceExistingTexture(texture) {
  if (!texture || enhancedTextures.has(texture)) {
    return;
  }

  const image = texture.image;

  const width = image && (
    image.width ||
    image.naturalWidth ||
    image.videoWidth
  );

  const height = image && (
    image.height ||
    image.naturalHeight ||
    image.videoHeight
  );

  if (!width || !height) return;

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  if (!ctx) return;

  try {
    ctx.drawImage(
      image,
      0,
      0,
      width,
      height
    );

    const frame = ctx.getImageData(
      0,
      0,
      width,
      height
    );

    const pixels = frame.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b;

      /* Increase contrast to make lines darker */
      const enhanced = clampByte(
        128 + (luminance - 128) * 1.34
      );

      pixels[i] = clampByte(enhanced * 0.97);
      pixels[i + 1] = clampByte(enhanced * 0.985);
      pixels[i + 2] = clampByte(enhanced * 1.015);
    }

    ctx.putImageData(frame, 0, 0);

    texture.image = canvas;
    texture.colorSpace = THREE.SRGBColorSpace;

    texture.anisotropy =
      renderer.capabilities.getMaxAnisotropy();

    texture.needsUpdate = true;

    enhancedTextures.add(texture);
  } catch (error) {
    console.warn(
      "Could not enhance a texture:",
      error
    );
  }
}

/* =========================================================
   MATERIAL HELPERS
   ========================================================= */

function getMaterials(mesh) {
  return Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
}

function assignCleanMainScale(mesh, scaleTexture) {
  const polishedMaterials = getMaterials(mesh).map(
    original => {
      const material = original.clone();

      material.map = scaleTexture;
      material.color.set(0xffffff);
      material.metalness = 0.86;
      material.roughness = 0.22;
      material.envMapIntensity = 1.35;
      material.needsUpdate = true;

      return material;
    }
  );

  mesh.material = Array.isArray(mesh.material)
    ? polishedMaterials
    : polishedMaterials[0];
}

function polishModelMaterials(model, mainScaleTexture) {
  const processedTextures = new Set();

  model.traverse(object => {
    if (!object.isMesh) return;

    const materials = getMaterials(object).map(
      original => {
        const material = original.clone();

        if (
          material.map &&
          material.map !== mainScaleTexture &&
          !processedTextures.has(material.map)
        ) {
          enhanceExistingTexture(material.map);
          processedTextures.add(material.map);
        }

        /* Cool silver finish */
        if (material.map === mainScaleTexture) {
          material.color.set(0xffffff);
          material.metalness = 0.86;
          material.roughness = 0.22;
        } else {
          material.color.set(0xe1e5e9);
          material.metalness = 0.72;
          material.roughness = 0.27;
        }

        material.envMapIntensity = 1.3;
        material.needsUpdate = true;

        return material;
      }
    );

    object.material = Array.isArray(object.material)
      ? materials
      : materials[0];

    object.castShadow = false;
    object.receiveShadow = false;
  });
}

/* =========================================================
   ALIGN MAIN-SCALE ZERO WITH THE VERNER ZERO
   ========================================================= */

function calibrateMainScale(mesh) {
  mesh.updateWorldMatrix(true, false);

  const position =
    mesh.geometry.attributes.position;

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

    const millimetresFromZero =
      (worldPosition.x - ZERO_X) * MM_PER_UNIT;

    const textureX =
      ZERO_PX +
      RULER_PX_PER_MM * millimetresFromZero;

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

let mainScaleTexture = null;

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
    const found = movingParts
      .map(part => part.name)
      .join(", ") || "none";

    throw new Error(
      "Could not identify both moving parts. Found: " +
      found
    );
  }

  /* The original model's main ruler mesh */
  const ruler = model.getObjectByName("Object_4");

  if (!ruler || !ruler.isMesh) {
    throw new Error(
      'The model ruler mesh "Object_4" was not found.'
    );
  }

  /* Replace the ruler texture rather than overlaying ticks */
  mainScaleTexture = makeMainScaleTexture();

  calibrateMainScale(ruler);

  assignCleanMainScale(
    ruler,
    mainScaleTexture
  );

  polishModelMaterials(
    model,
    mainScaleTexture
  );

  /* Calculate complete model dimensions */
  const fit = new THREE.Box3();

  model.updateMatrixWorld(true);

  model.traverse(object => {
    if (!object.isMesh) return;

    for (
      let parent = object;
      parent;
      parent = parent.parent
    ) {
      if (!parent.visible) return;
    }

    fit.union(
      new THREE.Box3().setFromObject(object)
    );
  });

  if (fit.isEmpty()) {
    throw new Error(
      "The model has no visible geometry."
    );
  }

  const size = fit.getSize(
    new THREE.Vector3()
  );

  const center = fit.getCenter(
    new THREE.Vector3()
  );

  W = size.x;
  H = size.y;

  /* Separate moving parts into the movable slider */
  slider = new THREE.Group();

  rig.add(slider);

  movingParts.forEach(part => {
    slider.attach(part);
  });

  /* Center the model for the camera */
  rig.position.copy(center).negate();

  rig.updateMatrixWorld(true);

  ready = true;

  viewFull(true);

  say(
    "Caliper ready. Zoom in on the jaws or measure an object."
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

  const span = Math.max(
    W / aspect,
    H
  ) * 1.18;

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
   FREE JAW MOVEMENT
   ========================================================= */

$("jawSlider").addEventListener("input", () => {
  const value = Number($("jawSlider").value);

  $("jawValue").textContent = value + "%";

  if (ready && slider && !obj) {
    slider.position.x =
      (value / 100) * TRAVEL;
  }
});

/* =========================================================
   OBJECT SHAPES
   ========================================================= */

const SHAPES = {
  sphere: {
    fields: ["Diameter"],
    max: 60,

    geometry: a =>
      new THREE.SphereGeometry(
        a / 2,
        64,
        40
      ),

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
      new THREE.CylinderGeometry(
        a / 2,
        a / 2,
        b,
        64
      ),

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
      new THREE.ConeGeometry(
        a / 2,
        b,
        64
      ),

    measuredHeight: (a, b) => b
  }
};

let shape = null;
let obj = null;

/* =========================================================
   VALIDATE DIMENSIONS
   ========================================================= */

function readDimensions() {
  const definition = SHAPES[shape];

  const dimensions = definition.fields.map(
    (_, index) =>
      parseFloat(
        $("dim" + "ABC"[index]).value
      )
  );

  if (
    dimensions.some(
      value =>
        !(value >= 1 && value <= definition.max)
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
      `The jaws open to ${openingLimit} mm at most. ` +
      "Reduce the first size."
    );

    return null;
  }

  return dimensions;
}

/* =========================================================
   POSITION AND MEASURE OBJECT
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

  /* Jaw separation equals first object dimension */
  slider.position.x = units[0];

  const measuredHeight =
    definition.measuredHeight(...units);

  const top =
    shape === "cone"
      ? ROOT_Y - 0.05
      : ROOT_Y;

  let y = top - measuredHeight / 2;

  if (shape === "sphere") {
    y = Math.max(y, -1.05);
  }

  /* Invert the cone so its base faces upward */
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
    `Object is held between the jaws. ` +
    `First dimension: ${dimensions[0]} mm.`
  );
}

/* =========================================================
   SELECT AN OBJECT
   ========================================================= */

function selectShape(selectedShape) {
  if (!ready || !rig) {
    say("Wait for the caliper to load.");
    return;
  }

  shape = selectedShape;

  if (!obj) {
    obj = new THREE.Mesh(
      new THREE.BufferGeometry(),
      makeObjectMaterial(shape)
    );

    obj.name = "Measured object";

    rig.add(obj);
  } else {
    if (obj.material) {
      obj.material.dispose();
    }

    obj.material = makeObjectMaterial(shape);
  }

  document
    .querySelectorAll("[data-shape]")
    .forEach(button => {
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
   REMOVE THE OBJECT
   ========================================================= */

function removeObject() {
  if (!obj) return;

  rig.remove(obj);

  obj.geometry.dispose();

  if (obj.material) {
    obj.material.dispose();
  }

  obj = null;
  shape = null;

  document
    .querySelectorAll("[data-shape]")
    .forEach(button => {
      button.classList.remove("active");
    });

  $("objectPanel").hidden = true;
  $("jawControlPanel").hidden = false;

  if (slider) {
    slider.position.x = Math.min(
      TRAVEL,
      Math.max(0, slider.position.x)
    );
  }

  const percent = slider
    ? Math.round(
        (slider.position.x / TRAVEL) * 100
      )
    : 0;

  $("jawSlider").value = String(percent);
  $("jawValue").textContent = percent + "%";

  say("Object removed. Move the jaws freely.");
}

/* =========================================================
   BUTTONS AND INPUTS
   ========================================================= */

document
  .querySelectorAll("[data-shape]")
  .forEach(button => {
    button.addEventListener("click", () => {
      selectShape(button.dataset.shape);
    });
  });

["dimA", "dimB", "dimC"].forEach(id => {
  $(id).addEventListener("input", placeObject);
});

$("removeButton").addEventListener(
  "click",
  removeObject
);

/* =========================================================
   RESIZE AND RENDER
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
