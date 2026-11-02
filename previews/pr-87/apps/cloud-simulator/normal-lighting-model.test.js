/* Purpose: Verify orientation and independent light obstruction. Consumers: Node test runner. Dependencies: normal-lighting-model.js. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facing,shadeCloud} from './normal-lighting-model.js';
test('Lambert cosine limits and wrapped reach',()=>{assert.equal(facing(1),1);assert.equal(facing(.5),.5);assert.equal(facing(0),0);assert.equal(facing(-1),0);assert.ok(facing(-.2,'wrapped',.4)>0);});
const asset=()=>({width:3,height:1,normals:new Float32Array([0,0,1,0,0,1,0,0,1]),depth:new Float32Array([0,3,0]),thickness:new Float32Array([1,6,1]),coverage:new Float32Array([1,1,1])});
test('sun-facing patch can be obstructed independently',()=>{const f=shadeCloud(asset(),{azimuth:75,elevation:0,diffusionAmount:0});assert.ok(f.facing[0]>0);assert.ok(f.visibility[0]<f.visibility[2]);assert.ok(f.diffusion.every(v=>v===0));});
test('gradient changes colors without changing orientation or visibility',()=>{const a=shadeCloud(asset(),{gradientPosition:0}),b=shadeCloud(asset(),{gradientPosition:1});assert.deepEqual(a.facing,b.facing);assert.deepEqual(a.visibility,b.visibility);assert.notDeepEqual(a.incoming,b.incoming);for(const mode of ['lambert','wrapped','ramp'])assert.ok(shadeCloud(asset(),{model:mode}).scene.every(Number.isFinite));});

import {drawSunMarker,normalLighting} from './normal-lighting-experiment.js';
test('sun marker moves with light direction and stays visible at extremes',()=>{
 const frame=()=>new Uint8ClampedArray(96*60*4);
 const left=drawSunMarker(frame(),96,60,{azimuth:-40,elevation:25});
 const right=drawSunMarker(frame(),96,60,{azimuth:40,elevation:25});
 assert.notDeepEqual(left,right);
 assert.ok(drawSunMarker(frame(),96,60,{azimuth:180,elevation:90}).some(v=>v===255));
});
test('shape selector replaces sphere with teardrop',()=>{
 assert.deepEqual(normalLighting.params.find(p=>p.key==='cloudShape').options.map(o=>o[0]),['cluster','wisps','teardrop','image']);
});

import {gradientColor} from './normal-lighting-model.js';
test('gradient endpoints reverse and warping moves interior colors',()=>{
 const p={gradientCompression:1,gradientKind:'sunset'};
 assert.deepEqual(gradientColor(0,p),gradientColor(1,{...p,gradientStart:1,gradientEnd:0}));
 assert.notDeepEqual(gradientColor(.3,p),gradientColor(.3,{...p,gradientWarp:3}));
});
test('explicit composition terms add to final and toggles remove only their term',()=>{
 const p={elevation:25,lightSource:'moon',gradientKind:'auto'};
 const a=shadeCloud(asset(),p),b=shadeCloud(asset(),{...p,diffusionEnabled:false});
 for(let i=0;i<a.scene.length;i++){
  assert.ok(Math.abs(a.scene[i]-a.ambientPass[i]-a.directAdded[i]-a.diffusionAdded[i])<1e-6);
  assert.ok(Math.abs(a.scene[i]-b.scene[i]-a.diffusionAdded[i])<1e-6);
 }
 assert.notDeepEqual(a.incoming,shadeCloud(asset(),{...p,lightSource:'sun'}).incoming);
});
test('inspection view remains saved but is hidden from generated controls',()=>{
 assert.equal(normalLighting.params.find(p=>p.key==='view').hidden,true);
 assert.equal(normalLighting.params.find(p=>p.key==='view').randomize,false);
 assert.ok(normalLighting.sunShape.sunPathWidth>30);
 assert.notEqual(normalLighting.sunShape.sunPathX,0);
});
