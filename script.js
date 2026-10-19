import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL="./verniercaliper.glb";

// Original model estimates; physical calibration still needs verification.
const MM_PER_UNIT=31.27, FACE_X=-1.521, FACE_Z=0.366, ROOT_Y=-0.17, TRAVEL=3.47;

// Exact, case-sensitive node names in your uploaded GLB.
const MOVING=["Cube.004_2","Cylinder_3"];
const HIDE=new Set(["Circle_4","Cylinder.001_5"]);

const $=id=>document.getElementById(id);
const say=msg=>$("status").textContent=msg;
const viewer=$("viewer");

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x020203);

const camera=new THREE.PerspectiveCamera(30,1,0.01,1000);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
viewer.appendChild(renderer.domElement);

// Studio lighting for reflective silver without overwhelming the markings.
scene.add(new THREE.HemisphereLight(0xe5edf5,0x17191d,1.35));

function light(color,intensity,x,y,z){
  const l=new THREE.DirectionalLight(color,intensity);
  l.position.set(x,y,z);
  scene.add(l);
}
light(0xffffff,3.0,4,6,7);
light(0xe4eaf2,2.0,-5,2,3);
light(0xffffff,2.5,1,-4,-5);
light(0xffffff,1.1,-4,-2,2);

// Reflections are essential for a metallic appearance.
const pmrem=new THREE.PMREMGenerator(renderer);
const env=new RoomEnvironment();
scene.environment=pmrem.fromScene(env,0.04).texture;
env.dispose();
pmrem.dispose();

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=0.075;
controls.zoomToCursor=true;
controls.screenSpacePanning=true;
controls.minDistance=0.2;
controls.maxDistance=40;
controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};

let userMoved=false;
controls.addEventListener("start",()=>userMoved=true);

let rig=null,slider=null,ready=false;
let modelCenter=new THREE.Vector3();
let modelW=17,modelH=6,modelD=4;
let obj=null,shape=null,fly=null;

new GLTFLoader().load(
  MODEL,
  gltf=>{
    try{setup(gltf.scene);}
    catch(e){console.error(e);say("Model setup failed: "+e.message);}
  },
  undefined,
  e=>{
    console.error(e);
    say("Could not load verniercaliper.glb. Check its filename and folder.");
  }
);

// Improve reflections while preserving the original textures and UV coordinates.
function improveMaterials(model){
  const maxAniso=renderer.capabilities.getMaxAnisotropy();

  model.traverse(o=>{
    if(!o.isMesh)return;
    if(HIDE.has(o.name)){o.visible=false;return;}

    const src=Array.isArray(o.material)?o.material:[o.material];
    const mats=src.map(m=>{
      if(!m)return m;
      const c=m.clone();

      // Keep the scale texture mapped exactly as the model author created it.
      if(c.map){
        c.map.anisotropy=maxAniso;
        c.map.magFilter=THREE.LinearFilter;
        c.map.needsUpdate=true;

        const targetMetal=o.name==="Object_4"?0.18:0.28;
        c.metalness=Math.max(c.metalness||0,targetMetal);
        c.roughness=Math.min(c.roughness??0.5,0.34);
        c.envMapIntensity=1.15;
      }else{
        c.metalness=Math.max(c.metalness??0,0.72);
        c.roughness=Math.min(c.roughness??0.5,0.24);
        c.envMapIntensity=1.45;
        if(c.color)c.color.multiplyScalar(1.08);
        if("clearcoat" in c){
          c.clearcoat=0.55;
          c.clearcoatRoughness=0.18;
        }
      }

      return c;
    });

    o.material=Array.isArray(o.material)?mats:mats[0];
    o.castShadow=true;
    o.receiveShadow=true;
  });
}

