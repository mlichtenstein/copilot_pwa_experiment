/* Purpose: Read-only graph metadata and previews of actual fields, optical intermediates and composite passes.
 * Consumers: weather-inspector.js, weather-experiment.js and inspector tests.
 * Dependencies: weather field/model helpers and shared visibility/terrain functions; no DOM. */
import {SCALE,clamp,cloudIngredients,terrainY} from "./weather-fields.js";
import {renderWeather,boltLight,projectionLayers,renderOrder,lightingIndex,moonCloudLight} from "./weather-model.js";
import {thresholdMask,combinedCoverage} from "./visibility-model.js";
import {sampleCloud} from "./shafts-model.js";
import {terrainShadowAt,groundLightRadius,drawTerrainObjects} from "./lightning-terrain.js";
export const nodes=[
  {id:"bitmap",label:"Cloud texture",description:"Fixed Horizon mask, sampled with this layer’s altitude and wind. Produces part of cloud water."},
  {id:"reveal",label:"Cloud reveal noise",description:"Current Perlin reveal factor. Shares its noise sample with diagnostic humidity and the cloud supplier."},
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
// Types describe source data, rather than the RGB colors used to visualize it.
const contracts={
 bitmap:["Scalar field · 0–1","Fixed grayscale bitmap; altitude; wind offset; layer seed","Wrap horizontal bitmap coordinate; sample alpha at projected altitude. Outside bitmap height → 0."],
 reveal:["Scalar field · evolving noise","3D Perlin noise n; wind offset; evolution time","reveal = 0.45 + 0.8 × n. Preview divides by 1.25 for display."],
 humidity:["Scalar field · diagnostic","Same Perlin sample n as reveal","humidity = 0.55 + 0.6 × n. Recomputed each supplier tick; no outgoing coupling yet."],
 cloudWater:["Scalar field · normalized water","Bitmap B; Perlin n; altitude band G; reveal R; coverage; textureMix","q = max(0, coverage × (textureMix × B + (1 − textureMix) × max(0, (n − 0.38) × 3) × G) × R). G is the altitude envelope."],
 opacity:["Scalar field · 0–1 opacity","Cloud water q; cloudOpacity","alpha = 1 − exp(−cloudOpacity × q). Derived at render time."],
 mask:["Boolean field · cloud / clear","Cloud water; cloudSharpness; cloudOpacity; band threshold","Sharpen density, then compare cloudOpacity × sharpened density ≥ threshold. Middle band shown: 0.5; other bands: 1 and 0.25."],
 cloudColor:["RGB color field · linear light","Cloud opacity; atmospheric direct light/transmission; sky; moon position; farther visibility","Add cool lunar backlight within three moon radii, attenuated by cloud optical depth. Multiply cloud lighting by opacity; direct light is weighted by farther-layer visibility. Tone map for display; own silhouette does not shade its cloud body."],
 visibility:["Scalar field · 0–1 light coverage","Threshold mask; sun position; band radius; edgeFeather","Build sun visibility polygon through the thresholded cloud edges; feather cloud-facing caps. Camera-plane middle band shown; ray sides remain crisp."],
 rain:["Scalar field · normalized rain","Previous rain above; cloud water q; rainAmount","Every 0.1 s: rain = clamp(0.94 × rainAbove + max(0, q − 0.65) × rainAmount × 0.25, 0, 1). Top boundary has no incoming rain."],
 shafts:["RGB color field · linear light","Same/farther visibility bands; atmospheric sun color; haze; shaftStrength","Intersect visibility from this depth outward; weight three bands and blend their colored light contributions. Tone map for display."],
 charge:["Signed scalar field · 12×6","Previous charge; stochastic increments; storminess; chargeBias","Existing lightning dynamics drift/diffuse charge and discharge excessive gradients into channels. Independent of cloud water; red/blue display opposite signs."],
 lightning:["RGB color field · channel raster","Charge gradients; channel geometry; strike age; terrain contact","Rasterize current channel core and glow using strike timing. No visible strike → black; tone map the light contribution."],
 terrain:["Geometry + boolean silhouette raster","Layer distance; fixed ridge; seeded trees/rocks","Project the ridge and rasterize props. Preview uses neutral colors; terrain supplies contact geometry and shadow occluders."],
 groundLight:["RGB color field · local illumination","Ground-contact flash; terrain; trees/rocks","pool = flashPower × max(0, 1 − distance / radius)² × propShadow. Only below terrain and during ground flashes; tone map for display."]
};
for(const node of nodes){const [type,inputs,rule]=contracts[node.id];Object.assign(node,{type,inputs,rule});}
export function describeNode(node){return `${node.description} Type: ${node.type}. Inputs: ${node.inputs}. Rule: ${node.rule}`;}
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
      const mi=lightingIndex(maps,u,v);
      if(p.view==="visibility"){const value=maps.visibility.bands[1].layers[index].coverage[mi];rgb=[value,value,value];}
      else if(p.view==="shafts")for(const band of maps.visibility.bands){const amount=p.shaftStrength*p.haze*.22*band.weight*combinedCoverage(band.layers,index,mi)*clamp((maps.sun.elevation+6)/6);rgb=rgb.map((c,k)=>c*(1-amount)+maps.veilColors[index][k]*band.brightness*amount);}
      else if(p.view==="cloudColor"){
        const rx=(2*u-1)*SCALE*1.6,ry=(1-2*v)*SCALE,density=sampleCloud(projected[index],rx*layer.distance,ry*layer.distance),alpha=1-Math.exp(-p.cloudOpacity*density);
        const color=maps.colors[index][mi];let lit=0;for(const band of maps.visibility.bands)lit+=band.weight*band.brightness*combinedCoverage(band.layers,index+1,mi);
        const sky=maps.sky[mi],moonlight=moonCloudLight(maps,u,v,density,p);rgb=rgb.map((c,k)=>alpha*(([.018,.025,.045][k]+color.direct[k]*lit*.65+moonlight*[.72,.82,1][k])*color.transmission[k]+sky[k]*(1-color.transmission[k])));
      }
    }
    const isLinear=["cloudColor","shafts","lightning","groundLight"].includes(p.view);
    pixels.set([...rgb.map(c=>255*(isLinear?Math.pow(1-Math.exp(-Math.max(0,c)*p.exposure),1/2.2):clamp(c))),255],i*4);
  }
  if(p.view==="terrain")drawTerrainObjects(pixels,width,height,layer.objects);
  return pixels;
}

