/* Purpose: Verify camera/light orientation, exact intersections and independent transport.
 * Consumers: Node test runner. Dependencies: cloud-geometry and normal-lighting models. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA,createCloudScene,cameraRay,projectDirection,lightDirection,intersectEllipsoid,surfaceNormal,opticalDepth,pickCloud,renderCloudScene,dot} from './cloud-geometry.js';
import {shadeCloud} from './normal-lighting-model.js';
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
 for(const cloud of world.clouds){const uv=projectDirection(cloud.center.map((v,i)=>v-world.camera.position[i]));assert.equal(pickCloud(world,...uv),cloud.id);}
 for(const elevation of [-15,0,25,90]){const f=renderCloudScene(world,{}, {azimuth:20,elevation},24,15);for(const field of Object.values(f))assert.ok(field.every(Number.isFinite));}
});
test('contributions add exactly, controls stay independent and sun motion leaves geometry fixed',()=>{
 const world=createCloudScene(),sun={azimuth:15,elevation:20};
 const a=renderCloudScene(world,{},sun,24,15),b=renderCloudScene(world,{diffusionEnabled:false},sun,24,15),c=renderCloudScene(world,{broadNormalInfluence:0,gradientPosition:.1},sun,24,15);
 for(let i=0;i<a.scene.length;i++){assert.ok(Math.abs(a.scene[i]-a.ambientPass[i]-a.directAdded[i]-a.diffusionAdded[i])<1e-6);assert.ok(Math.abs(a.scene[i]-b.scene[i]-a.diffusionAdded[i])<1e-6);}
 assert.deepEqual(a.visibility,c.visibility);assert.deepEqual(a.facing,c.facing);assert.deepEqual(a.transmission,c.transmission);assert.notDeepEqual(a.incoming,c.incoming);
 const d=renderCloudScene(world,{}, {azimuth:-15,elevation:40},24,15);assert.deepEqual(a.depth,d.depth);assert.deepEqual(a.coverage,d.coverage);
});