function setup(model){
  rig=new THREE.Group();
  rig.add(model);
  scene.add(rig);
  rig.updateMatrixWorld(true);
  improveMaterials(model);

  const parts=[];
  model.traverse(o=>{if(MOVING.includes(o.name))parts.push(o);});

  if(parts.length!==MOVING.length){
    throw Error("Moving jaw groups not found. Expected: "+MOVING.join(", "));
  }

  slider=new THREE.Group();
  rig.add(slider);
  parts.forEach(p=>slider.attach(p));

  // Keep the GLB in its original coordinate system so jaw and object
  // positions use the same coordinates as the supplied model.
  rig.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(rig);
  const size=bounds.getSize(new THREE.Vector3());

  modelCenter.copy(bounds.getCenter(new THREE.Vector3()));
  modelW=size.x;
  modelH=size.y;
  modelD=size.z;

  slider.position.x=0;
  $("jawSlider").value=0;
  $("jawValue").textContent="0%";

  ready=true;
  viewFull(true);
  say("Caliper loaded. Zoom on Jaws to inspect the scale.");
}

function camDist(span){
  return span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
}

function go(pos,target,instant=false){
  if(instant){
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    fly=null;
    return;
  }

  fly={
    t:performance.now(),
    p:camera.position.clone(),
    q:controls.target.clone(),
    to:pos.clone(),
    qt:target.clone()
  };
}

function viewFull(instant=false){
  const span=Math.max(modelW/Math.max(camera.aspect,0.35),modelH,modelD)*1.28;
  const d=camDist(span);
  go(modelCenter.clone().add(new THREE.Vector3(0,0,d+modelD*0.5)),modelCenter,instant);
}

function viewJaws(){
  if(!ready)return;
  const target=rig.localToWorld(
    new THREE.Vector3(FACE_X+slider.position.x/2,ROOT_Y,FACE_Z)
  );
  const d=camDist(Math.max(1.6,(1.6+slider.position.x)/Math.max(camera.aspect,0.45)));
  go(target.clone().add(new THREE.Vector3(0,0,d)),target);
}

$("fitButton").onclick=()=>{if(ready)viewFull();};
$("jawsButton").onclick=viewJaws;

$("jawSlider").addEventListener("input",()=>{
  const n=Number($("jawSlider").value);
  $("jawValue").textContent=n+"%";
  if(ready&&!obj)slider.position.x=n/100*TRAVEL;
});

// Shiny coloured practice objects.
const materials={
  sphere:new THREE.MeshPhysicalMaterial({color:0xff3c66,metalness:0.72,roughness:0.16,clearcoat:1,clearcoatRoughness:0.12}),
  cube:new THREE.MeshPhysicalMaterial({color:0xffa52f,metalness:0.72,roughness:0.16,clearcoat:1,clearcoatRoughness:0.12}),
  cylinder:new THREE.MeshPhysicalMaterial({color:0x36e5a1,metalness:0.72,roughness:0.16,clearcoat:1,clearcoatRoughness:0.12}),
  cuboid:new THREE.MeshPhysicalMaterial({color:0x38a8ff,metalness:0.72,roughness:0.16,clearcoat:1,clearcoatRoughness:0.12}),
  cone:new THREE.MeshPhysicalMaterial({color:0xc06aff,metalness:0.72,roughness:0.16,clearcoat:1,clearcoatRoughness:0.12})
};

const SHAPES={
  sphere:{fields:["Diameter"],max:60,geo:a=>new THREE.SphereGeometry(a/2,64,48),height:a=>a},
  cube:{fields:["Side"],max:100,geo:a=>new THREE.BoxGeometry(a,a,a),height:a=>a},
  cylinder:{fields:["Diameter","Height"],max:100,geo:(a,b)=>new THREE.CylinderGeometry(a/2,a/2,b,64),height:(a,b)=>b},
  cuboid:{fields:["Length","Width","Height"],max:100,geo:(a,b,c)=>new THREE.BoxGeometry(a,c,b),height:(a,b,c)=>c},
  cone:{fields:["Base diameter","Height"],max:100,geo:(a,b)=>new THREE.ConeGeometry(a/2,b,64),height:(a,b)=>b}
};

