/* Purpose: Scrappy three-depth weather state and ordered field dynamics, independent of rendering/UI.
 *   Cloud water couples the other fields: rain forms only above denseCloudWater, and each charge
 *   cell's cloud support (its cloud water over denseCloudWater) sets buildup and where strikes start.
 * Consumers: weather-model.js, weather-experiment.js, weather-inspection.js and weather tests.
 * Dependencies: fixed horizon bitmaps, Perlin noise, charge-field.js cell positions and the existing
 *   lightning model; lengths in km. */
import {cloudBitmaps} from "./horizon-bitmaps.js";
import {perlin3} from "./valley-noise.js";
import {createLightning,stepLightning,groundAt,parameters as boltParameters} from "./lightning-model.js";
import {chargePoint,chargeWidth,chargeHeight} from "./charge-field.js";
import {createTerrainObjects} from "./lightning-terrain.js";
export const SCALE=Math.tan(58*Math.PI/360),CAMERA_LIFT=Math.tan(8*Math.PI/180),WIDTH=160,HEIGHT=100;
export const defaults={lightingMode:"interpolated",sunElevation:1.5,sunAzimuth:-18,sunSpeed:.4,cloudAltitude:5,altitudeSpread:1,coverage:1.2,textureMix:.7,wind:.035,formationSpeed:.2,cloudOpacity:2,cloudSharpness:4,airDensity:1,aerosol:.2,exposure:2,haze:.5,shaftStrength:.6,edgeFeather:4,rainAmount:.45,denseCloudWater:.65,storminess:.4,chargeBias:.2,near:true,middle:true,far:true,view:"scene",inspectLayer:"near",seed:42};
export const clamp=v=>Math.max(0,Math.min(1,v));
export const enabled=(layer,p)=>p[layer.name]!==false;
export function cloudAltitude(layer,p){return Math.max(.25,p.cloudAltitude+[-2.3,-.6,2.8][layer.index]*p.altitudeSpread);}
export function terrainY(layer,x){
  const ridge=[.8,2.6,6][layer.index]*(.55+.27*Math.sin(x*9+layer.index*1.7)+.18*Math.sin(x*21+layer.index));
  return .5-((ridge-.15-layer.distance**2/(2*6371))/layer.distance-CAMERA_LIFT)/(2*SCALE);
}
// Lightning's normalized frame (cloud band at the top, its own ground below) warped into this
// layer's projected cloud/terrain region.
export function mapBolt(layer,node,p){
  const top=.5-((cloudAltitude(layer,p)-.15)/layer.distance-CAMERA_LIFT)/(2*SCALE)-.09;
  return {x:node.x,y:top+(node.y-.09)/(groundAt(node.x,layer.lightning.depth)-.09)*(terrainY(layer,node.x)-top)};
}
// Cloud support per charge cell: mean cloud water over a 3×3 sample of the cell's footprint,
// divided by denseCloudWater and capped at 1. Support 1 means dense cloud, where strikes can start.
const cellStep={x:.08,y:.055};
export function cloudSupport(layer,p){
  const support=[],dense=Math.max(1e-6,p.denseCloudWater??defaults.denseCloudWater);
  for(let i=0;i<chargeWidth*chargeHeight;i++){
    const center=chargePoint(i,layer.lightning.depth);let sum=0;
    for(const oy of [-1/3,0,1/3])for(const ox of [-1/3,0,1/3]){
      const at=mapBolt(layer,{x:center.x+ox*cellStep.x,y:center.y+oy*cellStep.y},p);
      const fx=Math.min(layer.width-1,Math.max(0,Math.floor(at.x*layer.width))),fy=Math.min(layer.height-1,Math.max(0,Math.floor(at.y*layer.height)));
      sum+=at.y<0||at.y>=1?0:layer.fields.cloudWater[fy*layer.width+fx];
    }
    support.push(Math.min(1,sum/9/dense));
  }
  return support;
}
export function weatherSun(state,p){const phase=state.time*p.sunSpeed*.02;return {elevation:p.sunElevation+5*(Math.cos(phase)-1),azimuth:p.sunAzimuth+20*Math.sin(phase*.5)};}
export function boltSettings(p){return {...Object.fromEntries(boltParameters.map(v=>[v.key,v.default])),chargeRate:p.storminess,chargeBias:p.chargeBias};}
function sampleBitmap(bitmap,u,v){if(v<0||v>=1)return 0;u=((u%1)+1)%1;return bitmap.alpha[Math.floor(v*bitmap.height)*bitmap.width+Math.floor(u*bitmap.width)]/255;}
// One canonical supplier sample, also used by the read-only inspector.
export function cloudIngredients(state,layer,p,x,y){
  const {width,height,distance}=layer,center=cloudAltitude(layer,p),thickness=[1,2.4,5][layer.index];
  const u=(x+.5)/width,v=(y+.5)/height;
  const worldY=((1-2*v)*SCALE+CAMERA_LIFT)*distance+.15+distance**2/(2*6371);
  const shifted=u-state.windOffset/(2*SCALE*distance*1.6)+(layer.seed%1024)/1024;
  const noise=perlin3(shifted*5,v*7,state.evolution,layer.seed%997),reveal=.45+.8*noise;
  const bitmap=sampleBitmap(cloudBitmaps[layer.index],shifted,.5-(worldY-center)/thickness);
  const band=Math.exp(-(((worldY-center)/(thickness*.55))**4));
  return {bitmap,reveal,humidity:.55+noise*.6,cloudWater:Math.max(0,p.coverage*(p.textureMix*bitmap+(1-p.textureMix)*Math.max(0,(noise-.38)*3)*band)*reveal)};
}
export function refreshFields(state,p){
  for(const layer of state.layers)for(let y=0;y<layer.height;y++)for(let x=0;x<layer.width;x++){
    const value=cloudIngredients(state,layer,p,x,y),i=y*layer.width+x;
    layer.fields.humidity[i]=value.humidity;layer.fields.cloudWater[i]=value.cloudWater;
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
  refreshFields(state,p);
  // The lightning model prepares one strike without seeing clouds; drop it unless it starts in dense cloud.
  for(const layer of state.layers){const storm=layer.lightning;storm.cloudSupport=cloudSupport(layer,p);
    const {from,to}=storm.strike??{};if(storm.phase==="ready"&&(storm.cloudSupport[from]<1||to>=0&&storm.cloudSupport[to]<1)){storm.phase="quiet";storm.strike=null;}}
  return state;
}
function rainStep(layer,p,dt){
  layer.rainClock+=dt;
  while(layer.rainClock>=.1){layer.rainClock-=.1;const old=layer.fields.rain;
    layer.fields.rain=old.map((v,i)=>clamp((i>=layer.width?old[i-layer.width]*.94:0)+Math.max(0,layer.fields.cloudWater[i]-(p.denseCloudWater??defaults.denseCloudWater))*p.rainAmount*.25));
  }
}
export function stepWeather(state,dt,p){
  state.accumulator+=Math.min(.25,Math.max(0,dt));let changed=false;
  while(state.accumulator+1e-10>=.05){state.accumulator=Math.max(0,state.accumulator-.05);if(state.accumulator<1e-10)state.accumulator=0;state.time+=.05;state.windOffset+=p.wind*.05;state.evolution+=p.formationSpeed*.05;
    // Coordinator order: cloud supplier → rain from dense cloud → cloud support → charge/channels.
    refreshFields(state,p);
    for(const layer of state.layers)if(enabled(layer,p)){rainStep(layer,p,.05);if(p.storminess>0){layer.lightning.cloudSupport=cloudSupport(layer,p);stepLightning({time:state.time,layers:[layer.lightning]},.05,boltSettings(p));}}
    changed=true;
  }
  return changed;
}
