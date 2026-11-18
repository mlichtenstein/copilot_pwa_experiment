/* Purpose: Layer transforms, shared solid intersections and distant-light transport in one world space.
 * Consumers: normal-lighting experiment, side inspector and tests. Dependencies: palette helpers. */
import {ANALYTIC_SHAPES,traceShape} from './cloud-shapes.js';
import {clamp,gradientColor,facing} from './normal-lighting-model.js';
export const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
export const along=(p,d,t)=>p.map((v,i)=>v+d[i]*t);
export const CAMERA={position:[0,1,0],pitch:12*Math.PI/180,tanHalfFov:Math.tan(29*Math.PI/180),aspect:1.6};
export function lightDirection({azimuth=15,elevation=15}={}){
 const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
 return [Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
}
export function createCloudScene(params={},shapes=ANALYTIC_SHAPES){
 const thickness=params.cloudThickness??1,spacing=params.layerSpacing??1;
 return {camera:CAMERA,clouds:[
  {id:'near',center:[-2,6,9*spacing],radii:[3.1,.85*thickness,1.8],color:'#89d9ef'},
  {id:'middle',center:[2.8,6,18*spacing],radii:[5,1.15*thickness,2.5],color:'#f3bb83'},
  {id:'far',center:[-2,6,32*spacing],radii:[8,1.5*thickness,3.5],color:'#bfadf6'}].map(cloud=>({...cloud,shapeName:params[`${cloud.id}Shape`]??'ellipsoid',shape:shapes[params[`${cloud.id}Shape`]??'ellipsoid'],yaw:(params[`${cloud.id}Yaw`]??0)*Math.PI/180}))};
}
export function cameraRay(u,v,camera=CAMERA){
 const y=(1-2*v)*camera.tanHalfFov,z=1,s=Math.sin(camera.pitch),c=Math.cos(camera.pitch);
 return unit([(2*u-1)*camera.tanHalfFov*camera.aspect,y*c+z*s,z*c-y*s]);
}
export function projectDirection(d,camera=CAMERA){
 const s=Math.sin(camera.pitch),c=Math.cos(camera.pitch),z=d[2]*c+d[1]*s;
 if(z<=0)return null;
 return [.5+d[0]/(2*z*camera.tanHalfFov*camera.aspect),.5-(d[1]*c-d[2]*s)/(2*z*camera.tanHalfFov)];
}
export function intersectEllipsoid(origin,direction,cloud){
 const q=origin.map((v,i)=>(v-cloud.center[i])/cloud.radii[i]),d=direction.map((v,i)=>v/cloud.radii[i]);
 const a=dot(d,d),b=dot(q,d),c=dot(q,q)-1,disc=b*b-a*c;
 if(disc<0)return null;
 const root=Math.sqrt(disc),start=(-b-root)/a,end=(-b+root)/a;
 return end>0?[Math.max(0,start),end]:null;
}
export function surfaceNormal(p,cloud){return unit(p.map((v,i)=>(v-cloud.center[i])/cloud.radii[i]**2));}
// Inverse-transform rays without renormalizing: intersection t stays in world units.
const rotate=(v,yaw)=>[v[0]*Math.cos(yaw)+v[2]*Math.sin(yaw),v[1],v[2]*Math.cos(yaw)-v[0]*Math.sin(yaw)];
export function localToWorld(cloud,p){return along(cloud.center,rotate(p.map((v,i)=>v*cloud.radii[i]),cloud.yaw??0),1);}
export function rayCloud(cloud,origin,direction,withNormals=true){
 const yaw=cloud.yaw??0,o=rotate(origin.map((v,i)=>v-cloud.center[i]),-yaw).map((v,i)=>v/cloud.radii[i]),d=rotate(direction,-yaw).map((v,i)=>v/cloud.radii[i]);
 const normal=n=>unit(rotate(n.map((v,i)=>v/cloud.radii[i]),yaw));
 const shape=cloud.shapeName?cloud.shape:ANALYTIC_SHAPES.ellipsoid;
 const hits=traceShape(shape,o,d,withNormals);
 return withNormals?hits.map(hit=>({...hit,normal:normal(hit.normal),geometricNormal:normal(hit.geometricNormal),cloud})):hits;
}
export function sceneIntervals(scene,origin,direction){return scene.clouds.flatMap(cloud=>rayCloud(cloud,origin,direction)).sort((a,b)=>a.start-b.start);}
export function opticalDepth(scene,origin,direction,density){
 let length=0;for(const cloud of scene.clouds)for(const hit of rayCloud(cloud,origin,direction,false))length+=hit.end-hit.start;return length*density;
}
export function pickCloud(scene,u,v){return sceneIntervals(scene,scene.camera.position,cameraRay(u,v,scene.camera))[0]?.cloud.id??null;}
export const SIDE={width:240,height:130,minZ:-3,maxZ:49,minY:-4,maxY:22};
export const SIDE_PLOT={x:42,y:30,width:624,height:312};
export const sidePixel=p=>[SIDE_PLOT.x+(p[2]-SIDE.minZ)*12,SIDE_PLOT.y+(SIDE.maxY-p[1])*12];
export function sidePoint(u,v){return [0,SIDE.maxY-v*(SIDE.maxY-SIDE.minY),SIDE.minZ+u*(SIDE.maxZ-SIDE.minZ)];}
export function sideCloudAt(scene,u,v){const p=sidePoint(u,v);return sceneIntervals(scene,[-50,p[1],p[2]],[1,0,0])[0]?.cloud.id??null;}
export function sideSilhouettes(scene){
 const {width,height}=SIDE,masks=scene.clouds.map(()=>new Uint8Array(width*height));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=sidePoint((x+.5)/width,(y+.5)/height);
  scene.clouds.forEach((cloud,k)=>{if(rayCloud(cloud,[-50,p[1],p[2]],[1,0,0],false).length)masks[k][y*width+x]=1;});
 }
 return masks;
}
// A separate angular inset avoids implying a finite source inside the world plot.
export const SOURCE_DIAL={x:570,y:99,radius:48};
export function sideLightMarker(sun){
 const l=lightDirection(sun),projected=Math.hypot(l[2],l[1]);
 if(projected<1e-6)return {...SOURCE_DIAL,outOfPlane:true,towardX:l[0]>0};
 return {x:SOURCE_DIAL.x+SOURCE_DIAL.radius*l[2]/projected,y:SOURCE_DIAL.y-SOURCE_DIAL.radius*l[1]/projected,outOfPlane:false,towardX:l[0]>0};
}
// Local Earth-shadow axis across the rays; hue varies on the perpendicular, ray-aligned axis.
export function gradientAxis({azimuth=15,elevation=15}={}){
 const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
 return [-Math.sin(a)*Math.sin(e),Math.cos(e),-Math.cos(a)*Math.sin(e)];
}
export function gradientCoordinate(p,params={},sun={},normal=[0,0,0]){
 const offset=p.map((v,i)=>v-[0,6,20][i]);
 return .5+(params.heightInfluence??1)*dot(offset,lightDirection(sun))/40+(params.broadNormalInfluence??.35)*dot(normal,lightDirection(sun));
}
export function hueColor(coordinate,params={}){
 const paletteParams={...params,gradientKind:'cloudSunset'};
 const color=gradientColor(coordinate,paletteParams),value=Math.max(...color)||1;
 // Normalize HSV value: hue controls must not introduce a second brightness gradient.
 return color.map(v=>1+(v/value-1)*(params.gradientStrength??1));
}
export function earthLightAt(p,params={},sun={}){
 // Ground reference on the sunward edge. Tilting this plane lifts the shadow over
 // nearby clouds at dusk while farther/upper clouds can still receive sunlight.
 const distance=dot(p.map((v,i)=>v-[0,0,50][i]),gradientAxis(sun))-(params.shadowHeight??0);
 const t=clamp(.5+distance/Math.max(.01,params.shadowSoftness??4));
 const floor=params.shadowFloor??.03;
 return floor+(1-floor)*t*t*(3-2*t);
}
export function spatialGradientColor(p,params={},sun={}){
 return hueColor(gradientCoordinate(p,params,sun),params);
}
export function illuminationAt(p,params={},sun={},normal=[0,0,0]){
 const earthLight=earthLightAt(p,params,sun),source=params.lightSource==='moon'?(params.nightBrightness??.45):1;
 return hueColor(gradientCoordinate(p,params,sun,normal),params).map(v=>v*earthLight*source);
}
// Direct incident light arriving at a surface, before normal-facing reflection or scattering.
export function directIlluminationAt(scene,p,normal,geometricNormal,params={},sun={}){
 const incoming=illuminationAt(p,params,sun,normal);
 const visibility=Math.exp(-opticalDepth(scene,along(p,geometricNormal,.001),lightDirection(sun),params.cloudDensity??.7));
 return {incoming,visibility,color:incoming.map(v=>v*visibility)};
}
export function sideSurfaceSamples(scene){
 const {width,height}=SIDE;
 return scene.clouds.map(cloud=>Array.from({length:width*height},(_,i)=>{
  const p=sidePoint((i%width+.5)/width,(Math.floor(i/width)+.5)/height),origin=[-50,p[1],p[2]],hit=rayCloud(cloud,origin,[1,0,0])[0];
  return hit?{point:along(origin,[1,0,0],hit.start),normal:hit.normal,geometricNormal:hit.geometricNormal}:null;
 }));
}
const cameraCache=new WeakMap();
function cameraSamples(scene,width,height){
 const cached=cameraCache.get(scene);if(cached?.width===width&&cached.height===height)return cached.samples;
 const samples=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const ray=cameraRay((x+.5)/width,(y+.5)/height,scene.camera),ground=ray[1]<0?-scene.camera.position[1]/ray[1]:Infinity;samples.push({ray,ground,hits:sceneIntervals(scene,scene.camera.position,ray).filter(hit=>hit.start<ground)});}
 cameraCache.set(scene,{width,height,samples});return samples;
}
const scalar=['coverage','earthLight','colorCoordinate','depth','thickness','facing','visibility','transmission'];
const rgb=['normals','broadNormals','incoming','directIncident','direct','diffusion','sky','ambient','ambientPass','directPass','directAdded','diffusionAdded','scene'];
// Homogeneous participating solids: shared ray intervals, six midpoint samples for
// single scattering. Surface and broad-normal color remain artistic controls.
export function renderCloudScene(scene,params={},sun={},width=96,height=60){
 const count=width*height,fields=Object.fromEntries([...scalar,...rgb].map(k=>[k,new Float32Array(count*(scalar.includes(k)?1:3))]));
 fields.layerIndex=new Int8Array(count).fill(-1);
 const l=lightDirection(sun),density=params.cloudDensity??.7,light=clamp(((sun.elevation??15)+6)/10)*(params.lightSource==='moon'?(params.nightBrightness??.45):1);
 const ambientLight=.08+.92*light;
 const samples=cameraSamples(scene,width,height);
 const saturation=params.lightSource==='moon'?(params.nightSaturation??.45):1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,{ray,ground,hits}=samples[i];
  const solarDisc=dot(ray,l)>Math.cos(.9*Math.PI/180)&&ground===Infinity;
  const sky=ground<Infinity?[.035,.045,.055]:[.045+.08*(1-y/height),.035+.07*(1-y/height),.12+.12*(1-y/height)];
  for(let c=0;c<3;c++)fields.sky[i*3+c]=solarDisc?(params.lightSource==='moon'?[.7,.8,1]:[1,.8,.38])[c]:sky[c]*ambientLight;
  let cameraTransmission=1,ambient=[0,0,0],direct=[0,0,0],scatter=[0,0,0];
  for(const hit of hits){
   const {start,end,normal:n,geometricNormal}=hit,length=Math.min(end,ground)-start,p=along(scene.camera.position,ray,start);
   // Small tangent perturbation changes detail normals, never body boundaries or broad colors.
   const noise=[Math.sin(p[0]*9+p[2]*3),Math.sin(p[2]*8-p[1]*5),Math.sin(p[1]*11+p[0]*4)];
   const normalNoise=dot(noise,n),fine=unit(n.map((v,c)=>v+.12*(noise[c]-normalNoise*v)));
   const coordinate=gradientCoordinate(p,params,sun,n);
   const incident=directIlluminationAt(scene,p,n,geometricNormal,params,sun),color=incident.incoming;
   const mu=facing(dot(fine,l),params.lightingModel??'lambert',params.wrap??.4);
   const surfaceFacing=1-(params.detailShadingStrength??1)+(params.detailShadingStrength??1)*mu;
   const visibility=incident.visibility;
   const opacity=1-Math.exp(-density*length),weight=cameraTransmission*opacity;
   let transmission=0,scatteredColor=[0,0,0];
   const ds=length/6;
   for(let step=0;step<6;step++){
    const t=(step+.5)*ds,point=along(p,ray,t);
    const transport=Math.exp(-density*t-opticalDepth(scene,point,l,density))*density*ds;
    transmission+=transport;const incoming=illuminationAt(point,params,sun,n);
    for(let c=0;c<3;c++)scatteredColor[c]+=incoming[c]*transport;
   }
   // Modest forward bias; an artistic single-scattering approximation, not a phase solver.
   const phase=.3+.7*Math.max(0,dot(ray,l))**6;transmission*=phase;
   if(cameraTransmission===1){
    fields.layerIndex[i]=scene.clouds.indexOf(hit.cloud);fields.depth[i]=start;fields.thickness[i]=length;fields.colorCoordinate[i]=clamp(coordinate);
    fields.earthLight[i]=earthLightAt(p,params,sun);fields.facing[i]=surfaceFacing;fields.visibility[i]=visibility;fields.transmission[i]=transmission;
    fields.normals.set(fine,i*3);fields.broadNormals.set(n,i*3);fields.incoming.set(color,i*3);fields.directIncident.set(incident.color,i*3);
   }
   for(let c=0;c<3;c++){
    ambient[c]+=weight*[.055,.065,.10][c]*ambientLight;
    direct[c]+=weight*color[c]*visibility*(params.lightingModel==='ramp'?1:surfaceFacing);
    scatter[c]+=cameraTransmission*scatteredColor[c]*phase*(params.transmissionStrength??1.8);
   }
   cameraTransmission*=1-opacity;
  }
  fields.coverage[i]=1-cameraTransmission;
  for(let c=0;c<3;c++){
   const j=i*3+c;fields.ambient[j]=ambient[c];fields.direct[j]=direct[c];fields.diffusion[j]=scatter[c];
   fields.ambientPass[j]=fields.sky[j]*cameraTransmission+ambient[c];
   fields.directAdded[j]=params.directEnabled===false?0:direct[c];
   fields.diffusionAdded[j]=params.diffusionEnabled===false?0:scatter[c];
   fields.directPass[j]=fields.ambientPass[j]+fields.directAdded[j];fields.scene[j]=fields.directPass[j]+fields.diffusionAdded[j];
  }
 }
 if(saturation!==1)for(const key of rgb.filter(k=>!k.includes('Normals')&&k!=='normals'))for(let i=0;i<count;i++){
  const j=i*3,f=fields[key],gray=dot([.2126,.7152,.0722],Array.from(f.slice(j,j+3)));
  for(let c=0;c<3;c++)f[j+c]=gray+(f[j+c]-gray)*saturation;
 }
 return fields;
}
