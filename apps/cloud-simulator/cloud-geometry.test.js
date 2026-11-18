/* Purpose: Verify camera/light orientation, exact intersections and independent transport.
 * Consumers: Node test runner. Dependencies: cloud-geometry and normal-lighting models. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA,createCloudScene,cameraRay,projectDirection,lightDirection,intersectEllipsoid,surfaceNormal,opticalDepth,pickCloud,renderCloudScene,dot,gradientAxis,gradientCoordinate,spatialGradientColor,hueColor,earthLightAt,illuminationAt,along,directIlluminationAt,sideSurfaceSamples,rayCloud} from './cloud-geometry.js';
import {shadeCloud,gradientColor} from './normal-lighting-model.js';
const sphere={id:'test',center:[0,0,6],radii:[2,2,2]};
const scene={camera:{...CAMERA,position:[0,0,0],pitch:0},clouds:[sphere]};
test('ray intervals and normals describe the same closed body',()=>{
 assert.deepEqual(intersectEllipsoid([0,0,0],[0,0,1],sphere),[4,8]);
 assert.deepEqual(intersectEllipsoid([0,0,6],[0,0,1],sphere),[0,2]);
 assert.equal(intersectEllipsoid([0,0,0],[0,0,-1],sphere),null);
 assert.deepEqual(surfaceNormal([0,0,4],sphere),[0,0,-1]);
 assert.equal(opticalDepth(scene,[0,0,0],[0,0,1],.5),2);
});
test('perspective projection round trips and excludes sources behind the camera',()=>{
 for(const u of [.1,.5,.9])for(const v of [.1,.5,.9]){const uv=projectDirection(cameraRay(u,v));assert.ok(Math.abs(uv[0]-u)<1e-10);assert.ok(Math.abs(uv[1]-v)<1e-10);}
 assert.equal(projectDirection([0,0,-1]),null);
 assert.ok(lightDirection({azimuth:0,elevation:0})[2]>0);
});
test('visible front surface is dark under centered background sunlight but transmits light',()=>{
 const f=renderCloudScene(scene,{cloudDensity:.5,gradientStrength:0},{azimuth:0,elevation:0},1,1);
 assert.equal(f.facing[0],0);assert.ok(f.transmission[0]>0);assert.ok(f.diffusionAdded.some(v=>v>0));
 const dense=renderCloudScene(scene,{cloudDensity:2,gradientStrength:0},{azimuth:0,elevation:0},1,1);
 assert.ok(dense.transmission[0]<f.transmission[0]);
 const empty=renderCloudScene({...scene,clouds:[]},{},{azimuth:0,elevation:0},1,1);
 assert.ok(f.ambientPass[0]<empty.sky[0]);
});
test('baked +Z toward camera uses the same background-light convention',()=>{
 const asset={width:1,height:1,normals:new Float32Array([0,0,1]),depth:new Float32Array([0]),thickness:new Float32Array([2]),coverage:new Float32Array([1])};
 assert.equal(shadeCloud(asset,{azimuth:0,elevation:10}).facing[0],0);
});
test('occluders attenuate sunlight along full world-space paths',()=>{
 const blocker={id:'blocker',center:[0,0,12],radii:[2,2,2]};
 assert.ok(opticalDepth({...scene,clouds:[sphere,blocker]},[0,0,4],[0,0,1],.5)>opticalDepth(scene,[0,0,4],[0,0,1],.5));
});
test('nearest cloud selection agrees with geometry and all inspector values stay finite',()=>{
 assert.equal(pickCloud(scene,.5,.5),'test');
 const world=createCloudScene();
 for(const cloud of world.clouds){const uv=projectDirection(cloud.center.map((v,i)=>v-world.camera.position[i]));assert.equal(pickCloud({...world,clouds:[cloud]},...uv),cloud.id);}
 for(const elevation of [-15,0,25,90]){const f=renderCloudScene(world,{}, {azimuth:20,elevation},24,15);for(const field of Object.values(f))assert.ok(field.every(Number.isFinite));}
});
test('contributions add exactly, controls stay independent and sun motion leaves geometry fixed',()=>{
 const world=createCloudScene(),sun={azimuth:15,elevation:20};
 const a=renderCloudScene(world,{},sun,24,15),b=renderCloudScene(world,{diffusionEnabled:false},sun,24,15),c=renderCloudScene(world,{broadNormalInfluence:0,gradientPosition:.1},sun,24,15);
 for(let i=0;i<a.scene.length;i++){assert.ok(Math.abs(a.scene[i]-a.ambientPass[i]-a.directAdded[i]-a.diffusionAdded[i])<1e-6);assert.ok(Math.abs(a.scene[i]-b.scene[i]-a.diffusionAdded[i])<1e-6);}
 assert.deepEqual(a.visibility,c.visibility);assert.deepEqual(a.facing,c.facing);assert.deepEqual(a.transmission,c.transmission);assert.notDeepEqual(a.incoming,c.incoming);
 const d=renderCloudScene(world,{}, {azimuth:-15,elevation:40},24,15);assert.deepEqual(a.depth,d.depth);assert.deepEqual(a.coverage,d.coverage);
});

test('perpendicular hue and Earth-shadow fields vary independently',()=>{
 const sun={azimuth:25,elevation:-5},params={broadNormalInfluence:0,shadowHeight:0,shadowSoftness:8},p=[0,0,50];
 const l=lightDirection(sun),up=gradientAxis(sun);
 assert.ok(Math.abs(dot(up,l))<1e-12);
 const toward=along(p,l,8),away=along(p,l,-8),above=along(p,up,8),below=along(p,up,-8);
 assert.ok(Math.abs(earthLightAt(toward,params,sun)-earthLightAt(away,params,sun))<1e-12);
 assert.ok(earthLightAt(above,params,sun)>earthLightAt(below,params,sun));
 assert.ok(Math.abs(gradientCoordinate(above,params,sun)-gradientCoordinate(below,params,sun))<1e-12);
 assert.ok(gradientCoordinate(toward,params,sun)>gradientCoordinate(away,params,sun));
 const red=hueColor(.1),yellow=hueColor(.9);assert.ok(red[1]<yellow[1]);assert.equal(Math.max(...red),Math.max(...yellow));
 const c=spatialGradientColor(p,params,sun),lit=illuminationAt(p,params,sun);c.forEach((v,i)=>assert.ok(Math.abs(lit[i]-v*earthLightAt(p,params,sun))<1e-12));
 assert.deepEqual(createCloudScene().clouds.map(c=>c.center[1]),Array(10).fill(6));
});
test('Earth-shadow intensity modulates direct and volume light independently of hue',()=>{
 const sun={azimuth:180,elevation:5},base={broadNormalInfluence:0,shadowHeight:-100},dark={...base,shadowHeight:100,shadowFloor:0};
 const lit=renderCloudScene(scene,base,sun,1,1),shadow=renderCloudScene(scene,dark,sun,1,1);
 assert.ok(lit.directAdded.some(v=>v>0));assert.ok(lit.diffusionAdded.some(v=>v>0));
 assert.ok(shadow.directAdded.every(v=>v===0));assert.ok(shadow.diffusionAdded.every(v=>v===0));
 for(const key of ['colorCoordinate','coverage','depth','facing','visibility','transmission'])assert.deepEqual(lit[key],shadow[key]);
});
test('at dusk upper and sunward clouds retain light after lower near clouds enter shadow',()=>{
 const sun={azimuth:0,elevation:-10};
 assert.ok(earthLightAt([0,6,40],{},sun)>earthLightAt([0,6,9],{},sun));
 assert.ok(earthLightAt([0,15,9],{},sun)>earthLightAt([0,1,9],{},sun));
 assert.ok(illuminationAt([0,15,9],{},sun).some(v=>v>.5));
});

test('single sunset ramp is red away from the source and blue-purple toward it',()=>{
 const away=hueColor(0),near=hueColor(1);
 assert.ok(away[0]>away[2]*10);assert.ok(near[2]>near[0]*5);
 assert.deepEqual(hueColor(.4,{gradientKind:'moon'}),hueColor(.4,{gradientKind:'spectrum'}));
});
test('side samples use real surfaces and direct incident light excludes reflected facing',()=>{
 const world=createCloudScene(),samples=sideSurfaceSamples(world),sun={azimuth:0,elevation:15},params={};
 samples.forEach((layer,k)=>{const sample=layer.find(Boolean);assert.ok(sample);const cloud=world.clouds[k];
  assert.ok(rayCloud(cloud,along(sample.point,sample.geometricNormal,.01),sample.geometricNormal.map(v=>-v)).length);
  const result=directIlluminationAt(world,sample.point,sample.normal,sample.geometricNormal,params,sun);
  result.color.forEach((v,c)=>assert.ok(Math.abs(v-result.incoming[c]*result.visibility)<1e-12));
  assert.deepEqual(result,directIlluminationAt(world,sample.point,sample.normal,sample.geometricNormal,{detailShadingStrength:0},sun));
 });
 const f=renderCloudScene(scene,{shadowHeight:-100},{azimuth:0,elevation:0},1,1);
 assert.equal(f.facing[0],0);assert.ok(f.directIncident.some(v=>v>0));assert.ok(f.directAdded.every(v=>v===0));
});

test('five layers contain two distinct clouds with open sky in the default composition',()=>{
 const world=createCloudScene();assert.equal(world.layers.length,5);assert.equal(world.clouds.length,10);
 assert.equal(new Set(world.clouds.map(c=>c.id)).size,10);
 for(const layer of world.layers){const clouds=world.clouds.filter(c=>c.layerId===layer.id);assert.equal(clouds.length,2);assert.notEqual(clouds[0].center[0],clouds[1].center[0]);}
 let sky=0,cloud=0;const visible=new Set();
 for(let y=0;y<50;y++)for(let x=0;x<80;x++){const id=pickCloud(world,(x+.5)/80,(y+.5)/50);if(id){cloud++;visible.add(id);}else sky++;}
 assert.ok(sky>cloud,'retain more sky than solid coverage');assert.ok(cloud>100,'clouds visibly populate the scene');assert.equal(visible.size,10);
});
