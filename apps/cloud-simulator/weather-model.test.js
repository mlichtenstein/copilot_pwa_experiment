/* Purpose: Exercise shared-field composition, deterministic dynamics, controls and snapshot continuation.
 * Consumers: Node test runner. Dependencies: weather modules, core host/fake DOM, node:test/assert/crypto. */
import test from "node:test";import assert from "node:assert/strict";import {randomInt} from "node:crypto";
import {defaults,createWeather,stepWeather,refreshFields,weatherSun} from "./weather-fields.js";
import {buildWeatherLighting,renderWeather,projectionLayers,renderOrder,interpolateRGB,weatherMoon} from "./weather-model.js";
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
  const disc=sun=>{const maps=buildWeatherLighting(state,defaults,sun);maps.sky=maps.sky.map(()=>[0,0,0]);maps.moon=null;
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

test("moon ellipse covers most night, with a dark evening and sunrise overlap",async()=>{
  const {sunAtPhase,phaseForTimeOfDay}=await import("./core/sun-path.js");
  const at=hour=>{const phase=phaseForTimeOfDay(hour);return {moon:weatherMoon(phase),sun:sunAtPhase(phase)};};
  assert.ok(at(19).sun.elevation<0&&at(19).moon.elevation<0);
  for(const hour of [20,22,0,2,4,6])assert.ok(at(hour).moon.elevation>0);
  assert.ok(at(7).sun.elevation>0&&at(7).moon.elevation>0);
  assert.ok(at(12).moon.elevation<0);
  assert.ok(Math.abs(weatherMoon(.57).azimuth+22)<1e-10);
  assert.ok(Math.abs(weatherMoon(.82).elevation-24)<1e-10);
  assert.ok(Math.abs(weatherMoon(.57).azimuth-weatherMoon(1.57).azimuth)<1e-10);
});
test("moon survives either optical grid, is part of sky, and is occluded by cloud and terrain",async()=>{
  const {sunAtPhase}=await import("./core/sun-path.js");
  const p={...defaults,coverage:0,storminess:0,rainAmount:0},state=createWeather(42,p),before=JSON.stringify(state);
  for(const lightingMode of ["interpolated","full"]){
    const params={...p,lightingMode},maps=buildWeatherLighting(state,params,sunAtPhase(.82));
    // Isolate lunar contribution from atmospheric sky and sun, without changing its geometry.
    maps.sky=maps.sky.map(()=>[0,0,0]);maps.sunlight=[0,0,0];
    const sky=renderWeather(state,params,maps,160,100,0),dark=renderWeather(state,params,{...maps,moon:null},160,100,0);
    const bright=[];for(let i=0;i<160*100;i++)if(sky[i*4]>100)bright.push(i);
    assert.ok(bright.length>0,"disc must survive between coarse optical samples");assert.notDeepEqual(sky,dark);
    const scene=renderWeather(state,params,maps),noMoon=renderWeather(state,params,{...maps,moon:null});
    for(const i of bright)assert.ok(scene[i*4]>noMoon[i*4],"clear sky reveals moon");
    const cloud=structuredClone(state);for(const layer of cloud.layers)layer.fields.cloudWater.fill(100);
    assert.deepEqual(renderWeather(cloud,params,maps),renderWeather(cloud,params,{...maps,moon:null}),"opaque clouds cover moon");
    const low={...maps,moon:{elevation:1,azimuth:0},moonDirection:[0,Math.sin(Math.PI/180),Math.cos(Math.PI/180)]};
    const lowSky=renderWeather(state,params,low,160,100,0),ground=renderWeather(state,params,low),groundDark=renderWeather(state,params,{...low,moon:null});
    const i=Math.floor((.5-(Math.tan(Math.PI/180)-Math.tan(8*Math.PI/180))/(2*Math.tan(29*Math.PI/180)))*100)*160+80;
    assert.ok(lowSky[i*4]>0);assert.ok(ground[i*4]<lowSky[i*4],"terrain hides the disc while retaining faint lunar fill");
    const below={...maps,moon:{elevation:-1,azimuth:0}};
    assert.deepEqual(renderWeather(state,params,below,160,100,0),dark);
  }
  assert.equal(JSON.stringify(state),before);
});
test("paused host time scrubbing moves moon and restores its saved phase",()=>{
  const doc=fakeDocument(),frames=manualFrames();fakeCanvas(doc,160,100);
  const page=mountExperiment(weather,{doc,raf:frames.raf,presets:false,serviceWorker:null,playing:false});frames.frame();
  page.applyParams({...page.getParams(),coverage:0,storminess:0,sunPhase:.82});frames.frame();
  const before=JSON.stringify(page.instance.state),saved=page.getParams(),night=page.instance.preview("sky","near",160,100);
  page.applyParams({...saved,sunPhase:.65});frames.frame();
  assert.notDeepEqual(page.instance.preview("sky","near",160,100),night);
  page.applyParams(saved);frames.frame();assert.deepEqual(page.instance.preview("sky","near",160,100),night);
  assert.equal(JSON.stringify(page.instance.state),before);page.dispose();
});
test("moon backlights nearby thin clouds, fades over nine degrees and is extinguished by thick cores",async()=>{
  const {moonCloudLight}=await import("./weather-model.js"),{renderInspection}=await import("./weather-inspection.js"),{sunAtPhase}=await import("./core/sun-path.js");
  const p={...defaults,storminess:0,rainAmount:0},state=createWeather(42,p);
  // A uniform cloud sheet makes the radial lighting behavior directly observable.
  for(const layer of state.layers)layer.fields.cloudWater.fill(.5);
  const vFor=el=>.5-(Math.tan(el*Math.PI/180)-Math.tan(8*Math.PI/180))/(2*Math.tan(29*Math.PI/180));
  for(const lightingMode of ["interpolated","full"]){
    const params={...p,lightingMode},maps=buildWeatherLighting(state,params,sunAtPhase(.82)),v=vFor(24);
    const center=moonCloudLight(maps,.5,v,.5,params),edge=moonCloudLight(maps,.5,vFor(27),.5,params);
    assert.ok(center>edge&&edge>0,"glow extends beyond the disc and fades radially");
    assert.equal(moonCloudLight(maps,.5,vFor(34),.5,params),0);
    assert.ok(moonCloudLight(maps,.5,v,100,params)<center*1e-10);
    assert.equal(moonCloudLight({...maps,moon:{...maps.moon,elevation:-1}},.5,v,.5,params),0);
    const lit=renderInspection(state,{...params,view:"cloudColor"},maps),dark=renderInspection(state,{...params,view:"cloudColor"},{...maps,moon:null});
    const i=(Math.floor(v*100)*160+80)*4;assert.ok(lit[i+2]>dark[i+2],"cloud-color preview includes blue lunar backlight");
    assert.deepEqual(lit.slice(0,4),dark.slice(0,4),"distant clouds are unchanged");
    const clear=structuredClone(state);for(const layer of clear.layers)layer.fields.cloudWater.fill(0);
    assert.deepEqual(renderInspection(clear,{...params,view:"cloudColor"},maps),renderInspection(clear,{...params,view:"cloudColor"},{...maps,moon:null}),"no glow without cloud water");
  }
});

test("moon faintly lights terrain at night, with cloud attenuation and no daytime fill",async()=>{
  const {moonTerrainLight}=await import("./weather-model.js"),{sunAtPhase}=await import("./core/sun-path.js");
  const p={...defaults,coverage:0,storminess:0,rainAmount:0},s=createWeather(42,p),maps=buildWeatherLighting(s,p,sunAtPhase(.82));
  const strength=moonTerrainLight(s,p,maps);assert.ok(strength>0&&strength<.14);
  const lit=renderWeather(s,p,maps),dark=renderWeather(s,p,{...maps,moon:null}),i=(65*160+80)*4;
  assert.ok(lit[i+2]>dark[i+2],"landscape gains cool moonlight");
  assert.equal(moonTerrainLight(s,p,{...maps,moon:{...maps.moon,elevation:-1}}),0);
  assert.equal(moonTerrainLight(s,p,{...maps,sun:{...maps.sun,elevation:20}}),0);
  const cloudy=structuredClone(s);for(const l of cloudy.layers)l.fields.cloudWater.fill(10);
  assert.ok(moonTerrainLight(cloudy,p,maps)<strength*.01,"overcast dims landscape fill");
});

test("terrain moonlight is local and favors slopes facing the moon",async()=>{
  const {moonTerrainHighlight,CELESTIAL_RADIUS}=await import("./weather-model.js");
  assert.equal(CELESTIAL_RADIUS,.55*Math.PI/180);
  const s=createWeather(42),layer=s.layers[0],maps=buildWeatherLighting(s,defaults,{elevation:-15,azimuth:0,phase:.82});
  const {terrainY}=await import("./weather-fields.js");
  const center=moonTerrainHighlight(layer,maps,.5,terrainY(layer,.5));
  assert.ok(center>0);
  assert.ok(center>4*moonTerrainHighlight(layer,maps,.5,terrainY(layer,.5)+.04),"ridge rim is much brighter than the slope interior");
  assert.equal(moonTerrainHighlight(layer,maps,.05,terrainY(layer,.05)),0,"distant ridge stays dark");
  assert.ok(moonTerrainHighlight(layer,maps,.5,terrainY(layer,.5)+.2)<center*.1,"highlight fades down the landscape");
  const slope=-(terrainY(layer,.501)-terrainY(layer,.499))/.002/1.6;
  // Keep the footprint centered while comparing opposing horizontal light directions.
  const right={...maps,moonDirection:[.4,.4,100]},left={...maps,moonDirection:[-.4,.4,100]};
  const a=moonTerrainHighlight(layer,right,.5,terrainY(layer,.5)),b=moonTerrainHighlight(layer,left,.5,terrainY(layer,.5));
  assert.ok(slope>0?a<b:a>b,"ridge normal favors the light-facing slope");
});
