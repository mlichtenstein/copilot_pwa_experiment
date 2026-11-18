/* Purpose: Verify orientation and independent light obstruction. Consumers: Node test runner. Dependencies: normal-lighting-model.js. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facing,shadeCloud} from './normal-lighting-model.js';
test('Lambert cosine limits and wrapped reach',()=>{assert.equal(facing(1),1);assert.equal(facing(.5),.5);assert.equal(facing(0),0);assert.equal(facing(-1),0);assert.ok(facing(-.2,'wrapped',.4)>0);});
const asset=()=>({width:3,height:1,normals:new Float32Array([0,0,1,0,0,1,0,0,1]),depth:new Float32Array([0,3,0]),thickness:new Float32Array([1,6,1]),coverage:new Float32Array([1,1,1])});
test('sun-facing patch can be obstructed independently',()=>{const source=asset();source.normals=new Float32Array([1,0,0,1,0,0,1,0,0]);const f=shadeCloud(source,{azimuth:75,elevation:0,diffusionAmount:0});assert.ok(f.facing[0]>0);assert.ok(f.visibility[0]<f.visibility[2]);assert.ok(f.diffusion.every(v=>v===0));});
test('gradient changes colors without changing orientation or visibility',()=>{const a=shadeCloud(asset(),{gradientPosition:0}),b=shadeCloud(asset(),{gradientPosition:1});assert.deepEqual(a.facing,b.facing);assert.deepEqual(a.visibility,b.visibility);assert.notDeepEqual(a.incoming,b.incoming);for(const mode of ['lambert','wrapped','ramp'])assert.ok(shadeCloud(asset(),{model:mode}).scene.every(Number.isFinite));});

import {normalLighting} from './normal-lighting-experiment.js';
test('every layer chooses its own shape, with no competing scene mode',()=>{
 assert.equal(normalLighting.params.some(p=>p.key==='cloudShape'),false);
 for(const layer of ['near','nearMiddle','middle','farMiddle','far'])assert.deepEqual(normalLighting.params.find(p=>p.key===`${layer}Shape`).options.map(o=>o[0]),['ellipsoid','cluster','wisps','teardrop','image']);
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

test('broad normals shift color at equal height without changing shadow or fine shading',()=>{
 const source=asset();source.broadNormals=new Float32Array([1,0,0,-1,0,0,0,0,1]);
 const p={azimuth:40,elevation:25,heightInfluence:0,broadNormalInfluence:.35,gradientCompression:1};
 const a=shadeCloud(source,p),b=shadeCloud(source,{...p,broadNormalInfluence:0});
 assert.notDeepEqual(Array.from(a.incoming.slice(0,3)),Array.from(a.incoming.slice(3,6)));
 assert.deepEqual(Array.from(b.incoming.slice(0,3)),Array.from(b.incoming.slice(3,6)));
 assert.deepEqual(a.facing,b.facing);assert.deepEqual(a.visibility,b.visibility);
});
test('fine normals affect brightness independently of broad color selection',()=>{
 const source=asset();source.broadNormals=source.normals.slice();
 const p={elevation:25};const a=shadeCloud(source,p);
 source.normals=new Float32Array([1,0,0,-1,0,0,0,1,0]);
 const b=shadeCloud(source,p),flat=shadeCloud(source,{...p,detailShadingStrength:0});
 assert.deepEqual(a.incoming,b.incoming);assert.notDeepEqual(a.facing,b.facing);
 assert.deepEqual(a.visibility,b.visibility);assert.ok(flat.facing.every(v=>v===1));
});
