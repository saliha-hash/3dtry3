import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL="./verniercaliper.glb";
const MM_PER_UNIT=31.27, ZERO_X=-1.1227, FACE_X=-1.521, FACE_Z=0.366, ROOT_Y=-0.17, TRAVEL=3.47, RULER_PX=2.903;
const MOVING_NAMES=["cube004_2","cylinder_3","cube005_2","cube003"]; // kg007 model variants
const HIDE_NAMES=["circle_4","cylinder001_5"];

const $=id=>document.getElementById(id);
const say=m=>{$("status").textContent=m};
const viewer=$("viewer");

// Scene
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x050608);
const camera=new THREE.PerspectiveCamera(28,1,0.01,1000);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.45;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
viewer.appendChild(renderer.domElement);

// Lights - shiny silver
scene.add(new THREE.HemisphereLight(0xf0f6ff,0x1a1f2a,1.8));
[[0xffffff,6,5,7,6],[0xd6e8ff,3, -6,4,5],[0xffffff,3, 3,-5,-4],[0xffffff,1.5,-4,-2,2]].forEach(([c,i,x,y,z])=>{let l=new THREE.DirectionalLight(c,i);l.position.set(x,y,z);scene.add(l);});

// Env for reflections
const pmrem=new THREE.PMREMGenerator(renderer);
const envTex=pmrem.fromScene(new RoomEnvironment(),0.04).texture;
scene.environment=envTex;

// Controls
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.07; controls.zoomToCursor=true;
controls.minDistance=0.15; controls.maxDistance=30;
let moved=false; controls.addEventListener("start",()=>moved=true);

// Vars
let rig,slider,ready=false,W=6,H=2.5,modelRoot;

new GLTFLoader().load(MODEL,g=>{
try{setup(g.scene)}catch(e){console.error(e);say("Setup error: "+e.message)}},null,e=>{console.error(e);say("Cannot load verniercaliper.glb")});

function enhance(model){
model.traverse(o=>{
if(!o.isMesh) return;
let n=(o.name||"").toLowerCase();
if(HIDE_NAMES.includes(n)){o.visible=false;return}
let mats=Array.isArray(o.material)?o.material:[o.material];
o.material= (Array.isArray(o.material)?mats:[mats[0]]).map(m=>{
if(!m) return m;
let cl=m.clone();
if(m.map){ // has scale texture - KEEP IT CLEAR
cl.map=m.map; cl.map.anisotropy=renderer.capabilities.getMaxAnisotropy(); cl.map.colorSpace=THREE.SRGBColorSpace;
cl.metalness=0.2; cl.roughness=0.75; cl.envMapIntensity=0.2; // keep texture readable
}else{
cl.metalness=0.96; cl.roughness=0.18; cl.clearcoat=0.9; cl.clearcoatRoughness=0.15; cl.envMapIntensity=1.8;
if(cl.color) cl.color.multiplyScalar(1.08);
}
return cl;
})[0] ?? o.material;
if(Array.isArray(o.material)) o.material=mats.map((_,i)=>o.material[i]||o.material);
o.castShadow=true; o.receiveShadow=true; if(o.geometry) o.geometry.computeVertexNormals();
});
}

function fixRuler(mesh){
try{
mesh.updateWorldMatrix(true,false);
let pos=mesh.geometry.attributes.position, uv=mesh.geometry.attributes.uv;
if(!pos||!uv) return;
let v=new THREE.Vector3(), wm=mesh.matrixWorld;
for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(wm);let x=Math.max(v.x,ZERO_X);uv.setX(i,(35+RULER_PX*MM_PER_UNIT*(x-ZERO_X))/1024)}
uv.needsUpdate=true;
}catch(e){console.warn("ruler fix",e)}
}

function setup(model){
modelRoot=model; rig=new THREE.Group(); rig.add(model); scene.add(rig); rig.updateMatrixWorld(true);
enhance(model);
// find moving
let moving=[];
model.traverse(o=>{if(!o.isMesh) return; let name=o.name; if(MOVING_NAMES.includes(name)) moving.push(o);});
// fallback: auto-detect by bounding box on right side
if(moving.length===0){
model.traverse(o=>{if(!o.isMesh) return; let b=new THREE.Box3().setFromObject(o); let c=b.getCenter(new THREE.Vector3()); if(c.x>-0.2) moving.push(o);});
}
let ruler=model.getObjectByName("Object_4"); if(ruler?.isMesh) fixRuler(ruler);
if(moving.length===0) throw new Error("Moving jaws not found");
slider=new THREE.Group(); rig.add(slider); moving.forEach(p=>slider.attach(p));
// bounds
let box=new THREE.Box3(); model.traverse(o=>{if(o.isMesh&&o.visible) box.union(new THREE.Box3().setFromObject(o))});
let s=box.getSize(new THREE.Vector3()); W=s.x; H=s.y; rig.position.copy(box.getCenter(new THREE.Vector3())).negate(); rig.updateMatrixWorld(true);
slider.position.x=0; $("jaw").value=0; $("jawValue").textContent="0%";
ready=true; viewFull(true); say("Ready. Use Zoom Jaws to read scale.");
}

