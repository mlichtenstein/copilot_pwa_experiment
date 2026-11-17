/* Purpose: Perspective ellipsoid geometry and distant-light transport in one world space.
 * Consumers: normal-lighting experiment, side inspector and tests. Dependencies: palette helpers. */
import {clamp,gradientColor,facing} from './normal-lighting-model.js';
export const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
export const along=(p,d,t)=>p.map((v,i)=>v+d[i]*t);
export const CAMERA={position:[0,1,0],pitch:12*Math.PI/180,tanHalfFov:Math.tan(29*Math.PI/180),aspect:1.6};
export function lightDirection({azimuth=15,elevation=15}={}){
 const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
 return [Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
}
export function createCloudScene(params={}){
 const thickness=params.cloudThickness??1,spacing=params.layerSpacing??1;
 return {camera:CAMERA,clouds:[
  {id:'near',center:[-2,2.5,9*spacing],radii:[3.1,.85*thickness,1.8],color:'#89d9ef'},
  {id:'middle',center:[2.8,7,18*spacing],radii:[5,1.15*thickness,2.5],color:'#f3bb83'},
  {id:'far',center:[-2,16,32*spacing],radii:[8,1.5*thickness,3.5],color:'#bfadf6'}]};
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
export function opticalDepth(scene,origin,direction,density){
 return scene.clouds.reduce((sum,cloud)=>{const hit=intersectEllipsoid(origin,direction,cloud);return sum+(hit?(hit[1]-hit[0])*density:0);},0);
}
export function pickCloud(scene,u,v){
 const ray=cameraRay(u,v,scene.camera);
 return scene.clouds.map(cloud=>({cloud,hit:intersectEllipsoid(scene.camera.position,ray,cloud)})).filter(x=>x.hit).sort((a,b)=>a.hit[0]-b.hit[0])[0]?.cloud.id??null;
}
const scalar=['coverage','colorCoordinate','depth','thickness','facing','visibility','transmission'];
const rgb=['normals','broadNormals','incoming','direct','diffusion','sky','ambient','ambientPass','directPass','directAdded','diffusionAdded','scene'];
// Homogeneous participating ellipsoids: exact ray lengths, six midpoint samples for
// single scattering. Surface and broad-normal color remain artistic controls.
export function renderCloudScene(scene,params={},sun={},width=96,height=60){
 const count=width*height,fields=Object.fromEntries([...scalar,...rgb].map(k=>[k,new Float32Array(count*(scalar.includes(k)?1:3))]));
 const l=lightDirection(sun),density=params.cloudDensity??.7,light=clamp(((sun.elevation??15)+6)/10)*(params.lightSource==='moon'?(params.nightBrightness??.45):1);
 const ambientLight=.08+.92*light;
 const saturation=params.lightSource==='moon'?(params.nightSaturation??.45):1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,ray=cameraRay((x+.5)/width,(y+.5)/height,scene.camera);
  const ground=ray[1]<0?-scene.camera.position[1]/ray[1]:Infinity;
  const hits=scene.clouds.map(cloud=>({cloud,hit:intersectEllipsoid(scene.camera.position,ray,cloud)})).filter(({hit})=>hit&&hit[0]<ground).sort((a,b)=>a.hit[0]-b.hit[0]);
  const solarDisc=dot(ray,l)>Math.cos(.9*Math.PI/180)&&ground===Infinity;
  const sky=ground<Infinity?[.035,.045,.055]:[.045+.08*(1-y/height),.035+.07*(1-y/height),.12+.12*(1-y/height)];
  for(let c=0;c<3;c++)fields.sky[i*3+c]=solarDisc?(params.lightSource==='moon'?[.7,.8,1]:[1,.8,.38])[c]:sky[c]*ambientLight;
  let cameraTransmission=1,ambient=[0,0,0],direct=[0,0,0],scatter=[0,0,0];
  for(const {cloud,hit} of hits){
   const [start,end]=hit,length=Math.min(end,ground)-start,p=along(scene.camera.position,ray,start),n=surfaceNormal(p,cloud);
   // Small tangent perturbation changes detail normals, never body boundaries or broad colors.
   const noise=[Math.sin(p[0]*9+p[2]*3),Math.sin(p[2]*8-p[1]*5),Math.sin(p[1]*11+p[0]*4)];
   const normalNoise=dot(noise,n),fine=unit(n.map((v,c)=>v+.12*(noise[c]-normalNoise*v)));
   const coordinate=.5+(params.heightInfluence??1)*(p[1]/18-.5)+(params.broadNormalInfluence??.35)*dot(n,l);
   const color=gradientColor(coordinate,params).map(v=>light*(1+(v-1)*(params.gradientStrength??1)));
   const mu=facing(dot(fine,l),params.lightingModel??'lambert',params.wrap??.4);
   const surfaceFacing=1-(params.detailShadingStrength??1)+(params.detailShadingStrength??1)*mu;
   const visibility=Math.exp(-opticalDepth(scene,along(p,n,.001),l,density));
   const opacity=1-Math.exp(-density*length),weight=cameraTransmission*opacity;
   let transmission=0;
   const ds=length/6;
   for(let step=0;step<6;step++){
    const t=(step+.5)*ds,point=along(p,ray,t);
    transmission+=Math.exp(-density*t-opticalDepth(scene,point,l,density))*density*ds;
   }
   // Modest forward bias; an artistic single-scattering approximation, not a phase solver.
   transmission*=.3+.7*Math.max(0,dot(ray,l))**6;
   if(cameraTransmission===1){
    fields.depth[i]=start;fields.thickness[i]=length;fields.colorCoordinate[i]=clamp(coordinate);
    fields.facing[i]=surfaceFacing;fields.visibility[i]=visibility;fields.transmission[i]=transmission;
    fields.normals.set(fine,i*3);fields.broadNormals.set(n,i*3);fields.incoming.set(color,i*3);
   }
   for(let c=0;c<3;c++){
    ambient[c]+=weight*[.055,.065,.10][c]*ambientLight;
    direct[c]+=weight*color[c]*visibility*(params.lightingModel==='ramp'?1:surfaceFacing);
    scatter[c]+=cameraTransmission*color[c]*transmission*(params.transmissionStrength??1.8);
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
