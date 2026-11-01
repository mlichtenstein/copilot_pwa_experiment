/* Purpose: Read-only graph metadata and previews of actual fields, optical intermediates and composite passes.
 * Consumers: weather-inspector.js, weather-experiment.js and inspector tests.
 * Dependencies: weather field/model helpers and shared visibility/terrain functions; no DOM. */
import {SCALE,clamp,cloudIngredients,terrainY} from "./weather-fields.js";
import {renderWeather,boltLight,projectionLayers,renderOrder} from "./weather-model.js";
import {thresholdMask,combinedCoverage} from "./visibility-model.js";
import {sampleCloud} from "./shafts-model.js";
import {terrainShadowAt,groundLightRadius,drawTerrainObjects} from "./lightning-terrain.js";
export const nodes=[
  {id:"bitmap",label:"Grayscale bitmap",description:"Fixed Horizon mask, sampled with this layer’s altitude and wind. Produces part of cloud water."},
  {id:"reveal",label:"Evolving noise",description:"Current Perlin reveal factor. Shares its noise sample with diagnostic humidity and the cloud supplier."},
  {id:"humidity",label:"Humidity",description:"Normalized diagnostic field from the supplier noise. It does not currently drive rain or cloud water."},
  {id:"cloudWater",label:"Cloud water",description:"Bitmap/noise mixture times coverage and reveal. Read by opacity, visibility masks and the current simple rain source."},
  {id:"opacity",label:"Cloud opacity",description:"1 − exp(−cloudOpacity × cloud water), in the native field grid. Controls cloud-body blending."},
  {id:"mask",label:"Threshold mask",description:"Middle visibility-band mask: cloudOpacity × sharpened density ≥ 0.5. The other bands use thresholds 1 and 0.25."},
  {id:"cloudColor",label:"Cloud color",description:"Projected cloud-body contribution on black, before compositing. Uses atmospheric paths and visibility from farther layers, not its own silhouette."},
  {id:"visibility",label:"Visibility polygon",description:"This layer’s actual middle-band coverage in the camera plane, including feathered caps. White is reachable sunlight."},
  {id:"rain",label:"Rain water",description:"Separately transported rain field. The current illustrative source reads cloud water; stronger formation/interaction rules are next-PR work."},
  {id:"shafts",label:"Light veil",description:"This depth’s three-band veil contribution on black. Intersects visibility of this layer and all farther layers, then applies atmospheric sun color."},
  {id:"charge",label:"Charge potential",description:"Independent signed 12×6 potential field. Red/blue are opposite signs. No cloud-water-to-charge connection exists yet."},
  {id:"lightning",label:"Lightning light",description:"Current projected channel glow and core contribution on black. Black means there is no visible leader/flash."},
  {id:"terrain",label:"Terrain + props",description:"This depth’s projected ground and fixed tree/rock silhouettes, shown without atmospheric color."},
  {id:"groundLight",label:"Ground light / shadows",description:"Actual local contact-light pool after prop shadowing, on black. Only a ground flash activates it; cloud flashes leave it black."}
];
export const passes=renderOrder.map((id,index)=>({id,index,label:["Sky","+ Light veils","+ Far depth","+ Middle depth","+ Near depth","+ Terrain props"][index],view:index===5?"scene":`pass-${index}`}));
export function graphEdges(){
  const edges=[];
  for(const layer of ["near","middle","far"]){
    for(const [from,to] of [["bitmap","cloudWater"],["reveal","cloudWater"],["reveal","humidity"],["cloudWater","opacity"],["cloudWater","mask"],["opacity","cloudColor"],["mask","visibility"],["cloudWater","rain"],["charge","lightning"],["terrain","lightning"],["terrain","groundLight"],["lightning","groundLight"]])edges.push({from:`${layer}:${from}`,to:`${layer}:${to}`});
    for(const to of ["cloudColor","shafts","visibility"])edges.push({from:"sun",to:`${layer}:${to}`});
  }
  const names=["near","middle","far"];
  for(let i=0;i<3;i++)for(let j=i;j<3;j++)edges.push({from:`${names[j]}:visibility`,to:`${names[i]}:shafts`,cross:j!==i});
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)edges.push({from:`${names[j]}:visibility`,to:`${names[i]}:cloudColor`,cross:true});
  return edges;
}
export const needsLighting=view=>view==="scene"||view?.startsWith("pass-")||["sky","visibility","shafts","cloudColor"].includes(view);
export function renderInspection(state,p,maps,width=160,height=100){
  if(p.view==="scene"||["cloudWater","humidity","rain","charge"].includes(p.view))return renderWeather(state,p,maps,width,height);
  if(p.view==="sky"||p.view.startsWith("pass-"))return renderWeather(state,{...p,view:"scene"},maps,width,height,p.view==="sky"?0:Number(p.view.slice(5)));
  const layer=state.layers.find(l=>l.name===p.inspectLayer)??state.layers[0],index=layer.index,pixels=new Uint8ClampedArray(width*height*4),projected=projectionLayers(state,p);
  const mask=p.view==="mask"?thresholdMask(projected[index],{...p,cloudThreshold:.5}):null;
  const bolt=["lightning","groundLight"].includes(p.view)?boltLight(layer,p,width,height):null;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height,i=y*width+x,fx=Math.min(layer.width-1,Math.floor(u*layer.width)),fy=Math.min(layer.height-1,Math.floor(v*layer.height));let rgb=[0,0,0];
    if(["bitmap","reveal","opacity","mask"].includes(p.view)){
      const q=layer.fields.cloudWater[fy*layer.width+fx],value=p.view==="opacity"?1-Math.exp(-p.cloudOpacity*q):p.view==="mask"?mask[fy*layer.width+fx]:cloudIngredients(state,layer,p,fx,fy)[p.view]/(p.view==="reveal"?1.25:1);rgb=[value,value,value];
    } else if(p.view==="terrain")rgb=v>=terrainY(layer,u)?[.3,.4,.3]:[0,0,0];
    else if(p.view==="lightning")rgb=[.7,.75,1].map(c=>bolt.light[i]*c+bolt.cores[i]);
    else if(p.view==="groundLight"){
      const hit=bolt.contact,distance=hit?Math.hypot((u-hit.x)*1.6,v-hit.y):Infinity;
      const pool=v>=terrainY(layer,u)&&bolt.power>0?bolt.power*Math.max(0,1-distance/groundLightRadius)**2*terrainShadowAt(layer.objects,hit,u,v):0;rgb=[.8,.85,1].map(c=>pool*c);
    } else {
      const mi=Math.min(39,Math.floor(v*40))*64+Math.min(63,Math.floor(u*64));
      if(p.view==="visibility"){const value=maps.visibility.bands[1].layers[index].coverage[mi];rgb=[value,value,value];}
      else if(p.view==="shafts")for(const band of maps.visibility.bands){const amount=p.shaftStrength*p.haze*.22*band.weight*combinedCoverage(band.layers,index,mi)*clamp((maps.sun.elevation+6)/6);rgb=rgb.map((c,k)=>c*(1-amount)+maps.veilColors[index][k]*band.brightness*amount);}
      else if(p.view==="cloudColor"){
        const rx=(2*u-1)*SCALE*1.6,ry=(1-2*v)*SCALE,density=sampleCloud(projected[index],rx*layer.distance,ry*layer.distance),alpha=1-Math.exp(-p.cloudOpacity*density);
        const color=maps.colors[index][Math.min(7,Math.floor(v*8))*12+Math.min(11,Math.floor(u*12))];let lit=0;for(const band of maps.visibility.bands)lit+=band.weight*band.brightness*combinedCoverage(band.layers,index+1,mi);
        const sky=maps.sky[Math.min(19,Math.floor(v*20))*32+Math.min(31,Math.floor(u*32))];rgb=rgb.map((c,k)=>alpha*(([.018,.025,.045][k]+color.direct[k]*lit*.65)*color.transmission[k]+sky[k]*(1-color.transmission[k])));
      }
    }
    const isLinear=["cloudColor","shafts","lightning","groundLight"].includes(p.view);
    pixels.set([...rgb.map(c=>255*(isLinear?Math.pow(1-Math.exp(-Math.max(0,c)*p.exposure),1/2.2):clamp(c))),255],i*4);
  }
  if(p.view==="terrain")drawTerrainObjects(pixels,width,height,layer.objects);
  return pixels;
}
