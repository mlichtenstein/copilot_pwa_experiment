/* Purpose: Load baked maps and expose a controlled lighting workbench.
 * Consumers: normal-lighting.js and registry. Dependencies: model, browser Image/canvas, shared host. */
import {decodeMaps,shadeCloud,clamp} from './normal-lighting-model.js';
// A direction marker uses the same azimuth/elevation as the lighting vector.
// Clamp off-screen directions to the border; draw it after composition for visibility.
export function drawSunMarker(pixels,width,height,sun){
 const sx=Math.round(clamp(.5+sun.azimuth/180)*(width-1)),sy=Math.round(clamp(.5-sun.elevation/90)*(height-1));
 const radius=Math.max(1,Math.round(width/48));
 for(let y=Math.max(0,sy-radius-1);y<=Math.min(height-1,sy+radius+1);y++)for(let x=Math.max(0,sx-radius-1);x<=Math.min(width-1,sx+radius+1);x++){
  const d=Math.hypot(x-sx,y-sy);if(d>radius+1)continue;
  const color=d<=radius?[255,240,120]:[55,28,8],i=(y*width+x)*4;
  pixels.set([...color,255],i);
 }
 return pixels;
}
export const nodes=['coverage','normals','depth','thickness','incoming','facing','visibility','direct','diffusion'].map(id=>({id,label:id,description:{normals:'Baked unit normals: +X right, +Y up, +Z toward viewer.',incoming:'Artistic incoming sunlight RGB, before coverage.',visibility:'Sunlight surviving the baked depth slab.'}[id]??id}));
export const passes=['sky','ambient','directPass','scene'].map((view,index)=>({view,index,label:['Sky','Ambient cloud','Direct illumination','Diffusion / final'][index]}));
const range=(key,min,max,step,value,help)=>({key,kind:'range',min,max,step,default:value,help});
const choice=(key,values,value,help)=>({key,kind:'select',display:'radio',options:values.map(v=>[v,v]),default:value,help});
export const normalLighting={id:'normal-lighting',title:'Normal lighting',app:'cloud-simulator/normal-lighting',width:96,height:60,sun:true,frameInterval:150,
 params:[choice('cloudShape',['cluster','wisps','teardrop','image'],'cluster','Choose a fixed baked geometry and normal map.'),choice('lightingModel',['lambert','wrapped','ramp'],'lambert','Compare cosine, wrapped cosine and an artistic color ramp.'),
 range('gradientPosition',0,1,.01,.5,'Vertical center of the sunlight color transition.'),range('gradientCompression',.1,10,.1,3,'Compress the sunlight transition into a narrower band.'),range('gradientStrength',0,1,.01,1,'Mix white sunlight toward the sunset palette.'),range('wrap',0,1,.01,.4,'Wrap diffuse illumination around the apparent surface.'),range('diffusionAmount',0,1,.01,.25,'Add coverage-normalized neighboring illumination.'),range('diffusionDistance',0,8,1,3,'Spread distance in baked image pixels.'),
 {key:'view',kind:'select',randomize:false,default:'scene',options:[...nodes.map(n=>[n.id,n.label]),...passes.map(p=>[p.view,p.label])],help:'Inspect a field or accumulated rendering stage.'}],
 create({params,width=96,height=60,doc=globalThis.document}){
  let current=params,assets={},fields=null,sun={azimuth:-40,elevation:25},disposed=false;
  const load=async path=>{const img=new Image();img.src=new URL(path,import.meta.url).href;await img.decode();const canvas=doc.createElement('canvas');canvas.width=96;canvas.height=60;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,96,60).data;};
  const instance={ready:Promise.all(['cluster','wisps','teardrop','image'].map(async name=>{const [n,g]=await Promise.all([load(`normal-assets/${name}-normal.png`),load(`normal-assets/${name}-geometry.png`)]);if(!disposed)assets[name]=decodeMaps(n,g,96,60);})),
   update(next){if(Object.keys(next).some(k=>k!=='view'&&next[k]!==current[k]))fields=null;current=next;},step(){return false;},
   preview(view,layer,w=32,h=20){const asset=assets[current.cloudShape];if(!asset)return new Uint8ClampedArray(w*h*4);fields??=shadeCloud(asset,{...current,model:current.lightingModel,...sun});const pixels=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=Math.floor(y*60/h)*96+Math.floor(x*96/w),a=asset.coverage[i];for(let c=0;c<3;c++){
     let v;if(view==='normals')v=a*(asset.normals[i*3+c]+1)/2;else if(view==='coverage')v=a;else if(view==='depth')v=a*(asset.depth[i]+32)/64;else if(view==='thickness')v=asset.thickness[i]/64;else if(view==='sky')v=[.07,.035,.13][c];else if(view==='ambient')v=[.07,.035,.13][c]*(1-a)+a*[.09,.035,.17][c];else if(view==='directPass')v=fields.scene[i*3+c]-a*fields.diffusion[i*3+c];else {const f=fields[view]??fields.scene;v=f.length===96*60?f[i]:f[i*3+c];}
     const dataView=['coverage','normals','depth','thickness','facing','visibility'].includes(view);pixels[(y*w+x)*4+c]=255*clamp(dataView?v:v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055);
    }pixels[(y*w+x)*4+3]=255;}if(['sky','ambient','directPass','scene'].includes(view))drawSunMarker(pixels,w,h,sun);return pixels;},
   render(frame){if(!assets[current.cloudShape])return null;if(frame?.sun&&(frame.sun.azimuth!==sun.azimuth||frame.sun.elevation!==sun.elevation)){sun=frame.sun;fields=null;}const pixels=this.preview(current.view,null,width,height);this.onImage?.();return pixels;},dispose(){disposed=true;assets={};fields=null;}};return instance;
 }
};