let fly=null;
function camDist(span){return span/2/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))}
function go(p,t,instant=false){if(instant){camera.position.copy(p);controls.target.copy(t);controls.update();fly=null;return}fly={t0:performance.now(),p0:camera.position.clone(),q0:controls.target.clone(),p1:p.clone(),q1:t.clone()}}
function viewFull(i=false){let a=Math.max(camera.aspect,0.1),d=camDist(Math.max(W/a,H)*1.45)+1.4;go(new THREE.Vector3(0,0,d),new THREE.Vector3(0,0,0),i)}
function viewJaws(){if(!ready) return;let g=slider.position.x, c=rig.localToWorld(new THREE.Vector3(FACE_X+g/2,-0.55,FACE_Z));let d=camDist(Math.max(1.8,(g+1.2)/Math.max(camera.aspect,0.1)));go(new THREE.Vector3(c.x,c.y,c.z+d),c)}
$("fitBtn").onclick=()=>viewFull(); $("jawBtn").onclick=viewJaws;

$("jaw").addEventListener("input",()=>{let v=Number($("jaw").value);$("jawValue").textContent=v+"%";if(ready&&!obj) slider.position.x=v/100*TRAVEL});

// Shapes
const mats={
sphere:new THREE.MeshPhysicalMaterial({color:0xff3c66,metalness:0.7,roughness:0.18,clearcoat:1}),
cube:new THREE.MeshPhysicalMaterial({color:0xffa52f,metalness:0.7,roughness:0.18,clearcoat:1}),
cylinder:new THREE.MeshPhysicalMaterial({color:0x36e5a1,metalness:0.7,roughness:0.18,clearcoat:1}),
cuboid:new THREE.MeshPhysicalMaterial({color:0x38a8ff,metalness:0.7,roughness:0.18,clearcoat:1}),
cone:new THREE.MeshPhysicalMaterial({color:0xc06aff,metalness:0.7,roughness:0.18,clearcoat:1}),
};
const SHAPES={
sphere:{l:["Diameter"],max:60,geo:a=>new THREE.SphereGeometry(a/2,48,32),h:a=>a},
cube:{l:["Side"],max:100,geo:a=>new THREE.BoxGeometry(a,a,a),h:a=>a},
cylinder:{l:["Diameter","Height"],max:100,geo:(a,b)=>new THREE.CylinderGeometry(a/2,a/2,b,64),h:(a,b)=>b},
cuboid:{l:["Length","Width","Height"],max:100,geo:(a,b,c)=>new THREE.BoxGeometry(a,c,b),h:(a,b,c)=>c},
cone:{l:["Base dia","Height"],max:100,geo:(a,b)=>new THREE.ConeGeometry(a/2,b,64),h:(a,b)=>b},
};
let shape=null,obj=null;
function readDims(){let def=SHAPES[shape];let dims=def.l.map((_,i)=>parseFloat($("d"+"ABC"[i]).value));let max=Math.min(def.max,Math.floor(TRAVEL*MM_PER_UNIT));if(dims.some(v=>!isFinite(v)||v<1||v>def.max)){say(`Enter 1-${def.max} mm`);return null}if(dims[0]>max){say(`Max open ~${max} mm`);return null}return dims}
function place(){if(!obj||!shape||!ready) return;let dims=readDims();if(!dims) return;let def=SHAPES[shape],u=1/MM_PER_UNIT,sz=dims.map(v=>v*u);obj.geometry.dispose();obj.geometry=def.geo(...sz);slider.position.x=sz[0];let h=def.h(...sz),top=shape==="cone"?ROOT_Y-0.05:ROOT_Y,y=top-h/2;if(shape==="sphere") y=Math.max(y,-1.05);obj.rotation.set(0,0,shape==="cone"?Math.PI:0);obj.position.set(FACE_X+sz[0]/2,y,FACE_Z);$("ans").textContent=def.l.map((lb,i)=>`${lb}: ${dims[i]} mm`).join(" | ");say(`Placed ${dims[0]} mm`)}
function sel(s){if(!ready){say("Wait loading");return}shape=s;if(obj){rig.remove(obj);obj.geometry.dispose()}obj=new THREE.Mesh(new THREE.BufferGeometry(),mats[s]);obj.castShadow=true;obj.receiveShadow=true;rig.add(obj);document.querySelectorAll("[data-s]").forEach(b=>b.classList.toggle("active",b.dataset.s===s));"ABC".split("").forEach((k,i)=>{let en=i<SHAPES[s].l.length;$("f"+k).hidden=!en;if(en)$("l"+k).textContent=SHAPES[s].l[i]+" (mm)"});$("objPanel").hidden=false;$("jawPanel").hidden=true;place()}
function remObj(){if(!obj) return;rig.remove(obj);obj.geometry.dispose();obj=null;shape=null;document.querySelectorAll("[data-s]").forEach(b=>b.classList.remove("active"));$("objPanel").hidden=true;$("jawPanel").hidden=false;let p=Math.round(slider.position.x/TRAVEL*100);$("jaw").value=p;$("jawValue").textContent=p+"%";say("Removed. Move jaws freely.")}
document.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>sel(b.dataset.s));
["dA","dB","dC"].forEach(id=>$(id).addEventListener("input",place));
$("rem").onclick=remObj;

// resize
new ResizeObserver(()=>{let w=viewer.clientWidth,h=viewer.clientHeight;if(!w||!h) return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(ready&&!moved) viewFull(true)}).observe(viewer);

// anim
(function anim(t){requestAnimationFrame(anim);if(fly){let pr=Math.min(1,(t-fly.t0)/500),e=pr*pr*(3-2*pr);camera.position.lerpVectors(fly.p0,fly.p1,e);controls.target.lerpVectors(fly.q0,fly.q1,e);if(pr===1) fly=null}controls.update();renderer.render(scene,camera)})(performance.now());
