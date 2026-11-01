/* Purpose: Interpret shared weather fields as atmospheric colors, layered visibility, and explicit render passes.
 * Consumers: weather-experiment.js, weather-inspection.js and weather tests.
 * Dependencies: weather-fields.js, atmosphere/visibility/shafts models, and lightning terrain helpers. */
import {SCALE,CAMERA_LIFT,clamp,enabled,cloudAltitude,terrainY,weatherSun} from "./weather-fields.js";
import {skyRadiance,sunDirection,pointAtAltitude,directSunlight,viewTransmission,EARTH_RADIUS,CAMERA_HEIGHT,earthBlocks,dot} from "./atmosphere-model.js";
import {buildLayeredVisibility,combinedCoverage} from "./visibility-model.js";
import {sampleCloud} from "./shafts-model.js";
import {groundAt} from "./lightning-model.js";
import {terrainShadowAt,drawTerrainObjects,groundLightRadius} from "./lightning-terrain.js";
export const renderOrder=["sky","all-light-veils","far-cloud-rain-lightning-terrain","middle-cloud-rain-lightning-terrain","near-cloud-rain-lightning-terrain","terrain-props"];
export function projectionLayers(state,p){return state.layers.map(l=>({...l,density:enabled(l,p)?l.fields.cloudWater:l.fields.cloudWater.map(()=>0)}));}
function rayAt(u,v){const ray=[(2*u-1)*SCALE*1.6,(1-2*v)*SCALE+CAMERA_LIFT,1],len=Math.hypot(...ray);return ray.map(x=>x/len);}
// Bilinear interpolation in linear RGB; samples are located at cell centers.
export function interpolateRGB(grid,width,height,u,v,key){
  const x=Math.max(0,Math.min(width-1,u*width-.5)),y=Math.max(0,Math.min(height-1,v*height-.5));
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
  const at=(a,b)=>key?grid[b*width+a][key]:grid[b*width+a];
  const a=at(x0,y0),b=at(x1,y0),c=at(x0,y1),d=at(x1,y1);
  return a.map((value,k)=>(value*(1-fx)+b[k]*fx)*(1-fy)+(c[k]*(1-fx)+d[k]*fx)*fy);
}
export const lightingIndex=(maps,u,v)=>Math.min(maps.height-1,Math.floor(v*maps.height))*maps.width+Math.min(maps.width-1,Math.floor(u*maps.width));
export function buildWeatherLighting(state,p,sunOverride,width=160,height=100){
  const sun=sunOverride??weatherSun(state,p),direction=sunDirection(sun.elevation,sun.azimuth),layers=projectionLayers(state,p),full=p.lightingMode==="full";
  const skyWidth=full?width:32,skyHeight=full?height:20,colorWidth=full?width:12,colorHeight=full?height:8;
  const {lightingMode,...visibilityParams}=p;
  const options={...visibilityParams,sunElevation:Math.atan(Math.tan(sun.elevation*Math.PI/180)-CAMERA_LIFT*Math.cos(sun.azimuth*Math.PI/180))*180/Math.PI,sunAzimuth:sun.azimuth,sourceRadius:6};
  // Polygon coverage stays sharp and is evaluated at output resolution in both modes.
  const visibility=buildLayeredVisibility({layers},options,width,height);
  const skySource=Array.from({length:skyWidth*skyHeight},(_,i)=>skyRadiance(rayAt((i%skyWidth+.5)/skyWidth,(Math.floor(i/skyWidth)+.5)/skyHeight),direction,p,false));
  const sky=full?skySource:Array.from({length:width*height},(_,i)=>interpolateRGB(skySource,skyWidth,skyHeight,(i%width+.5)/width,(Math.floor(i/width)+.5)/height));
  const colors=state.layers.map(layer=>{
    const source=Array.from({length:colorWidth*colorHeight},(_,i)=>{
      const u=(i%colorWidth+.5)/colorWidth,v=(Math.floor(i/colorWidth)+.5)/colorHeight,lateral=(2*u-1)*SCALE*1.6*layer.distance;
      const altitude=Math.max(.02,.15+((1-2*v)*SCALE+CAMERA_LIFT)*layer.distance+layer.distance**2/(2*6371));
      const point=pointAtAltitude(layer.distance,altitude,lateral);
      return {direct:directSunlight(point,direction,p),transmission:viewTransmission(point,p)};
    });
    return full?source:Array.from({length:width*height},(_,i)=>{
      const u=(i%width+.5)/width,v=(Math.floor(i/width)+.5)/height;
      return {direct:interpolateRGB(source,colorWidth,colorHeight,u,v,"direct"),transmission:interpolateRGB(source,colorWidth,colorHeight,u,v,"transmission")};
    });
  });
  const veilColors=state.layers.map(layer=>directSunlight(pointAtAltitude(layer.distance,cloudAltitude(layer,p)),direction,p));
  const camera=[0,EARTH_RADIUS+CAMERA_HEIGHT,0],sunlight=directSunlight(camera,direction,p);
  return {width,height,sun,direction,camera,sunlight,visibility,sky,colors,veilColors,work:{skySamples:skyWidth*skyHeight,surfaceSamples:3*colorWidth*colorHeight,cells:state.layers.reduce((n,l)=>n+l.width*l.height,0),segments:visibility.bands.reduce((n,b)=>n+b.layers.reduce((k,l)=>k+l.segments.length,0),0)}};
}
function mapBolt(layer,node,p){
  const top=.5-((cloudAltitude(layer,p)-.15)/layer.distance-CAMERA_LIFT)/(2*SCALE)-.09;
  return {x:node.x,y:top+(node.y-.09)/(groundAt(node.x,layer.lightning.depth)-.09)*(terrainY(layer,node.x)-top)};
}
export function boltLight(layer,p,width,height){
  const storm=layer.lightning,power=p.storminess<=0?0:storm.phase==="flash"?.65*Math.exp(-storm.age/.18):storm.phase==="leader"?.09:0;
  const nodes=storm.nodes.map(n=>({...mapBolt(layer,n,p),parent:n.parent,branch:n.branch})),path=new Set(storm.returnPath),light=new Float32Array(width*height),cores=new Float32Array(width*height);
  for(let i=1;i<nodes.length&&power>0;i++){
    const b=nodes[i],a=nodes[b.parent],ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height,energy=power*(path.has(i)?1:b.branch?.3:.6),radius=7*width/160;
    for(let y=Math.max(0,Math.floor(Math.min(ay,by)-radius));y<=Math.min(height-1,Math.ceil(Math.max(ay,by)+radius));y++)for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius));x<=Math.min(width-1,Math.ceil(Math.max(ax,bx)+radius));x++){
      const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)),d2=(x-ax-t*dx)**2+(y-ay-t*dy)**2,index=y*width+x;
      light[index]+=energy*Math.exp(-d2/(3*(width/160)**2))*.4;cores[index]=Math.max(cores[index],energy*Math.exp(-d2/(.45*(width/160)**2)));
    }
  }
  return {light,cores,contact:nodes[storm.head],power:storm.phase==="flash"&&storm.strike?.kind==="ground"?power:0};
}
export function renderWeather(state,p,maps,width=160,height=100,throughPass=5){
  const pixels=new Uint8ClampedArray(width*height*4);
  if(p.view!=="scene"){
    const layer=state.layers.find(l=>l.name===p.inspectLayer)??state.layers[0],isCharge=p.view==="charge",field=isCharge?layer.lightning.charge.values:layer.fields[p.view],w=isCharge?12:layer.width,h=isCharge?6:layer.height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const q=field[Math.floor(y/height*h)*w+Math.floor(x/width*w)],v=clamp(Math.abs(q)/(isCharge?3:1));pixels.set(isCharge?(q>=0?[v*255,20,30,255]:[20,40,v*255,255]):[v*180,v*210,v*255,255],(y*width+x)*4);}return pixels;
  }
  const bolts=state.layers.map(l=>boltLight(l,p,width,height)),layers=projectionLayers(state,p),vMaps=maps.visibility;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height,rx=(2*u-1)*SCALE*1.6,ry=(1-2*v)*SCALE,index=y*width+x;
    const mi=lightingIndex(maps,u,v),sky=maps.sky[mi];let rgb=sky.slice();
    // Sample the small disc on the final pixel grid, rather than the coarse sky grid.
    const ray=rayAt(u,v);if(dot(ray,maps.direction)>Math.cos(.55*Math.PI/180)&&!earthBlocks(maps.camera,ray))rgb=rgb.map((c,k)=>c+maps.sunlight[k]*5);
    // Veils precede bodies: the same field supplies both the silhouettes and cloud opacity.
    for(let j=2;j>=0&&throughPass>=1;j--)if(enabled(state.layers[j],p))for(const band of vMaps.bands){
      const alpha=p.shaftStrength*p.haze*.22*band.weight*combinedCoverage(band.layers,j,mi)*clamp((maps.sun.elevation+6)/6);
      rgb=rgb.map((c,k)=>c*(1-alpha)+maps.veilColors[j][k]*band.brightness*alpha);
    }
    for(let j=2;j>=Math.max(0,4-throughPass);j--){const layer=state.layers[j];if(!enabled(layer,p))continue;
      const density=sampleCloud(layers[j],rx*layer.distance,ry*layer.distance),alpha=1-Math.exp(-p.cloudOpacity*density),color=maps.colors[j][mi];
      let lit=0;for(const band of vMaps.bands)lit+=band.weight*band.brightness*combinedCoverage(band.layers,j+1,mi);
      rgb=rgb.map((c,k)=>c*(1-alpha)+alpha*(([.018,.025,.045][k]+color.direct[k]*lit*.65)*color.transmission[k]+sky[k]*(1-color.transmission[k])));
      const fx=Math.min(layer.width-1,Math.floor(u*layer.width)),fy=Math.min(layer.height-1,Math.floor(v*layer.height)),rain=layer.fields.rain[fy*layer.width+fx];
      const streak=((x*17+Math.floor(y/3)+Math.floor(state.time*8))%13)<2;
      if(streak&&rain>0)rgb=rgb.map((c,k)=>c*(1-rain*.6)+rain*.6*([.18,.22,.3][k]+color.direct[k]*.2));
      const bolt=bolts[j];rgb=rgb.map((c,k)=>c+bolt.light[index]*[.7,.75,1][k]+bolt.cores[index]);
      if(v>=terrainY(layer,u)){
        const hit=bolt.contact,distance=hit?Math.hypot((u-hit.x)*1.6,v-hit.y):Infinity;
        const pool=bolt.power*Math.max(0,1-distance/groundLightRadius)**2*(bolt.power>0?terrainShadowAt(layer.objects,hit,u,v):1);
        rgb=rgb.map((c,k)=>([.004,.007,.013][k]+color.direct[k]*.016)*color.transmission[k]+sky[k]*(1-color.transmission[k])*.3+pool*[.8,.85,1][k]);
      }
    }
    pixels.set([...rgb.map(c=>255*Math.pow(1-Math.exp(-Math.max(0,c)*p.exposure),1/2.2)),255],index*4);
  }
  // Opaque terrain has already established depth. Clip each prop against all nearer terrain.
  for(let j=2;j>=0&&throughPass>=5;j--)if(enabled(state.layers[j],p)){
    const props=state.layers[j].objects.filter(o=>state.layers.slice(0,j).every(l=>!enabled(l,p)||o.y-o.height<terrainY(l,o.x)));
    const propPixels=new Uint8ClampedArray(pixels.length);drawTerrainObjects(propPixels,width,height,props);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(propPixels[i+3]&&state.layers.slice(0,j).every(l=>!enabled(l,p)||y/height<terrainY(l,x/width)))pixels.set(propPixels.subarray(i,i+4),i);}
  }
  return pixels;
}
