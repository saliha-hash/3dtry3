import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* =========================================================
   VERNIER CALLIPER — REALISTIC METALLIC VERSION

   Model:
   ./verniercaliper.glb

   IMPORTANT:
   The calibration constants below are inherited from your
   original model measurements. Verify them against the GLB.
   ========================================================= */

const MODEL = "./verniercaliper.glb";

const MM_PER_UNIT = 31.27;

const ZERO_X = -1.1227;
const FACE_X = -1.521;
const FACE_Z = 0.366;
const ROOT_Y = -0.17;
const TRAVEL = 3.47;

const RULER_PX_PER_MM = 2.903;

const MOVING = ["cube004_2", "cylinder_3"];
const HIDE = ["circle_4", "cylinder001_5"];

const $ = id => document.getElementById(id);

const say = message => {
  $("status").textContent = message;
};

const viewer = $("viewer");

const v3 = new THREE.Vector3();

/* =========================================================
   SCENE
   ========================================================= */

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x050608);

const camera = new THREE.PerspectiveCamera(
  30,
  1,
  0.01,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 2)
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.toneMapping = THREE.ACESFilmicToneMapping;

renderer.toneMappingExposure = 1.35;

renderer.shadowMap.enabled = true;

renderer.shadowMap.type = THREE.PCFSoftShadowMap;

viewer.appendChild(renderer.domElement);

/* =========================================================
   REALISTIC METAL LIGHTING
   ========================================================= */

scene.add(
  new THREE.HemisphereLight(
    0xeaf3ff,
    0x252b35,
    2.0
  )
);

function addDirectionalLight(
  color,
  intensity,
  x,
  y,
  z
) {
  const light = new THREE.DirectionalLight(
    color,
    intensity
  );

  light.position.set(x, y, z);

  scene.add(light);

  return light;
}

/* Large highlights create a polished metal appearance. */

addDirectionalLight(0xffffff, 5.0, 4, 6, 7);

addDirectionalLight(0xc9dcff, 3.5, -5, 3, 4);

addDirectionalLight(0xffffff, 4.0, 2, -4, -5);

addDirectionalLight(0xffffff, 2.0, -4, -2, 3);

/* Environment reflections make metallic surfaces visible. */

const pmrem = new THREE.PMREMGenerator(renderer);

const environment = new RoomEnvironment();

const environmentTexture = pmrem.fromScene(
  environment,
  0.04
).texture;

scene.environment = environmentTexture;

environment.dispose();

pmrem.dispose();

/* =========================================================
   MATERIALS
   ========================================================= */

const silver = new THREE.MeshPhysicalMaterial({
  color: 0xc5cbd2,
  metalness: 0.96,
  roughness: 0.19,
  clearcoat: 0.85,
  clearcoatRoughness: 0.16,
  envMapIntensity: 1.7
});

const darkSilver = new THREE.MeshPhysicalMaterial({
  color: 0x747e89,
  metalness: 0.96,
  roughness: 0.23,
  clearcoat: 0.65,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.5
});

const blackMarking = new THREE.MeshBasicMaterial({
  color: 0x08090b
});

/*
  Keep existing textures where they contain the actual ruler
  artwork. Replacing every model material with silver would
  destroy the scale markings.
*/

/* =========================================================
   ORBIT CONTROLS
   ========================================================= */

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;

controls.dampingFactor = 0.075;

controls.zoomToCursor = true;

controls.screenSpacePanning = true;

controls.minDistance = 0.2;

controls.maxDistance = 35;

controls.touches = {
  ONE: THREE.TOUCH.PAN,
  TWO: THREE.TOUCH.DOLLY_PAN
};

let moved = false;

controls.addEventListener("start", () => {
  moved = true;
});

/* =========================================================
   LOAD MODEL
   ========================================================= */

let rig = null;

let slider = null;

let ready = false;

let W = 6;

let H = 2.5;

let modelRoot = null;

new GLTFLoader().load(
  MODEL,

  gltf => {
    try {
      setup(gltf.scene);
    } catch (error) {
      console.error(error);

      say(
        "Model setup problem: " + error.message
      );
    }
  },

  undefined,

  error => {
    console.error(error);

    say(
      "Could not load verniercaliper.glb. " +
      "Check the filename and GitHub repository."
    );
  }
);

/* =========================================================
   MATERIAL ENHANCEMENT
   ========================================================= */

