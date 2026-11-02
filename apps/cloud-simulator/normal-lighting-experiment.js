/* Purpose: Load baked maps and expose a controlled lighting workbench.
 * Consumers: normal-lighting.js and registry. Dependencies: model, browser Image/canvas, shared host. */
import {decodeMaps,shadeCloud,clamp,gradientColor} from './normal-lighting-model.js';
// A direction marker uses the same azimuth/elevation as the lighting vector.
// Clamp off-screen directions to the border; draw it after composition for visibility.
export function drawSunMarker(pixels,width,height,sun,source="sun"){
 const sx=Math.round(clamp(.5+sun.azimuth/180)*(width-1)),sy=Math.round(clamp(.5-sun.elevation/90)*(height-1));
 const radius=Math.max(1,Math.round(width/48));
 for(let y=Math.max(0,sy-radius-1);y<=Math.min(height-1,sy+radius+1);y++)for(let x=Math.max(0,sx-radius-1);x<=Math.min(width-1,sx+radius+1);x++){
  const d=Math.hypot(x-sx,y-sy);if(d>radius+1)continue;
  const color=d<=radius?(source==="moon"?[215,230,255]:[255,240,120]):[55,28,8],i=(y*width+x)*4;
  pixels.set([...color,255],i);
 }
 return pixels;
}
export const nodes=['coverage','normals','broadNormals','colorCoordinate','depth','thickness','incoming','facing','visibility','direct','diffusion'].map(id=>({id,label:id,description:{normals:'Baked unit normals: +X right, +Y up, +Z toward viewer.',broadNormals:'Smooth baked shape normals select colors independently of fine shading.',colorCoordinate:'Height plus broad-normal color offset, clamped for display before ramp warping.',incoming:'Color selected jointly by height and broad-normal orientation, before shadows.',visibility:'Sunlight surviving the baked depth slab.'}[id]??id}));
export const passes=['sky','ambientPass','directPass','scene'].map((view,index)=>({view,index,label:['Sky','Ambient cloud','Direct illumination','Diffusion / final'][index],contribution:['sky','ambient','directAdded','diffusionAdded'][index],toggle:[null,null,'directEnabled','diffusionEnabled'][index]}));
const range=(key,min,max,step,value,help)=>({key,kind:'range',min,max,step,default:value,help});
const choice=(key,values,value,help)=>({key,kind:'select',display:'radio',options:values.map(v=>[v,v]),default:value,help});
export const normalLighting={id:'normal-lighting',title:'Normal lighting',app:'cloud-simulator/normal-lighting',width:96,height:60,sun:true,sunShape:{sunPathWidth:85,sunPathHeight:58,sunPathX:15,sunPathY:2},frameInterval:150,
 params:[choice('lightSource',['sun','moon'],'sun','Choose the sole light source; time controls its position, never switches sources.'),choice('gradientKind',['auto','sunset','spectrum','bicolor','moon'],'auto','Choose a color ramp; auto uses sunset for Sun and silver-blue for Moon.'),
 range('gradientStart',0,1,.01,0,'Start of the selected color ramp.'),range('gradientEnd',0,1,.01,1,'End of the selected ramp; reverse start/end to reverse colors.'),range('gradientWarp',.2,5,.05,1,'Bunch transitions toward either end; 1 keeps their spacing uniform.'),range('nightBrightness',.05,1,.05,.45,'Moon mode illumination brightness.'),range('nightSaturation',0,1,.05,.45,'Moon mode color saturation; zero is grayscale.'),
 {key:'directEnabled',kind:'toggle',default:true,help:'Include direct light in accumulated images.'},{key:'diffusionEnabled',kind:'toggle',default:true,help:'Include scattered fill in accumulated images.'},
 choice('cloudShape',['cluster','wisps','teardrop','image'],'cluster','Choose a fixed baked geometry and normal map.'),{...choice('lightingModel',['lambert','wrapped','ramp'],'lambert','Hold each mode for an explanation of its visible effect.'),optionHelp:{lambert:'Faces aimed at the light are brightest. Illumination falls to zero as a surface turns away.',wrapped:'Light reaches farther around curved surfaces, softening the transition into shadow.',ramp:'Height and broad shape select the color; only geometric shadows darken it, leaving fine facing shading out.'}},
 range('heightInfluence',0,2,.05,1,'How strongly vertical position selects color; zero removes the height variation.'),range('broadNormalInfluence',-1,1,.05,.35,'How strongly broad shape orientation toward the light shifts the ramp sample; zero restores height-only colors.'),range('detailShadingStrength',0,1,.05,1,'Fine-normal brightness shading; zero leaves only the existing geometric shadows.'),
 range('gradientPosition',0,1,.01,.5,'Vertical center of the sunlight color transition.'),range('gradientCompression',.1,10,.1,3,'Compress the sunlight transition into a narrower band.'),range('gradientStrength',0,1,.01,1,'Mix white sunlight toward the sunset palette.'),range('wrap',0,1,.01,.4,'Wrap diffuse illumination around the apparent surface.'),range('diffusionAmount',0,1,.01,.25,'Add coverage-normalized neighboring illumination.'),range('diffusionDistance',0,8,1,3,'Spread distance in baked image pixels.'),
 {key:'view',kind:'select',hidden:true,randomize:false,default:'scene',options:[...nodes.map(n=>[n.id,n.label]),...passes.map(p=>[p.view,p.label]),...['ambient','directAdded','diffusionAdded'].map(v=>[v,v])],help:'Inspect a field or accumulated rendering stage.'}],
 decorate({doc,controlFor}){
  const strip=doc.createElement('div');strip.setAttribute('role','img');strip.setAttribute('aria-label','Adjusted illumination ramp, bottom to top');controlFor('gradientKind')?.append(strip);
  return params=>{const stops=Array.from({length:33},(_,i)=>{const color=gradientColor(i/32,params).map(v=>Math.round(255*clamp(1.055*Math.pow(v,1/2.4)-.055)));return `rgb(${color.join(',')}) ${i/32*100}%`;});strip.setAttribute('style',`height:20px;width:100%;background:linear-gradient(to right,${stops.join(',')})`);};
 },
 create({params,width=96,height=60,doc=globalThis.document}){
  let current=params,assets={},fields=null,sun={azimuth:-40,elevation:25},disposed=false;
  const load=async path=>{const img=new Image();img.src=new URL(path,import.meta.url).href;await img.decode();const canvas=doc.createElement('canvas');canvas.width=96;canvas.height=60;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,96,60).data;};
  const instance={ready:Promise.all(['cluster','wisps','teardrop','image'].map(async name=>{const [n,g,b]=await Promise.all([load(`normal-assets/${name}-normal.png`),load(`normal-assets/${name}-geometry.png`),load(`normal-assets/${name}-broad-normal.png`)]);if(!disposed)assets[name]=decodeMaps(n,g,96,60,b);})),
   update(next){if(Object.keys(next).some(k=>k!=='view'&&next[k]!==current[k]))fields=null;current=next;},step(){return false;},
   preview(view,layer,w=32,h=20){const asset=assets[current.cloudShape];if(!asset)return new Uint8ClampedArray(w*h*4);fields??=shadeCloud(asset,{...current,model:current.lightingModel,...sun});const pixels=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=Math.floor(y*60/h)*96+Math.floor(x*96/w),a=asset.coverage[i];for(let c=0;c<3;c++){
     let v;if(view==='normals'||view==='broadNormals')v=a*(asset[view][i*3+c]+1)/2;else if(view==='coverage')v=a;else if(view==='depth')v=a*(asset.depth[i]+32)/64;else if(view==='thickness')v=asset.thickness[i]/64;else {const f=fields[view]??fields.scene;v=f.length===96*60?f[i]:f[i*3+c];}
     const dataView=['coverage','normals','broadNormals','colorCoordinate','depth','thickness','facing','visibility'].includes(view);pixels[(y*w+x)*4+c]=255*clamp(dataView?v:v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055);
    }pixels[(y*w+x)*4+3]=255;}if(['sky','ambientPass','directPass','scene'].includes(view))drawSunMarker(pixels,w,h,sun,current.lightSource);return pixels;},
   render(frame){if(!assets[current.cloudShape])return null;if(frame?.sun&&(frame.sun.azimuth!==sun.azimuth||frame.sun.elevation!==sun.elevation)){sun=frame.sun;fields=null;}const pixels=this.preview(current.view,null,width,height);this.onImage?.();return pixels;},dispose(){disposed=true;assets={};fields=null;}};return instance;
 }
};
