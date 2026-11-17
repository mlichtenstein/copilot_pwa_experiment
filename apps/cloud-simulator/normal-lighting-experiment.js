/* Purpose: Compare independently placed cloud solids in a lighting workbench.
 * Consumers: normal-lighting.js and registry. Dependencies: cloud-geometry, cloud-shapes, palette helpers, browser Image/canvas, shared host. */
import {ANALYTIC_SHAPES,SHAPE_NAMES,imageReliefShape} from './cloud-shapes.js';
import {createCloudScene,renderCloudScene} from './cloud-geometry.js';
import {clamp,gradientColor} from './normal-lighting-model.js';
export const nodes=['transmission','coverage','normals','broadNormals','colorCoordinate','depth','thickness','incoming','facing','visibility','direct','diffusion'].map(id=>({id,label:id,description:{transmission:'Single-scattered light surviving the paths from the source and to the camera for each selected shape.',normals:'Unit world normals: +X right, +Y up, +Z away from camera.',broadNormals:'Smooth shape normals select colors independently of fine shading.',colorCoordinate:'Solar-frame position plus broad-normal color offset, clamped for display before ramp warping.',incoming:'Color selected jointly by height and broad-normal orientation, before shadows.',visibility:'Sunlight surviving the same cloud solids shown in both views.'}[id]??id}));
export const passes=['sky','ambientPass','directPass','scene'].map((view,index)=>({view,index,label:['Sky','Ambient cloud','Direct illumination','Transmission / final'][index],contribution:['sky','ambient','directAdded','diffusionAdded'][index],toggle:[null,null,'directEnabled','diffusionEnabled'][index]}));
const range=(key,min,max,step,value,help)=>({key,kind:'range',min,max,step,default:value,help});
const choice=(key,values,value,help)=>({key,kind:'select',display:'radio',options:values.map(v=>[v,v]),default:value,help});
export function migrateLayerShapes(given){
 if(!given||typeof given!=='object')return given;
 const next={...given};if(given.cloudShape){const shape=given.cloudShape==='layers'?'ellipsoid':given.cloudShape;for(const layer of ['near','middle','far'])next[`${layer}Shape`]??=SHAPE_NAMES.includes(shape)?shape:'ellipsoid';}
 delete next.cloudShape;return next;
}
export const normalLighting={id:'normal-lighting',title:'Normal lighting',app:'cloud-simulator/normal-lighting',width:160,height:100,migrate:migrateLayerShapes,sun:true,sunShape:{sunPathWidth:60,sunPathHeight:50,sunPathX:-15,sunPathY:5},frameInterval:150,
 params:[choice('lightSource',['sun','moon'],'sun','Choose the sole light source; time controls its position, never switches sources.'),...['near','middle','far'].flatMap((layer,i)=>[{...choice(`${layer}Shape`,SHAPE_NAMES,['cluster','wisps','teardrop'][i],`Choose the ${layer} layer's solid shape; both views and sunlight use this geometry.`),display:undefined}, {...range(`${layer}Yaw`,-90,90,5,0,`Rotate the ${layer} body about the vertical axis without moving its layer.`),drift:false}]),
 choice('gradientKind',['auto','sunset','spectrum','bicolor','moon'],'auto','Choose a color ramp; auto uses sunset for Sun and silver-blue for Moon.'),
 range('gradientStart',0,1,.01,0,'Start of the selected color ramp.'),range('gradientEnd',0,1,.01,1,'End of the selected ramp; reverse start/end to reverse colors.'),range('gradientWarp',.2,5,.05,1,'Bunch transitions toward either end; 1 keeps their spacing uniform.'),range('nightBrightness',.05,1,.05,.45,'Moon mode illumination brightness.'),range('nightSaturation',0,1,.05,.45,'Moon mode color saturation; zero is grayscale.'),
 {key:'directEnabled',kind:'toggle',default:true,help:'Include direct light in accumulated images.'},{key:'diffusionEnabled',kind:'toggle',default:true,help:'Include scattered fill in accumulated images.'},

 range('cloudThickness',.3,2,.05,1,'Vertical radius multiplier for the three world cloud bodies.'),range('layerSpacing',.7,1.2,.05,1,'Distance multiplier for world cloud layers.'),range('cloudDensity',.1,2,.05,.7,'Extinction per world unit; controls cloud opacity and light penetration.'),range('transmissionStrength',0,4,.05,1.8,'Strength of light scattered through the cloud volume.'),{...choice('lightingModel',['lambert','wrapped','ramp'],'lambert','Hold each mode for an explanation of its visible effect.'),optionHelp:{lambert:'Faces aimed at the light are brightest. Illumination falls to zero as a surface turns away.',wrapped:'Light reaches farther around curved surfaces, softening the transition into shadow.',ramp:'Solar-frame position and broad shape select the color; only geometric shadows darken it, leaving fine facing shading out.'}},
 range('heightInfluence',0,2,.05,1,'How strongly position in the rotating solar frame selects color; zero removes spatial variation.'),range('broadNormalInfluence',-1,1,.05,.35,'How strongly broad shape orientation toward the light shifts the ramp sample; zero restores spatial-field-only colors.'),range('detailShadingStrength',0,1,.05,1,'Fine-normal brightness shading; zero leaves only the existing geometric shadows.'),
 range('gradientPosition',0,1,.01,.5,'Center of the color transition in the rotating solar frame.'),range('gradientCompression',.1,10,.1,3,'Compress the sunlight transition into a narrower band.'),range('gradientStrength',0,1,.01,1,'Mix white sunlight toward the sunset palette.'),range('wrap',0,1,.01,.4,'Wrap diffuse illumination around the apparent surface.'),
 {key:'view',kind:'select',hidden:true,randomize:false,default:'scene',options:[...nodes.map(n=>[n.id,n.label]),...passes.map(p=>[p.view,p.label]),...['ambient','directAdded','diffusionAdded'].map(v=>[v,v])],help:'Inspect a field or accumulated rendering stage.'}],
 decorate({doc,controlFor}){
  const strip=doc.createElement('div');strip.setAttribute('role','img');strip.setAttribute('aria-label','Adjusted illumination ramp, bottom to top');controlFor('gradientKind')?.append(strip);
  return params=>{const stops=Array.from({length:33},(_,i)=>{const color=gradientColor(i/32,params).map(v=>Math.round(255*clamp(1.055*Math.pow(v,1/2.4)-.055)));return `rgb(${color.join(',')}) ${i/32*100}%`;});strip.setAttribute('style',`height:20px;width:100%;background:linear-gradient(to right,${stops.join(',')})`);};
 },
 create({params,width=160,height=100,doc=globalThis.document}){
  let current=params,fields=null,world=null,selectedCloud='near',sun={azimuth:15,elevation:23},disposed=false;
  const shapes={...ANALYTIC_SHAPES};
  const geometryKeys=['cloudThickness','layerSpacing',...['near','middle','far'].flatMap(id=>[`${id}Shape`,`${id}Yaw`])];
  const scene=()=>world??=createCloudScene(current,shapes);
  const loadImage=async()=>{
   const img=new Image();img.src=new URL('normal-assets/image-geometry.png',import.meta.url).href;await img.decode();
   const canvas=doc.createElement('canvas');canvas.width=96;canvas.height=60;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const data=ctx.getImageData(0,0,96,60).data,asset={width:96,height:60,depth:[],thickness:[],coverage:[]};
   for(let i=0;i<96*60;i++){asset.depth.push(data[4*i]*64/255-32);asset.thickness.push(data[4*i+1]*64/255);asset.coverage.push(data[4*i+3]/255);}
   if(!disposed){shapes.image=imageReliefShape(asset);world=null;fields=null;}
  };
  const instance={
   ready:loadImage(),
   geometry(){return {scene:scene(),sun,params:current,source:current.lightSource};},
   highlightCloud(id){selectedCloud=id;},
   update(next){if(geometryKeys.some(k=>next[k]!==current[k]))world=null;if(Object.keys(next).some(k=>k!=='view'&&next[k]!==current[k]))fields=null;current=next;},
   step(){return false;},
   preview(view,layer,w=32,h=20){
    fields??=renderCloudScene(scene(),current,sun,width,height);
    const pixels=new Uint8ClampedArray(w*h*4),data=['coverage','normals','broadNormals','colorCoordinate','depth','thickness','facing','visibility','transmission'].includes(view);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const i=Math.floor(y*height/h)*width+Math.floor(x*width/w),f=fields[view]??fields.scene;
     for(let c=0;c<3;c++){let v=f.length===width*height?f[i]:f[i*3+c];
      if(view==='normals'||view==='broadNormals')v=fields.coverage[i]?(v+1)/2:0;
      if(view==='depth')v/=50;if(view==='thickness')v/=10;
      pixels[(y*w+x)*4+c]=255*clamp(data?v:v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055);
     }pixels[(y*w+x)*4+3]=255;
    }
    if(view==='scene'&&w===width&&selectedCloud){
     const selected=scene().clouds.findIndex(c=>c.id===selectedCloud),ids=fields.layerIndex;
     for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(ids[i]===selected&&[i-1,i+1,i-w,i+w].some(j=>ids[j]!==selected))pixels.set([175,215,235,255],i*4);}
    }
    return pixels;
   },
   render(frame){if(frame?.sun&&(frame.sun.azimuth!==sun.azimuth||frame.sun.elevation!==sun.elevation)){sun=frame.sun;fields=null;}const pixels=this.preview(current.view,null,width,height);this.onImage?.();return pixels;},
   dispose(){disposed=true;fields=null;world=null;}
  };return instance;
 }
};