function improveMaterials(model) {
  model.traverse(object => {
    if (!object.isMesh) return;

    if (HIDE.includes(object.name.toLowerCase())) {
      object.visible = false;
      return;
    }

    const originalMaterials = Array.isArray(
      object.material
    )
      ? object.material
      : [object.material];

    const updatedMaterials = originalMaterials.map(
      material => {
        if (!material) return material;

        /*
          Preserve materials containing the ruler image,
          labels, or other important textures.
        */

        const hasColorTexture =
          !!material.map ||
          !!material.alphaMap;

        if (hasColorTexture) {
          const clone = material.clone();

          clone.metalness = Math.max(
            clone.metalness || 0,
            0.55
          );

          clone.roughness = Math.min(
            clone.roughness ?? 0.5,
            0.32
          );

          clone.envMapIntensity = 1.4;

          return clone;
        }

        /*
          Keep the original colour of untextured parts
          while improving their metallic finish.
        */

        const clone = material.clone();

        clone.metalness = Math.max(
          clone.metalness || 0,
          0.88
        );

        clone.roughness = Math.min(
          clone.roughness ?? 0.5,
          0.25
        );

        clone.envMapIntensity = 1.6;

        if (clone.color) {
          clone.color.multiplyScalar(1.12);
        }

        return clone;
      }
    );

    object.material = Array.isArray(object.material)
      ? updatedMaterials
      : updatedMaterials[0];

    if (object.geometry) {
      object.geometry.computeVertexNormals();
    }

    object.castShadow = true;

    object.receiveShadow = true;
  });
}

/* =========================================================
   RULER TEXTURE CALIBRATION
   ========================================================= */

function fixRuler(mesh) {
  /*
    This function assumes Object_4 uses the same 1024-pixel
    ruler texture and calibration as the original script.

    It changes the UV coordinates so the ruler texture starts
    at ZERO_X and follows the specified model-unit scale.

    If the GLB uses a different UV layout, texture size, or
    ruler mesh, this function must be calibrated for that model.
  */

  mesh.updateWorldMatrix(true, false);

  const worldMatrix = mesh.matrixWorld;

  const inverseMatrix = worldMatrix.clone().invert();

  const positions = mesh.geometry.attributes.position;

  const uvs = mesh.geometry.attributes.uv;

  if (!positions || !uvs) {
    console.warn(
      "Ruler mesh has no position or UV attributes."
    );

    return;
  }

  for (let i = 0; i < positions.count; i++) {
    v3.fromBufferAttribute(
      positions,
      i
    );

    v3.applyMatrix4(worldMatrix);

    const x = Math.max(
      v3.x,
      ZERO_X
    );

    uvs.setX(
      i,
      (
        35 +
        RULER_PX_PER_MM *
        MM_PER_UNIT *
        (x - ZERO_X)
      ) / 1024
    );
  }

  positions.needsUpdate = true;

  uvs.needsUpdate = true;

  mesh.geometry.computeBoundingBox();

  mesh.geometry.computeBoundingSphere();
}

/* =========================================================
   MODEL SETUP
   ========================================================= */

function setup(model) {
  modelRoot = model;

  rig = new THREE.Group();

  rig.add(model);

  scene.add(rig);

  rig.updateMatrixWorld(true);

  improveMaterials(model);

  const movingParts = [];

  model.traverse(object => {
    if (
      MOVING.includes(object.name)
    ) {
      movingParts.push(object);
    }
  });

  /*
    Use the original ruler mesh name only if it exists.
  */

  const ruler = model.getObjectByName(
    "Object_4"
  );

  if (ruler && ruler.isMesh) {
    fixRuler(ruler);
  } else {
    console.warn(
      "Object_4 ruler mesh not found. " +
      "The original model may use another name."
    );
  }

  /*
    Keep the original moving-part names. If the Sketchfab
    model uses different names, these must be identified.
  */

  if (
    movingParts.length !== MOVING.length
  ) {
    throw new Error(
      "Expected moving parts were not found. " +
      "Check the GLB object names."
    );
  }

  slider = new THREE.Group();

  rig.add(slider);

  movingParts.forEach(part => {
    slider.attach(part);
  });

  /*
    Measure the visible model bounds.
  */

  const bounds = new THREE.Box3();

  model.updateWorldMatrix(true, true);

  model.traverse(object => {
    if (!object.isMesh || !object.visible) {
      return;
    }

    bounds.union(
      new THREE.Box3().setFromObject(object)
    );
  });

  const size = bounds.getSize(
    new THREE.Vector3()
  );

  W = size.x;

  H = size.y;

  rig.position.copy(
    bounds.getCenter(
      new THREE.Vector3()
    )
  ).negate();

  rig.updateMatrixWorld(true);

  /*
    Start with the jaw slider closed.
    The zero alignment still depends on the model's actual
    calibrated geometry.
  */

  slider.position.x = 0;

  $("jawSlider").value = 0;

  $("jawValue").textContent = "0%";

  ready = true;

  viewFull(true);

  say(
    "Caliper ready. Zoom in to inspect the scale."
  );
}

