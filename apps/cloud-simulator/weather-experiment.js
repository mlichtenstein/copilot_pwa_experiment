/* Purpose: Adapt the combined weather prototype to the existing generated-controls host with stage timings.
 * Consumers: weather.js, core registry, and weather tests.
 * Dependencies: weather-fields.js, weather-model.js and core/experiment.js contract. */
import {defaults,createWeather,refreshFields,stepWeather,weatherSun} from "./weather-fields.js";
import {buildWeatherLighting,renderWeather} from "./weather-model.js";
const now=()=>globalThis.performance?.now()??Date.now();
const slider=(key,min,max,step,help,group)=>({key,kind:"range",min,max,step,default:defaults[key],help,group});
const toggle=(key,help)=>({key,kind:"toggle",default:defaults[key],help,group:"Layers"});
function summary(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?`${sorted[Math.floor((sorted.length-1)*.5)].toFixed(0)}/${sorted[Math.floor((sorted.length-1)*.95)].toFixed(0)}`:"—";}
export const weather={id:"weather",title:"Weather layers",app:"cloud-simulator/weather",width:160,height:100,sun:false,frameInterval:250,playLabels:["Play weather","Pause weather"],
  params:[
    {key:"seed",kind:"seed",default:42,random:true,hidden:true,newLabel:"New weather",newTitle:"Generate fresh fields and terrain; internal seeds are saved in links"},
    toggle("near","Show the near cloud/rain/lightning/terrain layer, 8 km away."),toggle("middle","Show the middle layer, 24 km away."),toggle("far","Show the far layer, 65 km away."),
    {key:"view",kind:"select",label:"View",default:"scene",options:[["scene","Combined scene"],["cloudWater","Cloud water"],["humidity","Humidity"],["rain","Rain water"],["charge","Charge potential"]],help:"Inspect a raw field independently of its lighting and draw order.",group:"Inspect"},
    {key:"inspectLayer",kind:"select",label:"Field layer",default:"near",options:[["near","Near · 24×15"],["middle","Middle · 32×20"],["far","Far · 48×30"]],help:"Which distance layer supplies the field view; charge is 12×6 in each.",group:"Inspect"},
    slider("sunElevation",-8,25,.25,"Starting sun elevation above the horizon, degrees.","Sun and atmosphere"),
    slider("sunAzimuth",-45,45,1,"Starting horizontal sun direction, degrees.","Sun and atmosphere"),
    slider("sunSpeed",0,3,.1,"Rate of the slow sun arc; zero freezes sun position while weather evolves.","Sun and atmosphere"),
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
  actions:[{id:"step-weather",label:"Step 0.1 s",title:"Pause and advance two fixed weather ticks",run:page=>{page.setPlaying(false);page.instance.step(.1);}},
    {id:"reset-weather",label:"Reset weather",title:"Pause and restore default settings with fresh weather",run:page=>{page.setPlaying(false);page.resetToDefaults();}}],
  create({width,height,params}){
    let current=params,state=createWeather(params.seed,params),maps=null;
    const samples={dynamics:[],lighting:[],drawing:[]},record=(key,value)=>{samples[key].push(value);if(samples[key].length>60)samples[key].shift();};
    return {
      get state(){return state;},get metrics(){return samples;},frames:0,started:now(),
      update(next){if(next.seed!==current.seed)state=createWeather(next.seed,next);else refreshFields(state,next);current=next;maps=null;},
      step(dt){const start=now(),changed=stepWeather(state,dt,current);record("dynamics",now()-start);if(changed)maps=null;return changed;},
      render(){if(!maps&&current.view==="scene"){const start=now();maps=buildWeatherLighting(state,current);record("lighting",now()-start);}
        const start=now(),pixels=renderWeather(state,current,maps,width,height);record("drawing",now()-start);this.frames++;return pixels;},
      describe(){const sun=weatherSun(state,current),work=maps?.work;return `t ${state.time.toFixed(1)} s · sun ${sun.elevation.toFixed(1)}° / ${sun.azimuth.toFixed(0)}° · ${work?.cells??2440} cloud cells · ${work?.segments??0} edges · ms median/p95: dynamics ${summary(samples.dynamics)}, light ${summary(samples.lighting)}, draw ${summary(samples.drawing)} · ${this.frames} images`;},
      dispose(){maps=null;}
    };
  },stats:(params,frame,instance)=>instance.describe()
};
