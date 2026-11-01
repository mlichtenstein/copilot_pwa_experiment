/* Purpose: Verify real field previews, render-pass identity, truthful graph edges and read-only inspector UI.
 * Consumers: Node test runner. Dependencies: weather modules, core fake DOM, node:test/assert/crypto. */
import test from "node:test";import assert from "node:assert/strict";import {randomInt} from "node:crypto";
import {createWeather,defaults,stepWeather} from "./weather-fields.js";
import {buildWeatherLighting,renderWeather,renderOrder} from "./weather-model.js";
import {nodes,passes,graphEdges,renderInspection,needsLighting} from "./weather-inspection.js";
import {mountWeatherInspector} from "./weather-inspector.js";
import {weather} from "./weather-experiment.js";import {defaultParams} from "./core/experiment.js";
import {fakeDocument,descendants} from "./core/fake-dom.js";
const seeds=Array.from({length:3},()=>randomInt(0,4294967296));
test(`every preview reads the live frame without mutation (fresh seeds ${seeds})`,()=>{
  for(const seed of seeds){const state=createWeather(seed),maps=buildWeatherLighting(state,defaults),before=JSON.stringify(state);
    for(const layer of state.layers)for(const node of nodes){const pixels=renderInspection(state,{...defaults,view:node.id,inspectLayer:layer.name},needsLighting(node.id)?maps:null,32,20);assert.equal(pixels.length,32*20*4);assert.ok(pixels.every((v,i)=>i%4!==3||v===255));}
    assert.equal(JSON.stringify(state),before);
    assert.deepEqual(renderInspection(state,{...defaults,view:"scene"},maps,32,20),renderWeather(state,defaults,maps,32,20));
    assert.deepEqual(passes.map(pass=>pass.id),renderOrder);
    for(const pass of passes)assert.deepEqual(renderInspection(state,{...defaults,view:pass.view},maps,32,20),renderWeather(state,defaults,maps,32,20,pass.index));
  }
});
test("graph shows real local/cross-depth inputs and exposes the uncoupled fields",()=>{
  const edges=graphEdges(),has=(from,to)=>edges.some(e=>e.from===from&&e.to===to);
  assert.ok(has("near:cloudWater","near:rain"));assert.ok(has("far:visibility","near:shafts"));assert.ok(has("far:visibility","middle:cloudColor"));
  assert.ok(has("near:terrain","near:groundLight"));assert.ok(has("near:charge","near:lightning"));assert.ok(has("sun","near:visibility"));
  assert.ok(!edges.some(e=>e.to.endsWith(":charge")));assert.ok(!edges.some(e=>e.from.endsWith(":humidity")));
  assert.ok(!has("near:visibility","near:cloudColor"));assert.ok(!has("near:visibility","far:shafts"));
});
test("native opacity/masks reflect cloud water and inactive ground light stays black",()=>{
  const state=createWeather(seeds[0]),p={...defaults,coverage:0};for(const layer of state.layers)layer.fields.cloudWater.fill(0);
  for(const view of ["opacity","mask","groundLight"]){const pixels=renderInspection(state,{...p,view},null,32,20);assert.ok(pixels.every((v,i)=>i%4===3?v===255:v===0));}
  const layer=state.layers[0];layer.fields.cloudWater.fill(1);assert.ok(renderInspection(state,{...defaults,view:"mask"},null,32,20).some((v,i)=>i%4!==3&&v===255));
});
test("inspector tiles select fields/passes, update live, and stop preview work while collapsed",()=>{
  const doc=fakeDocument(["inspector","inspection-caption"]),root=doc.getElementById("inspector");root.open=true;doc.createElementNS=(ns,tag)=>doc.createElement(tag);
  const create=doc.createElement;let painted=0;
  doc.createElement=tag=>{const node=create(tag);if(tag==="canvas")node.getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){painted++;}});return node;};
  const selections=[],ui=mountWeatherInspector({doc,root,select:value=>selections.push(value)}),p=defaultParams(weather),instance=weather.create({width:32,height:20,params:p});
  const before=JSON.stringify(instance.state);instance.update({...p,view:"cloudWater",inspectLayer:"far"});assert.equal(JSON.stringify(instance.state),before);instance.update(p);ui.update(p,instance);assert.equal(JSON.stringify(instance.state),before);assert.equal(painted,15);
  doc.getElementById("inspect-far-cloudWater").fire("click");assert.deepEqual(selections.at(-1),{view:"cloudWater",inspectLayer:"far"});
  ui.update({...p,view:"cloudWater",inspectLayer:"far"},instance);assert.match(doc.getElementById("inspection-caption").textContent,/far.*Cloud water/);
  assert.ok(nodes.every(n=>n.type&&n.inputs&&n.rule));
  assert.ok(descendants(root).some(n=>/Type: Scalar field.*Inputs:.*Rule:/.test(n.textContent)));
  const near=doc.getElementById("inspect-layer-near"),far=doc.getElementById("inspect-layer-far");
  const paintedBefore=painted;near.open=false;far.open=true;far.fire("toggle");assert.equal(painted-paintedBefore,15);
  const buttons=descendants(root).filter(n=>n.tagName==="BUTTON");assert.ok(buttons.every(b=>b.title));buttons.find(b=>b.textContent==="Composition").fire("click");
  doc.getElementById("inspect-pass-2").fire("click");assert.deepEqual(selections.at(-1),{view:"pass-2"});
  const picker=descendants(root).find(n=>n.tagName==="SELECT");
  const beforeLabels=painted;picker.value="labels";picker.fire("change");assert.equal(root.attributes["data-previews"],"labels");assert.equal(painted,beforeLabels);
  picker.value="full";picker.fire("change");assert.ok(painted>beforeLabels);
  const count=painted;root.open=false;stepWeather(instance.state,.1,p);ui.update(p,instance);assert.equal(painted,count);instance.dispose();
});