/* =========================================================
   CAMERA
   ========================================================= */

let fly = null;

function cameraDistance(span) {
  return (
    span /
    2 /
    Math.tan(
      THREE.MathUtils.degToRad(
        camera.fov / 2
      )
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
    t0: performance.now(),

    p0: camera.position.clone(),

    q0: controls.target.clone(),

    p1: position.clone(),

    q1: target.clone()
  };
}

function viewFull(instant = false) {
  const aspect = Math.max(
    camera.aspect,
    0.1
  );

  const distance = cameraDistance(
    Math.max(W / aspect, H) * 1.45
  ) + 1.5;

  go(
    new THREE.Vector3(
      0,
      0,
      distance
    ),

    new THREE.Vector3(0, 0, 0),

    instant
  );
}

function viewJaws() {
  if (!ready) return;

  const gap = slider.position.x;

  const center = rig.localToWorld(
    new THREE.Vector3(
      FACE_X + gap / 2,
      -0.55,
      FACE_Z
    )
  );

  const distance = cameraDistance(
    Math.max(
      2.2,
      (gap + 1.4) /
      Math.max(camera.aspect, 0.1)
    )
  );

  go(
    new THREE.Vector3(
      center.x,
      center.y,
      center.z + distance
    ),

    center
  );
}

$("fitButton").onclick = () => {
  if (ready) viewFull();
};

$("jawsButton").onclick = viewJaws;

/* =========================================================
   JAW SLIDER
   ========================================================= */

$("jawSlider").addEventListener(
  "input",
  () => {
    const value = Number(
      $("jawSlider").value
    );

    $("jawValue").textContent =
      value + "%";

    if (ready && !obj) {
      slider.position.x =
        (value / 100) * TRAVEL;
    }
  }
);

/* =========================================================
   SHINY RAINBOW OBJECT MATERIALS
   ========================================================= */

const rainbowMaterials = {
  sphere: new THREE.MeshPhysicalMaterial({
    color: 0xff3c66,
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.12
  }),

  cube: new THREE.MeshPhysicalMaterial({
    color: 0xffa52f,
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.12
  }),

  cylinder: new THREE.MeshPhysicalMaterial({
    color: 0x36e5a1,
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.12
  }),

  cuboid: new THREE.MeshPhysicalMaterial({
    color: 0x38a8ff,
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.12
  }),

  cone: new THREE.MeshPhysicalMaterial({
    color: 0xc06aff,
    metalness: 0.72,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.12
  })
};

/* =========================================================
   MEASURABLE SHAPES
   ========================================================= */

const SHAPES = {
  sphere: {
    f: ["Diameter"],
    max: 60,

    geo: a =>
      new THREE.SphereGeometry(
        a / 2,
        64,
        48
      ),

    h: a => a
  },

  cube: {
    f: ["Side"],
    max: 100,

    geo: a =>
      new THREE.BoxGeometry(
        a,
        a,
        a
      ),

    h: a => a
  },

  cylinder: {
    f: ["Diameter", "Height"],
    max: 100,

    geo: (a, b) =>
      new THREE.CylinderGeometry(
        a / 2,
        a / 2,
        b,
        96
      ),

    h: (a, b) => b
  },

  cuboid: {
    f: [
      "Length",
      "Width",
      "Height"
    ],

    max: 100,

    geo: (a, b, c) =>
      new THREE.BoxGeometry(
        a,
        c,
        b
      ),

    h: (a, b, c) => c
  },

  cone: {
    f: [
      "Base diameter",
      "Height"
    ],

    max: 100,

    geo: (a, b) =>
      new THREE.ConeGeometry(
        a / 2,
        b,
        96
      ),

    h: (a, b) => b
  }
};

let shape = null;

let obj = null;

/* =========================================================
   READ DIMENSIONS
   ========================================================= */

function readDims() {
  const definition = SHAPES[shape];

  const dimensions = definition.f.map(
    (_, index) => {
      return parseFloat(
        $("dim" + "ABC"[index]).value
      );
    }
  );

  const maximum = Math.min(
    definition.max,
    Math.floor(
      TRAVEL * MM_PER_UNIT
    )
  );

  if (
    dimensions.some(
      value =>
        !Number.isFinite(value) ||
        value < 1 ||
        value > definition.max
    )
  ) {
    say(
      `Enter sizes between 1 and ${definition.max} mm.`
    );

    return null;
  }

  if (dimensions[0] > maximum) {
    say(
      `The jaws open to approximately ${maximum} mm at most.`
    );

    return null;
  }

  return dimensions;
}

/* =========================================================
   PLACE OBJECT BETWEEN JAWS
   ========================================================= */

function place() {
  if (!obj || !shape || !ready) {
    return;
  }

  const dimensions = readDims();

  if (!dimensions) {
    return;
  }

  const definition = SHAPES[shape];

  const unitsPerMM = 1 / MM_PER_UNIT;

  const sizes = dimensions.map(
    value => value * unitsPerMM
  );

  obj.geometry.dispose();

  obj.geometry = definition.geo(
    ...sizes
  );

  /*
    Position the moving jaw using the first dimension.
  */

  slider.position.x = sizes[0];

  const height = definition.h(
    ...sizes
  );

  const top =
    shape === "cone"
      ? ROOT_Y - 0.05
      : ROOT_Y;

  let y = top - height / 2;

  if (shape === "sphere") {
    y = Math.max(
      y,
      -1.05
    );
  }

  obj.rotation.set(
    0,
    0,
    shape === "cone"
      ? Math.PI
      : 0
  );

  obj.position.set(
    FACE_X + sizes[0] / 2,
    y,
    FACE_Z
  );

  $("measurementAnswer").textContent =
    definition.f.map(
      (label, index) =>
        `${label}: ${dimensions[index]} mm`
    ).join("  |  ");

  say(
    `Object placed between jaws. Nominal first dimension: ${dimensions[0]} mm.`
  );
}

/* =========================================================
   SELECT OBJECT SHAPE
   ========================================================= */

function selectShape(selectedShape) {
  if (!ready) {
    say("Wait for the caliper to load.");

    return;
  }

  shape = selectedShape;

  if (obj) {
    rig.remove(obj);

    obj.geometry.dispose();
  }

  obj = new THREE.Mesh(
    new THREE.BufferGeometry(),
    rainbowMaterials[shape]
  );

  obj.castShadow = true;

  obj.receiveShadow = true;

  rig.add(obj);

  document.querySelectorAll(
    "[data-shape]"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.shape === shape
    );
  });

  "ABC".split("").forEach(
    (key, index) => {
      const enabled =
        index < SHAPES[shape].f.length;

      $("field" + key).hidden =
        !enabled;

      if (enabled) {
        $("label" + key).textContent =
          SHAPES[shape].f[index] +
          " (mm)";
      }
    }
  );

  $("objectPanel").hidden = false;

  $("jawControlPanel").hidden = true;

  place();
}