function readDims(){
  const def=SHAPES[shape];
  const vals=def.fields.map((_,i)=>Number($("dim"+"ABC"[i]).value));
  const max=Math.min(def.max,Math.floor(TRAVEL*MM_PER_UNIT));

  if(vals.some(n=>!Number.isFinite(n)||n<1||n>def.max)){
    say(`Enter dimensions from 1 to ${def.max} mm.`);
    return null;
  }

  if(vals[0]>max){
    say(`Maximum first dimension is approximately ${max} mm.`);
    return null;
  }

  return vals;
}

function place(){
  if(!obj||!shape||!ready)return;

  const dims=readDims();
  if(!dims)return;

  const def=SHAPES[shape];
  const sizes=dims.map(n=>n/MM_PER_UNIT);

  obj.geometry.dispose();
  obj.geometry=def.geo(...sizes);

  // Open the moving jaw by the width/diameter of the object.
  slider.position.x=sizes[0];

  const h=def.height(...sizes);
  const y=ROOT_Y-h/2;

  obj.rotation.set(0,0,shape==="cone"?Math.PI:0);
  obj.position.set(FACE_X+sizes[0]/2,y,FACE_Z);

  $("measurementAnswer").textContent=
    def.fields.map((f,i)=>`${f}: ${dims[i]} mm`).join("  |  ");

  say(`Object placed. Entered first dimension: ${dims[0]} mm.`);
}

function selectShape(name){
  if(!ready){say("Wait for the calliper to load.");return;}

  shape=name;

  if(obj){
    rig.remove(obj);
    obj.geometry.dispose();
  }

  obj=new THREE.Mesh(new THREE.BufferGeometry(),materials[shape]);
  obj.castShadow=true;
  obj.receiveShadow=true;
  rig.add(obj);

  document.querySelectorAll("[data-shape]").forEach(b=>{
    b.classList.toggle("active",b.dataset.shape===shape);
  });

  "ABC".split("").forEach((k,i)=>{
    const on=i<SHAPES[shape].fields.length;
    $("field"+k).hidden=!on;
    if(on)$("label"+k).textContent=SHAPES[shape].fields[i]+" (mm)";
  });

  $("objectPanel").hidden=false;
  $("jawControlPanel").hidden=true;
  place();
}

function removeObject(){
  if(!obj)return;

  rig.remove(obj);
  obj.geometry.dispose();
  obj=null;
  shape=null;

  document.querySelectorAll("[data-shape]").forEach(b=>b.classList.remove("active"));
  $("objectPanel").hidden=true;
  $("jawControlPanel").hidden=false;

  slider.position.x=THREE.MathUtils.clamp(slider.position.x,0,TRAVEL);
  const n=Math.round(slider.position.x/TRAVEL*100);
  $("jawSlider").value=n;
  $("jawValue").textContent=n+"%";

  say("Object removed. Move the jaws freely.");
}

document.querySelectorAll("[data-shape]").forEach(b=>{
  b.onclick=()=>selectShape(b.dataset.shape);
});

["dimA","dimB","dimC"].forEach(id=>{
  $(id).addEventListener("input",place);
});

$("removeButton").onclick=removeObject;

new ResizeObserver(()=>{
  const w=viewer.clientWidth,h=viewer.clientHeight;
  if(!w||!h)return;

  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);

  if(ready&&!userMoved)viewFull(true);
}).observe(viewer);

function animate(now){
  requestAnimationFrame(animate);

  if(fly){
    const t=Math.min(1,(now-fly.t)/500);
    const e=t*t*(3-2*t);

    camera.position.lerpVectors(fly.p,fly.to,e);
    controls.target.lerpVectors(fly.q,fly.qt,e);

    if(t===1)fly=null;
  }

  controls.update();
  renderer.render(scene,camera);
}

animate(performance.now());
