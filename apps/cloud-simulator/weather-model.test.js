/* Purpose: Exercise shared-field composition, deterministic dynamics, controls and snapshot continuation.
 * Consumers: Node test runner. Dependencies: weather modules, core host/fake DOM, node:test/assert/crypto. */
import test from "node:test";import assert from "node:assert/strict";import {randomInt} from "node:crypto";
import {defaults,createWeather,stepWeather,refreshFields,weatherSun} from "./weather-fields.js";
import {buildWeatherLighting,renderWeather,projectionLayers,renderOrder} from "./weather-model.js";
import {weather} from "./weather-experiment.js";
import {defaultParams,validateExperiment} from "./core/experiment.js";
import {mountExperiment} from "./core/host.js";
import {fakeDocument,fakeCanvas,manualFrames,descendants} from "./core/fake-dom.js";
const seeds=Array.from({length:3},()=>randomInt(0,4294967296));
test(`fresh weather remains reproducible and serializable (seeds ${seeds})`,()=>{
  for(const seed of seeds){const a=createWeather(seed),b=createWeather(seed);stepWeather(a,.2,defaults);for(let i=0;i<4;i++)stepWeather(b,.05,defaults);assert.deepEqual(a,b);
    const copy=JSON.parse(JSON.stringify(a));stepWeather(a,.1,defaults);stepWeather(copy,.1,defaults);assert.deepEqual(a,copy);
    const before=JSON.stringify(a),maps=buildWeatherLighting(a,defaults),pixels=renderWeather(a,defaults,maps,64,40);assert.equal(JSON.stringify(a),before);assert.equal(pixels.length,64*40*4);assert.ok(pixels.every((v,i)=>i%4!==3||v===255));
  }
});
test("cloud opacity, visibility and rain consume the same field; zero coverage clears them",()=>{
  const p={...defaults,coverage:2,rainAmount:1},s=createWeather(seeds[0],p);
  for(let i=0;i<40;i++)stepWeather(s,.1,p);
  assert.ok(s.layers.some(l=>l.fields.rain.some(v=>v>0)));
  const projected=projectionLayers(s,p);for(let i=0;i<3;i++)assert.equal(projected[i].density,s.layers[i].fields.cloudWater);
  const empty={...p,coverage:0};refreshFields(s,empty);const lighting=buildWeatherLighting(s,empty);
  assert.ok(s.layers.every(l=>l.fields.cloudWater.every(v=>v===0)));assert.equal(lighting.work.segments,0);
});
test("wind and formation change clouds; sun relighting leaves fields untouched",()=>{
  const still={...defaults,wind:0,formationSpeed:0,storminess:0,rainAmount:0},s=createWeather(seeds[0],still),before=structuredClone(s.layers.map(l=>l.fields.cloudWater));
  stepWeather(s,.2,still);assert.deepEqual(s.layers.map(l=>l.fields.cloudWater),before);
  stepWeather(s,.2,{...still,wind:.15,formationSpeed:1});assert.notDeepEqual(s.layers.map(l=>l.fields.cloudWater),before);
  const saved=JSON.stringify(s),a=buildWeatherLighting(s,defaults),b=buildWeatherLighting(s,{...defaults,sunElevation:20});assert.notDeepEqual(a.colors,b.colors);assert.equal(JSON.stringify(s),saved);
  assert.notDeepEqual(weatherSun({...s,time:200},defaults),weatherSun(s,defaults));
});
test("layer toggles change contributions and inspector views expose each field",()=>{
  const s=createWeather(seeds[1]),maps=buildWeatherLighting(s,defaults),all=renderWeather(s,defaults,maps,64,40);
  for(const name of ["near","middle","far"]){const p={...defaults,[name]:false};assert.notDeepEqual(renderWeather(s,p,buildWeatherLighting(s,p),64,40),all);}
  for(const view of ["cloudWater","humidity","rain","charge"]){const pixels=renderWeather(s,{...defaults,view,inspectLayer:"far"},null,64,40);assert.equal(pixels.length,64*40*4);}
  assert.deepEqual(renderOrder.slice(0,2),["sky","all-light-veils"]);
});
test("existing host builds controls without numeric seed entry, steps, resets, and restores settings",()=>{
  validateExperiment(weather);for(const p of weather.params.filter(p=>p.kind==="range")){const steps=(p.default-p.min)/p.step;assert.ok(Math.abs(steps-Math.round(steps))<1e-8,`${p.key} default must sit on a slider step`);}
  const doc=fakeDocument(),canvas=fakeCanvas(doc,64,40),frames=manualFrames();
  const page=mountExperiment(weather,{doc,raf:frames.raf,presets:false,serviceWorker:null});frames.frame();
  const inputs=descendants(doc.getElementById("controls")).filter(n=>n.tagName==="INPUT");assert.ok(inputs.every(n=>n.type!=="number"));assert.ok(canvas.pixels());
  doc.getElementById("step-weather").fire("click");frames.frame();assert.equal(page.instance.state.time,.1);
  doc.getElementById("coverage").value="0";doc.getElementById("coverage").fire("input");frames.frame();assert.ok(page.instance.state.layers.every(l=>l.fields.cloudWater.every(v=>v===0)));
  const saved={...page.getParams(),sunElevation:-3,far:false};page.applyParams(saved);frames.frame();assert.equal(page.params.sunElevation,-3);assert.equal(page.params.far,false);
  doc.getElementById("reset-weather").fire("click");frames.frame();assert.equal(page.instance.state.time,0);assert.equal(page.params.coverage,defaults.coverage);page.dispose();
});
