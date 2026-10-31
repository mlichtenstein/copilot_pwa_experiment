/* Purpose: Scrappy three-depth weather state and ordered field dynamics, independent of rendering/UI.
 * Consumers: weather-model.js, weather-experiment.js and weather tests.
 * Dependencies: fixed horizon bitmaps, Perlin noise and the existing lightning model; lengths in km. */
import {cloudBitmaps} from "./horizon-bitmaps.js";
import {perlin3} from "./valley-noise.js";
import {createLightning,stepLightning,parameters as boltParameters} from "./lightning-model.js";
import {createTerrainObjects} from "./lightning-terrain.js";
export const SCALE=Math.tan(58*Math.PI/360),WIDTH=160,HEIGHT=100;
export const defaults={sunElevation:1.5,sunAzimuth:-18,sunSpeed:.4,cloudAltitude:5,altitudeSpread:1,coverage:1.2,textureMix:.7,wind:.035,formationSpeed:.2,cloudOpacity:2,cloudSharpness:4,airDensity:1,aerosol:.2,exposure:2,haze:.5,shaftStrength:.6,edgeFeather:4,rainAmount:.45,storminess:.35,chargeBias:.2,near:true,middle:true,far:true,view:"scene",inspectLayer:"near",seed:42};
export const clamp=v=>Math.max(0,Math.min(1,v));
export const enabled=(layer,p)=>p[layer.name]!==false;
export function cloudAltitude(layer,p){return Math.max(.25,p.cloudAltitude+[-2.3,-.6,2.8][layer.index]*p.altitudeSpread);}
export function terrainY(layer,x){
  const ridge=[.8,2.6,6][layer.index]*(.55+.27*Math.sin(x*9+layer.index*1.7)+.18*Math.sin(x*21+layer.index));
  return .5-(ridge-.15-layer.distance**2/(2*6371))/(2*SCALE*layer.distance);
}
export function weatherSun(state,p){const phase=state.time*p.sunSpeed*.02;return {elevation:p.sunElevation+5*(Math.cos(phase)-1),azimuth:p.sunAzimuth+20*Math.sin(phase*.5)};}
export function boltSettings(p){return {...Object.fromEntries(boltParameters.map(v=>[v.key,v.default])),chargeRate:p.storminess,chargeBias:p.chargeBias};}
function sampleBitmap(bitmap,u,v){if(v<0||v>=1)return 0;u=((u%1)+1)%1;return bitmap.alpha[Math.floor(v*bitmap.height)*bitmap.width+Math.floor(u*bitmap.width)]/255;}
export function refreshFields(state,p){
  for(const layer of state.layers){
    const {width,height,distance,fields}=layer,center=cloudAltitude(layer,p),thickness=[1,2.4,5][layer.index];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,u=(x+.5)/width,v=(y+.5)/height;
      const worldY=(1-2*v)*SCALE*distance+.15+distance**2/(2*6371);
      const shifted=u-state.windOffset/(2*SCALE*distance*1.6)+(layer.seed%1024)/1024;
      const noise=perlin3(shifted*5,v*7,state.evolution,layer.seed%997),reveal=.45+.8*noise;
      const alpha=sampleBitmap(cloudBitmaps[layer.index],shifted,.5-(worldY-center)/thickness);
      const band=Math.exp(-(((worldY-center)/(thickness*.55))**4));
      fields.humidity[i]=.55+noise*.6;
      fields.cloudWater[i]=Math.max(0,p.coverage*(p.textureMix*alpha+(1-p.textureMix)*Math.max(0,(noise-.38)*3)*band)*reveal);
    }
  }
  state.revision++;
}
export function createWeather(seed,p=defaults){
  const bolt=createLightning({seed,params:boltSettings(p),start:"before"});
  const state={seed:seed>>>0,time:0,accumulator:0,windOffset:0,evolution:0,revision:0,layers:[]};
  for(let index=0;index<3;index++){
    const width=[24,32,48][index],height=[15,20,30][index],distance=[8,24,65][index];
    const layer={index,name:["near","middle","far"][index],seed:(seed+index*997)>>>0,width,height,distance,depth:distance-12,cellSize:2*SCALE*distance/height,
      fields:{humidity:Array(width*height).fill(0),cloudWater:Array(width*height).fill(0),rain:Array(width*height).fill(0)},rainClock:0,lightning:bolt.layers[2-index]};
    layer.lightning.clouds=[];layer.lightning.objects=[];
    layer.objects=createTerrainObjects(layer.seed,2-index,x=>terrainY(layer,x));state.layers.push(layer);
  }
  refreshFields(state,p);return state;
}
function rainStep(layer,p,dt){
  layer.rainClock+=dt;
  while(layer.rainClock>=.1){layer.rainClock-=.1;const old=layer.fields.rain;
    layer.fields.rain=old.map((v,i)=>clamp((i>=layer.width?old[i-layer.width]*.94:0)+Math.max(0,layer.fields.cloudWater[i]-.65)*p.rainAmount*.25));
  }
}
export function stepWeather(state,dt,p){
  state.accumulator+=Math.min(.25,Math.max(0,dt));let changed=false;
  while(state.accumulator+1e-10>=.05){state.accumulator=Math.max(0,state.accumulator-.05);if(state.accumulator<1e-10)state.accumulator=0;state.time+=.05;state.windOffset+=p.wind*.05;state.evolution+=p.formationSpeed*.05;
    // Coordinator order: cloud supplier → rain transport → independent charge/channel systems.
    refreshFields(state,p);
    for(const layer of state.layers)if(enabled(layer,p)){rainStep(layer,p,.05);if(p.storminess>0)stepLightning({time:state.time,layers:[layer.lightning]},.05,boltSettings(p));}
    changed=true;
  }
  return changed;
}
