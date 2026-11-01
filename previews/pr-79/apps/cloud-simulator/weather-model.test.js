/* Purpose: Exercise shared-field composition, deterministic dynamics, controls and snapshot continuation.
 * Consumers: Node test runner. Dependencies: weather modules, core host/fake DOM, node:test/assert/crypto. */
import test from "node:test";import assert from "node:assert/strict";import {randomInt} from "node:crypto";
import {defaults,createWeather,stepWeather,refreshFields,weatherSun} from "./weather-fields.js";
import {buildWeatherLighting,renderWeather,projectionLayers,renderOrder,interpolateRGB} from "./weather-model.js";
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
test(`charge builds and lightning starts only in dense cloud; clear sky drains and stays dark (seeds ${seeds})`,()=>{
  for(const seed of seeds.slice(0,2)){
    const s=createWeather(seed),last=s.layers.map(l=>l.lightning.phase);let started=0;
    for(let t=0;t<2400;t++){stepWeather(s,.05,defaults);s.layers.forEach((l,k)=>{const storm=l.lightning;
      if(storm.phase==="leader"&&last[k]!=="leader"){started++;assert.equal(storm.cloudSupport[storm.strike.from],1,"strikes start inside dense cloud");if(storm.strike.to>=0)assert.equal(storm.cloudSupport[storm.strike.to],1);}
      last[k]=storm.phase;});}
    assert.ok(started>0,"default weather still makes lightning");
    assert.ok(s.layers.every(l=>l.lightning.cloudSupport.length===72&&l.lightning.cloudSupport.every(v=>v>=0&&v<=1)));
  }
  const clear={...defaults,coverage:0},s=createWeather(seeds[0],clear),strikes=s.layers.map(l=>l.lightning.strikes);
  for(let t=0;t<600;t++)stepWeather(s,.1,clear);
  assert.deepEqual(s.layers.map(l=>l.lightning.strikes),strikes,"no strikes from a clear sky");
  assert.ok(s.layers.every(l=>l.lightning.phase==="quiet"&&l.lightning.charge.values.every(q=>Math.abs(q)<.05)),"clear air drains its charge");
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
  doc.getElementById("step").fire("click");frames.frame();assert.equal(page.instance.state.time,.1);
  doc.getElementById("coverage").value="0";doc.getElementById("coverage").fire("input");frames.frame();assert.ok(page.instance.state.layers.every(l=>l.fields.cloudWater.every(v=>v===0)));
  const saved={...page.getParams(),sunPhase:.45,far:false};page.applyParams(saved);frames.frame();assert.ok(Math.abs(page.getParams().sunPhase-.45)<1e-8);assert.equal(page.params.far,false);
  doc.getElementById("reset-weather").fire("click");frames.frame();assert.equal(page.instance.state.time,0);assert.equal(page.params.coverage,defaults.coverage);page.dispose();
});

test("shared time of day relights the weather without advancing cloud fields",()=>{
  const doc=fakeDocument(),frames=manualFrames();fakeCanvas(doc,160,100);
  const page=mountExperiment(weather,{doc,raf:frames.raf,presets:false,serviceWorker:null,playing:false});frames.frame();
  assert.equal(weather.sun,true);assert.ok(!weather.params.some(p=>["sunElevation","sunAzimuth","sunSpeed"].includes(p.key)));
  const state=JSON.stringify(page.instance.state),morning=page.instance.preview("sky","near",160,100);
  doc.getElementById("timeOfDay").value="17";doc.getElementById("timeOfDay").fire("input");frames.frame();
  assert.notDeepEqual(page.instance.preview("sky","near",160,100),morning);
  assert.equal(JSON.stringify(page.instance.state),state);assert.match(page.instance.describe(),/sun .*°/);page.dispose();
});
test("sun disc survives the coarse sky grid, moves across the view and sets below Earth",()=>{
  const state=createWeather(seeds[0]);
  const disc=sun=>{const maps=buildWeatherLighting(state,defaults,sun);maps.sky=maps.sky.map(()=>[0,0,0]);
    const pixels=renderWeather(state,defaults,maps,160,100,0),xs=[];
    for(let i=0;i<160*100;i++)if(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2]>0)xs.push(i%160);
    return xs;
  };
  const left=disc({elevation:10,azimuth:-12}),right=disc({elevation:10,azimuth:12});
  assert.ok(left.length>0&&right.length>0,"small sun must not disappear between coarse sky samples");
  assert.ok(Math.max(...left)<Math.min(...right));assert.equal(disc({elevation:-5,azimuth:0}).length,0);
});

test("linear-light interpolation reconstructs a gradient and clamps at sample edges",()=>{
  const grid=[[0,0,0],[2,4,6],[4,8,12],[6,12,18]];
  assert.deepEqual(interpolateRGB(grid,2,2,.5,.5),[3,6,9]);
  assert.deepEqual(interpolateRGB(grid,2,2,0,0),grid[0]);assert.deepEqual(interpolateRGB(grid,2,2,1,1),grid[3]);
  assert.deepEqual(interpolateRGB(grid.map(direct=>({direct})),2,2,.5,.5,"direct"),[3,6,9]);
  assert.ok(interpolateRGB(grid,2,2,.49,.5)[0]<3&&interpolateRGB(grid,2,2,.51,.5)[0]>3);
});
test("lighting modes preserve fields and share sharp output-resolution visibility",()=>{
  const state=createWeather(seeds[0]),saved=JSON.stringify(state),sun={elevation:8,azimuth:-12};
  const low=buildWeatherLighting(state,defaults,sun,48,30),full=buildWeatherLighting(state,{...defaults,lightingMode:"full"},sun,48,30);
  assert.equal(JSON.stringify(state),saved);assert.deepEqual(low.visibility,full.visibility);
  assert.equal(low.sky.length,48*30);assert.equal(full.sky.length,48*30);assert.equal(full.colors[0].length,48*30);
  assert.equal(low.work.skySamples,640);assert.equal(low.work.surfaceSamples,288);assert.equal(full.work.skySamples,48*30);assert.equal(full.work.surfaceSamples,3*48*30);
  assert.notDeepEqual(low.sky,full.sky);
  const schema=weather.params.find(p=>p.key==="lightingMode");assert.equal(schema.display,"radio");assert.equal(schema.randomize,false);
  const instance=weather.create({width:48,height:30,params:defaults});instance.render({sun});assert.equal(instance.metrics.lighting.length,1);
  const before=JSON.stringify(instance.state);instance.update({...defaults,lightingMode:"full"});assert.equal(instance.metrics.lighting.length,0);
  instance.render({sun});assert.equal(instance.metrics.lighting.length,1);assert.equal(JSON.stringify(instance.state),before);assert.match(instance.describe(),/^full .*1440 sky \/ 4320 surface/);instance.dispose();
});
