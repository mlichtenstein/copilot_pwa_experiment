/* Purpose: Adapt the combined weather prototype to the existing generated-controls host with stage timings.
 * Consumers: weather.js, core registry, and weather tests.
 * Dependencies: weather-fields.js, weather-model.js, weather-inspection.js, core/sun-path.js and core/experiment.js contract. */
import {defaults,createWeather,refreshFields,stepWeather} from "./weather-fields.js";
import {buildWeatherLighting} from "./weather-model.js";
import {nodes,passes,renderInspection,needsLighting} from "./weather-inspection.js";
import {sunAtPhase} from "./core/sun-path.js";
const fieldKeys=["cloudAltitude","altitudeSpread","coverage","textureMix"];
const lightingKeys=["lightingMode",...fieldKeys,"sunElevation","sunAzimuth","sunSpeed","airDensity","aerosol","cloudOpacity","cloudSharpness","haze","shaftStrength","edgeFeather","near","middle","far"];
const now=()=>globalThis.performance?.now()??Date.now();
const slider=(key,min,max,step,help,group)=>({key,kind:"range",min,max,step,default:defaults[key],help,group});
const toggle=(key,help)=>({key,randomize:false,kind:"toggle",default:defaults[key],help,group:"Layers"});
function summary(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?`${sorted[Math.floor((sorted.length-1)*.5)].toFixed(0)}/${sorted[Math.floor((sorted.length-1)*.95)].toFixed(0)}`:"—";}
export const weather={id:"weather",title:"Weather layers",app:"cloud-simulator/weather",width:160,height:100,sun:true,frameInterval:250,seed:"seed",stepSeconds:.1,
  params:[
    {key:"lightingMode",kind:"select",display:"radio",default:"interpolated",randomize:false,options:[["interpolated","Interpolated"],["full","Full resolution"]],help:"Compare interpolated 32×20 sky / 12×8 surface lighting against atmospheric calculations at every output pixel. Visibility and sun stay at output resolution in both. Full resolution is expensive; pause for a still-frame comparison. Lighting timings reset when switched.",group:"Rendering"},
    {key:"seed",kind:"seed",default:42,random:true,hidden:true},
    toggle("near","Show the near cloud/rain/lightning/terrain layer, 8 km away."),toggle("middle","Show the middle layer, 24 km away."),toggle("far","Show the far layer, 65 km away."),
    {key:"view",randomize:false,kind:"select",label:"View",default:"scene",options:[["scene","Combined scene"],...nodes.map(node=>[node.id,node.label]),["sky","Sky / atmospheric light"],...passes.filter(pass=>pass.view!=="scene").map(pass=>[pass.view,`Composition ${pass.index+1}: ${pass.label}`])],help:"Inspect a field, derived rendering input, or accumulated render pass. The graph shows their connections.",group:"Inspect"},
    {key:"inspectLayer",randomize:false,kind:"select",label:"Field layer",default:"near",options:[["near","Near · 24×15"],["middle","Middle · 32×20"],["far","Far · 48×30"]],help:"Which distance layer supplies the field view; charge is 12×6 in each.",group:"Inspect"},
    slider("airDensity",.2,2,.1,"Atmospheric scattering/extinction multiplier from the Horizon model.","Sun and atmosphere"),
    slider("aerosol",0,1,.05,"Low-altitude atmospheric haze/extinction strength.","Sun and atmosphere"),
    slider("exposure",.5,4,.1,"Camera exposure before tone mapping.","Sun and atmosphere"),
    slider("cloudAltitude",.3,8,.1,"Reference cloud height above sea level, km; depth offsets separate layers.","Cloud fields"),
    slider("altitudeSpread",0,2,.1,"Multiplier for layer altitude offsets.","Cloud fields"),
    slider("coverage",0,2,.1,"Normalized cloud-water multiplier shared by cloud opacity, shafts and rain formation.","Cloud fields"),
    slider("textureMix",0,1,.05,"Blend evolving Perlin shapes (0) with the fixed grayscale Horizon bitmaps (1).","Cloud fields"),
    slider("wind",-.15,.15,.005,"Horizontal wind, km/s; moves the field and bitmap together with distance-dependent parallax.","Cloud fields"),
    slider("formationSpeed",0,1,.05,"Rate of noise-driven reveal and dissolution, separate from wind.","Cloud fields"),
    slider("cloudOpacity",0,4,.1,"Extinction per normalized cloud-water unit; shared by cloud bodies and threshold masks.","Light and weather"),
    slider("cloudSharpness",1,12,.5,"Contrast of the cloud edge used by visibility polygons.","Light and weather"),
    slider("haze",0,1,.05,"Strength of light visible in the air between layers.","Light and weather"),
    slider("shaftStrength",0,1,.05,"Opacity of layered visibility light veils; clouds cover the veils.","Light and weather"),
    slider("edgeFeather",0,12,1,"Feather cloud-facing polygon caps, in 128-pixel reference units; ray sides stay crisp.","Light and weather"),
    slider("rainAmount",0,1,.05,"Rain generated above the cloud-water threshold; rain transports downward on its own grid.","Light and weather"),
    slider("storminess",0,2,.1,"Charge buildup rate; zero hides and stops lightning while other fields continue.","Light and weather"),
    slider("chargeBias",-1,1,.05,"Mean signed charge buildup; either polarity can favor ground strikes.","Light and weather")
  ],
  actions:[{id:"reset-weather",label:"Reset weather",title:"Pause and restore default settings with fresh weather",run:page=>{page.setPlaying(false);page.resetToDefaults();}}],
  create({width,height,params}){
    let current=params,state=createWeather(params.seed,params),maps=null,currentSun=sunAtPhase(.125);
    const samples={dynamics:[],lighting:[],drawing:[],inspection:[]},record=(key,value)=>{samples[key].push(value);if(samples[key].length>60)samples[key].shift();};
    const lighting=()=>{if(!maps){const start=now();maps=buildWeatherLighting(state,current,currentSun,width,height);record("lighting",now()-start);}return maps;};
    return {
      get state(){return state;},get metrics(){return samples;},frames:0,started:now(),
      update(next){if(next.lightingMode!==current.lightingMode)for(const key of ["lighting","drawing","inspection"])samples[key].length=0;if(next.seed!==current.seed){state=createWeather(next.seed,next);maps=null;}else {if(fieldKeys.some(key=>next[key]!==current[key]))refreshFields(state,next);if(lightingKeys.some(key=>next[key]!==current[key]))maps=null;}current=next;},
      step(dt){const start=now(),changed=stepWeather(state,dt,current);record("dynamics",now()-start);if(changed)maps=null;return changed;},
      preview(view,inspectLayer,w=32,h=20){return renderInspection(state,{...current,view,inspectLayer},needsLighting(view)?lighting():maps,w,h);},
      render(frame){if(frame?.sun&&(frame.sun.elevation!==currentSun.elevation||frame.sun.azimuth!==currentSun.azimuth||frame.sun.phase!==currentSun.phase)){currentSun=frame.sun;maps=null;}const prepared=needsLighting(current.view)?lighting():maps,start=now(),pixels=renderInspection(state,current,prepared,width,height);record("drawing",now()-start);this.frames++;
        if(this.onImage){const inspectStart=now();this.onImage();record("inspection",now()-inspectStart);}return pixels;},
      describe(){const sun=currentSun,work=maps?.work;return `${current.lightingMode??"interpolated"} · optics ${work?.skySamples??0} sky / ${work?.surfaceSamples??0} surface samples · t ${state.time.toFixed(1)} s · sun ${sun.elevation.toFixed(1)}° / ${sun.azimuth.toFixed(0)}° · ${work?.cells??2440} cloud cells · ${work?.segments??0} edges · ms median/p95: dynamics ${summary(samples.dynamics)}, light ${summary(samples.lighting)}, draw ${summary(samples.drawing)}, inspect ${summary(samples.inspection)} · ${this.frames} images`;},
      dispose(){maps=null;}
    };
  },stats:(params,frame,instance)=>instance.describe()
};

