/* Purpose: Verify orientation and independent light obstruction. Consumers: Node test runner. Dependencies: normal-lighting-model.js. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facing,shadeCloud} from './normal-lighting-model.js';
test('Lambert cosine limits and wrapped reach',()=>{assert.equal(facing(1),1);assert.equal(facing(.5),.5);assert.equal(facing(0),0);assert.equal(facing(-1),0);assert.ok(facing(-.2,'wrapped',.4)>0);});
const asset=()=>({width:3,height:1,normals:new Float32Array([0,0,1,0,0,1,0,0,1]),depth:new Float32Array([0,3,0]),thickness:new Float32Array([1,6,1]),coverage:new Float32Array([1,1,1])});
test('sun-facing patch can be obstructed independently',()=>{const f=shadeCloud(asset(),{azimuth:75,elevation:0,diffusionAmount:0});assert.ok(f.facing[0]>0);assert.ok(f.visibility[0]<f.visibility[2]);assert.ok(f.diffusion.every(v=>v===0));});
test('gradient changes colors without changing orientation or visibility',()=>{const a=shadeCloud(asset(),{gradientPosition:0}),b=shadeCloud(asset(),{gradientPosition:1});assert.deepEqual(a.facing,b.facing);assert.deepEqual(a.visibility,b.visibility);assert.notDeepEqual(a.incoming,b.incoming);for(const mode of ['lambert','wrapped','ramp'])assert.ok(shadeCloud(asset(),{model:mode}).scene.every(Number.isFinite));});