/* =========================================================
   REMOVE OBJECT
   ========================================================= */

function removeObject() {
  if (!obj) return;

  rig.remove(obj);

  obj.geometry.dispose();

  obj = null;

  shape = null;

  document.querySelectorAll(
    "[data-shape]"
  ).forEach(button => {
    button.classList.remove("active");
  });

  $("objectPanel").hidden = true;

  $("jawControlPanel").hidden = false;

  slider.position.x = Math.min(
    TRAVEL,
    Math.max(
      0,
      slider.position.x
    )
  );

  const percentage = Math.round(
    (slider.position.x / TRAVEL) * 100
  );

  $("jawSlider").value = percentage;

  $("jawValue").textContent =
    percentage + "%";

  say(
    "Object removed. Move the jaws freely."
  );
}

/* =========================================================
   CONNECT BUTTONS
   ========================================================= */

document.querySelectorAll(
  "[data-shape]"
).forEach(button => {
  button.onclick = () => {
    selectShape(
      button.dataset.shape
    );
  };
});

["dimA", "dimB", "dimC"].forEach(
  id => {
    $(id).addEventListener(
      "input",
      place
    );
  }
);

$("removeButton").onclick =
  removeObject;

/* =========================================================
   RESPONSIVE RESIZE
   ========================================================= */

new ResizeObserver(() => {
  const width = viewer.clientWidth;

  const height = viewer.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;

  camera.updateProjectionMatrix();

  renderer.setSize(
    width,
    height,
    false
  );

  if (ready && !moved) {
    viewFull(true);
  }
}).observe(viewer);

/* =========================================================
   ANIMATION
   ========================================================= */

function animate(now) {
  requestAnimationFrame(animate);

  if (fly) {
    const progress = Math.min(
      1,
      (now - fly.t0) / 500
    );

    const eased =
      progress *
      progress *
      (3 - 2 * progress);

    camera.position.lerpVectors(
      fly.p0,
      fly.p1,
      eased
    );

    controls.target.lerpVectors(
      fly.q0,
      fly.q1,
      eased
    );

    if (progress === 1) {
      fly = null;
    }
  }

  controls.update();

  renderer.render(
    scene,
    camera
  );
}

animate(performance.now());
