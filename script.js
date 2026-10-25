import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
/* VERNIER CALLIPER LABORATORY
   Preserves the imported model and existing interface. */
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
 Keep the existing calibration direction.
 Do not reverse this without checking the rendered scale.
*/
const MAIN_SCALE_DIRECTION = 1;
/*
 Gap (in texture pixels) between the tallest graduation
 and the bottom of the main-scale numbers.
 Bigger number = numbers sit higher above the lines.
*/
const LABEL_GAP = 9;
/*
 Vernier scale darkening.
 The vernier markings are baked into the model's photo texture.
 Pixels inside this rectangle (as fractions of the image) are
 pushed to solid black so the lines and numbers stay dark
 whatever the lighting does.
 INK_LOW  : anything darker than this becomes pure black
 INK_HIGH : anything lighter than this stays pure white
 Raise INK_LOW / INK_HIGH for even bolder markings.
*/
const VERNIER_REGION = { u0: 268 / 1024, u1: 619 / 1024, v0: 250 / 512, v1: 267 / 512 };
const INK_LOW = 185;
const INK_HIGH = 240;
const ATLAS_UPSCALE = 2;
/*
 Touch behaviour.
 Once the camera is closer than this fraction of the
 full-view distance, one finger moves (pans) the view
 instead of rotating it.
*/
const ZOOMED_IN_RATIO = 0.85;
/*
 Shine for the flat and straight-sided objects.
 A flat face reflects one single patch of the room, so it
 shows no highlight. To fix that, the shading of each face is
 gently "crowned": the surface stays flat and keeps its exact
 size, but the light is reflected as if the face bulged out a
 little. That makes bright reflections sweep across every face
 just like they do on the sphere.
 0   = off (plain flat shading)
 0.5 = about right
 0.8 = very strong highlights
*/
const CROWN_STRENGTH = { cube: 0.55, cuboid: 0.55, cylinder: 0.5, cone: 0.45 };
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
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
/* MODEL PART NAMES */
const MOVING_NAMES = new Set(["Cube.004_2", "Cylinder_3"].map(normalizeName));
const HIDE_NAMES = new Set(["Circle_4", "Cylinder.001_5"].map(normalizeName));
/* SCENE */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
camera.position.set(0, 0, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
viewer.appendChild(renderer.domElement);
/* LIGHTING */
scene.add(new THREE.HemisphereLight(0xd5dbe2, 0x30343a, 0.7));
[[1.45, 1.7, 2.0, 4.5], [0.55, -5.0, 2.8, 4.0], [0.30, 0.0, -3.5, -4.5]].forEach(([intensity, x, y, z]) => {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  scene.add(light);
});
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
pmrem.dispose();
if (room.dispose) {
  room.dispose();
}
/* MEASUREMENT OBJECT MATERIALS */
const OBJECT_COLOURS = {
  sphere: 0xe24f67,
  cube: 0x4c9de8,
  cylinder: 0x44c49a,
  cuboid: 0xe5b34a,
  cone: 0xa879ec
};
/*
 One glossy finish shared by every object, so they all look
 the same. This is the sphere's finish: shiny, not matte.
 To change the shininess, edit these numbers:
 lower roughness / higher clearcoat / higher envMapIntensity = shinier
 higher roughness / lower clearcoat / lower envMapIntensity = duller
*/
const OBJECT_FINISH = {
  metalness: 0.45,
  roughness: 0.28,
  clearcoat: 0.7,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.0
};
function makeObjectMaterial(shapeName) {
  return new THREE.MeshPhysicalMaterial({
    color: OBJECT_COLOURS[shapeName] || 0xd7dce2,
    metalness: OBJECT_FINISH.metalness,
    roughness: OBJECT_FINISH.roughness,
    clearcoat: OBJECT_FINISH.clearcoat,
    clearcoatRoughness: OBJECT_FINISH.clearcoatRoughness,
    envMapIntensity: OBJECT_FINISH.envMapIntensity
  });
}
/* CAMERA CONTROLS */
const controls = new OrbitControls(camera, renderer.domElement);
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
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
let movedByUser = false;
controls.addEventListener("start", () => {
  movedByUser = true;
});
/*
 Zoom in (pinch lands on the point between your fingers),
 then slide one finger to move the view in that direction.
 When the camera is zoomed out, one finger rotates as before.
*/
let homeDistance = 10;
function updateTouchMode() {
  const distance = camera.position.distanceTo(controls.target);
  const zoomedIn = distance < homeDistance * ZOOMED_IN_RATIO;
  controls.touches.ONE = zoomedIn ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
}
controls.addEventListener("change", updateTouchMode);
/* MAIN SCALE TEXTURE */
function makeMainScaleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = SCALE_TEX_WIDTH;
  canvas.height = SCALE_TEX_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create main-scale texture.");
  }
  /* Silver base */
  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "#c4cbd2");
  background.addColorStop(0.25, "#e0e4e8");
  background.addColorStop(0.5, "#c7cdd3");
  background.addColorStop(0.75, "#e0e4e8");
  background.addColorStop(1, "#c4cbd2");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  /*
   The model maps this texture upside down, so everything
   here is laid out upside down on purpose:
   graduations start near the top of each band and the
   numbers are drawn flipped. On the model the lines rise
   from the bottom edge and the numbers read upright above.
  */
  const bands = [
    { top: 52, bottom: 194, tickTop: 59, short: 27, mid: 47, long: 69, font: 25 },
    { top: 220, bottom: 328, tickTop: 227, short: 22, mid: 39, long: 57, font: 23 },
    {
      /*
       This is the band shown on the front of the ruler.
       Part of it is covered by the slider at the top and
       bottom, so the graduations are sized to leave room
       for the numbers in the visible window.
      */
      top: 360,
      bottom: 462,
      tickTop: 370,
      short: 18,
      mid: 30,
      long: 42,
      font: 23
    }
  ];
  const maxMM = Math.floor((SCALE_TEX_WIDTH - ZERO_PX - 35) / RULER_PX_PER_MM);
  bands.forEach(band => {
    const strip = ctx.createLinearGradient(0, band.top, 0, band.bottom);
    strip.addColorStop(0, "#dce1e6");
    strip.addColorStop(0.5, "#c5ccd3");
    strip.addColorStop(1, "#e0e4e8");
    ctx.fillStyle = strip;
    ctx.fillRect(0, band.top, canvas.width, band.bottom - band.top);
    /* Main-scale graduations */
    for (let mm = 0; mm <= maxMM; mm++) {
      const x = ZERO_PX + mm * RULER_PX_PER_MM;
      if (x >= canvas.width - 2) break;
      const isTen = mm % 10 === 0;
      const isFive = mm % 5 === 0;
      const tickLength = isTen ? band.long : isFive ? band.mid : band.short;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, band.tickTop);
      ctx.lineTo(Math.round(x) + 0.5, band.tickTop + tickLength);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = isTen ? 3.5 : isFive ? 2.8 : 2.2;
      ctx.stroke();
    }
    /*
     Main-scale numbers:
     upright on the model, bold and black, sitting a small
     gap above the tallest graduation so they never touch.
    */
    ctx.fillStyle = "#000000";
    ctx.font = `900 ${band.font}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const labelY = band.tickTop + band.long + LABEL_GAP;
    for (let mm = 0; mm <= maxMM; mm += 10) {
      const x = ZERO_PX + mm * RULER_PX_PER_MM;
      if (x >= canvas.width - 2) break;
      ctx.save();
      ctx.translate(x, labelY);
      /* Flip vertically so the digits are not mirrored on the model. */
      ctx.scale(1, -1);
      ctx.fillText(String(mm), 0, 0);
      ctx.restore();
    }
    ctx.strokeStyle = "#626970";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, band.top, canvas.width, band.bottom - band.top);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  /*
   Preserve the established texture orientation.
   Horizontal alignment is handled by calibration below.
  */
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}
/* MATERIAL HELPERS */
function getMaterials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
/* MAIN RULER MATERIAL */
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
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
}
/* ORIGINAL MODEL MATERIALS */
function polishModelMaterials(model, ruler) {
  model.traverse(object => {
    if (!object.isMesh || object === ruler) return;
    const name = normalizeName(object.name);
    const isScalePart = name.includes("vernier") || name.includes("scale") || name.includes("graduation");
    const materials = getMaterials(object).map(original => {
      const material = original.clone();
      /*
       Preserve the original map and material colour.
      */
      material.color.copy(original.color);
      material.metalness = original.metalness;
      material.roughness = Math.max(original.roughness, 0.4);
      /*
       Reduce glare so original markings remain legible.
      */
      material.envMapIntensity = isScalePart ? 0.08 : 0.15;
      /*
       Slightly darken identifiable scale materials.
       The original texture is not replaced.
      */
      if (isScalePart) {
        material.color.multiplyScalar(0.55);
      }
      material.needsUpdate = true;
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
    object.castShadow = false;
    object.receiveShadow = false;
  });
}
/* VERNIER SCALE DARKENING */
function loadImageFromBuffer(buffer, mimeType) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([buffer], { type: mimeType || "image/jpeg" }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the model texture."));
    };
    image.src = url;
  });
}
/*
 Rebuilds the model's metal texture (the one that carries the
 vernier lines and numbers) with the vernier strip pushed to
 solid black. Runs after the model is already on screen; if
 anything fails the original texture simply stays in place.
*/
async function darkenVernierScale(gltf) {
  const json = gltf.parser.json;
  const metalMaterial = (json.materials || []).find(material => material.name === "metallic");
  const textureIndex = metalMaterial?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (textureIndex === undefined) {
    throw new Error('Material "metallic" has no texture.');
  }
  const imageDefinition = json.images[json.textures[textureIndex].source];
  if (!imageDefinition || imageDefinition.bufferView === undefined) {
    throw new Error("The metal texture is not embedded in the model.");
  }
  const buffer = await gltf.parser.getDependency("bufferView", imageDefinition.bufferView);
  const image = await loadImageFromBuffer(buffer, imageDefinition.mimeType);
  const width = image.naturalWidth * ATLAS_UPSCALE;
  const height = image.naturalHeight * ATLAS_UPSCALE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not create the vernier texture.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  const x0 = Math.round(VERNIER_REGION.u0 * width);
  const x1 = Math.round(VERNIER_REGION.u1 * width);
  const y0 = Math.round(VERNIER_REGION.v0 * height);
  const y1 = Math.round(VERNIER_REGION.v1 * height);
  const pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let t = (luminance - INK_LOW) / (INK_HIGH - INK_LOW);
    t = Math.min(1, Math.max(0, t));
    t = t * t * (3 - 2 * t);
    const value = Math.round(t * 255);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  ctx.putImageData(pixels, x0, y0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  /* Swap it onto every textured part except the main ruler. */
  rig.traverse(object => {
    if (!object.isMesh) return;
    if (object.name === "Object_4") return;
    getMaterials(object).forEach(material => {
      if (!material.map) return;
      material.map = texture;
      material.needsUpdate = true;
    });
  });
}
/* MAIN SCALE CALIBRATION */
function calibrateMainScale(mesh) {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  if (!position || !uv) {
    throw new Error("Main ruler is missing position or UV data.");
  }
  const worldPosition = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    worldPosition.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const mm = (worldPosition.x - ZERO_X) * MM_PER_UNIT;
    const textureX = ZERO_PX + MAIN_SCALE_DIRECTION * RULER_PX_PER_MM * mm;
    uv.setX(i, textureX / SCALE_TEX_WIDTH);
  }
  uv.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
/* LOAD MODEL */
let rig = null;
let slider = null;
let ready = false;
let W = 6;
let H = 2.5;
new GLTFLoader().load(MODEL, gltf => {
  try {
    setup(gltf.scene);
  } catch (error) {
    console.error(error);
    say("Model setup problem: " + (error.message || "Unknown error."));
    return;
  }
  darkenVernierScale(gltf).catch(error => {
    console.warn("Vernier scale darkening skipped:", error);
  });
}, undefined, error => {
  console.error(error);
  say("Model could not load. Check that " + "verniercaliper.glb is beside index.html.");
});
/* SET UP MODEL */
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
    throw new Error("Could not identify both moving parts. Found: " + movingParts.map(part => part.name).join(", "));
  }
  const ruler = model.getObjectByName("Object_4");
  if (!ruler || !ruler.isMesh) {
    throw new Error('The model ruler mesh "Object_4" was not found.');
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
    bounds.union(new THREE.Box3().setFromObject(object));
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
  say("Caliper ready. Drag to rotate, pinch to zoom, " + "then drag with one finger to move the view.");
}
/* CAMERA VIEWS */
let fly = null;
function cameraDistance(span) {
  return span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
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
  /* Remember the full-view distance for the touch behaviour. */
  homeDistance = z;
  go(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 0, 0), instant);
}
function viewJaws() {
  if (!ready || !rig || !slider) return;
  const gap = slider.position.x;
  const target = rig.localToWorld(new THREE.Vector3(FACE_X + gap / 2, -0.55, FACE_Z));
  const span = Math.max(2.2, (gap + 1.4) / Math.max(camera.aspect, 0.1));
  const z = cameraDistance(span) + 0.25;
  go(new THREE.Vector3(target.x, target.y, target.z + z), target);
}
$("fitButton").addEventListener("click", () => {
  if (ready) viewFull();
});
$("jawsButton").addEventListener("click", viewJaws);
/* JAW SLIDER */
$("jawSlider").addEventListener("input", () => {
  const value = Number($("jawSlider").value);
  $("jawValue").textContent = value + "%";
  if (ready && slider && !obj) {
    slider.position.x = (value / 100) * TRAVEL;
  }
});
/* MEASURABLE SHAPES */
/*
 Tilts the shading normals outward toward the edges of each
 face. Positions are not touched, so sizes and jaw contact
 stay exact; only the way light reflects changes.
*/
function crowned(geometry, shapeName) {
  const strength = CROWN_STRENGTH[shapeName] || 0;
  if (strength <= 0) return geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(center);
    p.set(p.x / (half.x || 1), p.y / (half.y || 1), p.z / (half.z || 1));
    n.fromBufferAttribute(normal, i);
    /* The part of the position that lies along the surface. */
    p.addScaledVector(n, -p.dot(n));
    n.addScaledVector(p, strength).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  normal.needsUpdate = true;
  return geometry;
}
const SHAPES = {
  sphere: {
    fields: ["Diameter"],
    max: 100,
    geometry: a => new THREE.SphereGeometry(a / 2, 64, 40),
    measuredHeight: a => a
  },
  cube: {
    fields: ["Side"],
    max: 100,
    geometry: a => crowned(new THREE.BoxGeometry(a, a, a, 12, 12, 12), "cube"),
    measuredHeight: a => a
  },
  cylinder: {
    fields: ["Diameter", "Height"],
    max: 100,
    geometry: (a, b) => crowned(new THREE.CylinderGeometry(a / 2, a / 2, b, 64, 8), "cylinder"),
    measuredHeight: (a, b) => b
  },
  cuboid: {
    fields: ["Length", "Width", "Height"],
    max: 100,
    geometry: (a, b, c) => crowned(new THREE.BoxGeometry(a, c, b, 12, 12, 12), "cuboid"),
    measuredHeight: (a, b, c) => c
  },
  cone: {
    fields: ["Base diameter", "Height"],
    max: 100,
    geometry: (a, b) => crowned(new THREE.ConeGeometry(a / 2, b, 64, 8), "cone"),
    measuredHeight: (a, b) => b
  }
};
let shape = null;
let obj = null;
/* READ DIMENSIONS */
function readDimensions() {
  const definition = SHAPES[shape];
  const dimensions = definition.fields.map((_, index) => parseFloat($("dim" + "ABC"[index]).value));
  if (dimensions.some(value => !(value >= 1 && value <= definition.max))) {
    say(`Enter every size between 1 and ${definition.max} mm.`);
    return null;
  }
  const openingLimit = Math.min(definition.max, Math.floor(TRAVEL * MM_PER_UNIT));
  if (dimensions[0] > openingLimit) {
    say(`The jaws open to ${openingLimit} mm at most. Reduce the first size.`);
    return null;
  }
  return dimensions;
}
/* POSITION OBJECT */
function placeObject() {
  if (!obj || !shape || !slider) return;
  const dimensions = readDimensions();
  if (!dimensions) return;
  const definition = SHAPES[shape];
  const units = dimensions.map(value => value / MM_PER_UNIT);
  obj.geometry.dispose();
  obj.geometry = definition.geometry(...units);
  slider.position.x = units[0];
  const measuredHeight = definition.measuredHeight(...units);
  const top = shape === "cone" ? ROOT_Y - 0.05 : ROOT_Y;
  let y = top - measuredHeight / 2;
  if (shape === "sphere") {
    y = Math.max(y, -1.05);
  }
  obj.rotation.set(0, 0, shape === "cone" ? Math.PI : 0);
  obj.position.set(FACE_X + units[0] / 2, y, FACE_Z);
  $("measurementAnswer").textContent = definition.fields.map((name, index) => `${name}: ${dimensions[index]} mm`).join("  ·  ");
  say("Object is held between the jaws. " + `First dimension: ${dimensions[0]} mm.`);
}
/* SELECT SHAPE */
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
    obj = new THREE.Mesh(new THREE.BufferGeometry(), makeObjectMaterial(shape));
    obj.name = "Measured object";
    rig.add(obj);
  } else {
    obj.material.dispose();
    obj.material = makeObjectMaterial(shape);
  }
  document.querySelectorAll("[data-shape]").forEach(button => {
    button.classList.toggle("active", button.dataset.shape === selectedShape);
  });
  "ABC".split("").forEach((key, index) => {
    const visible = index < SHAPES[selectedShape].fields.length;
    $("field" + key).hidden = !visible;
    if (visible) {
      $("label" + key).textContent = SHAPES[selectedShape].fields[index] + " (mm)";
    }
  });
  $("objectPanel").hidden = false;
  $("jawControlPanel").hidden = true;
  placeObject();
}
/* REMOVE OBJECT */
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
  const percent = slider ? Math.round((slider.position.x / TRAVEL) * 100) : 0;
  $("jawSlider").value = String(percent);
  $("jawValue").textContent = percent + "%";
  say("Object removed. Move the jaws freely.");
}
/* BUTTONS AND INPUTS */
document.querySelectorAll("[data-shape]").forEach(button => {
  button.addEventListener("click", () => {
    selectShape(button.dataset.shape);
  });
});
["dimA", "dimB", "dimC"].forEach(id => {
  $(id).addEventListener("input", placeObject);
});
$("removeButton").addEventListener("click", removeObject);
/* RESIZE */
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
/* ANIMATION */
function animate(now) {
  requestAnimationFrame(animate);
  if (fly) {
    const progress = Math.min(1, (now - fly.started) / 520);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(fly.fromPosition, fly.toPosition, eased);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, eased);
    if (progress >= 1) {
      fly = null;
    }
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
