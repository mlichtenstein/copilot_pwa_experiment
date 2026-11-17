/* Purpose: Inspect the same ellipsoids, camera rays and light vectors as the scene.
 * Consumers: normal-lighting.js. Dependencies: cloud-geometry.js, canvas, shared hold help. */
import {lightDirection,cameraRay,intersectEllipsoid,along,surfaceNormal,pickCloud} from './cloud-geometry.js';
export function mountCloudSideView({doc,root,canvas:front,instance,help,render}){
 const make=(tag,props={})=>Object.assign(doc.createElement(tag),props);
 const heading=make('summary',{textContent:'Side view · world geometry'}),canvas=make('canvas',{width:720,height:330});
 canvas.setAttribute('aria-label','Side elevation: distance right, altitude up. Camera, cloud bodies, view rays, surface normals and incoming parallel sunlight.');
 canvas.setAttribute('role','img');
 const controls=make('div',{className:'geometry-selection'}),label=make('span',{textContent:'selectedCloud'}),buttons=[];
 controls.append(label);
 for(const id of ['near','middle','far']){
  const button=make('button',{type:'button',textContent:id});button.addEventListener('click',()=>{selected=id;sample=null;update();render?.();});
  help?.attach(button,`Highlight the ${id} cloud in both views.`,button);buttons.push(button);controls.append(button);
 }
 const note=make('p',{className:'geometry-note',textContent:'Side elevation (X collapsed). Dashed rays bound the camera view; gold arrows show incoming sunlight. Tap a cloud in either view.'});
 root.append(heading,canvas,controls,note);
 let selected='near',sample=null,scene=null,sun=null;
 const map=p=>[42+p[2]*15,310-p[1]*15]; // Same scale on distance and altitude axes.
 const line=(ctx,a,b,color,width=1)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...map(a));ctx.lineTo(...map(b));ctx.stroke();};
 function arrow(ctx,p,d,length,color){const q=along(p,d,length);line(ctx,p,q,color,2);const a=map(p),b=map(q),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...b);ctx.lineTo(b[0]-7*Math.cos(angle-.45),b[1]-7*Math.sin(angle-.45));ctx.lineTo(b[0]-7*Math.cos(angle+.45),b[1]-7*Math.sin(angle+.45));ctx.fill();}
 function update(){
  const data=instance.geometry?.();scene=data?.scene;sun=data?.sun;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#111c30';ctx.fillRect(0,0,720,330);
  buttons.forEach(b=>{b.disabled=!scene;b.setAttribute('aria-pressed',String(b.textContent===selected));});
  if(!scene){ctx.fillStyle='#d6e1f3';ctx.font='16px sans-serif';ctx.fillText('Choose cloudShape: layers for world geometry.',24,95);return;}
  ctx.font='12px sans-serif';ctx.fillStyle='#9eafc9';
  for(let z=0;z<=40;z+=10){line(ctx,[0,0,z],[0,20,z],'#29394e');ctx.fillText(`${z}`,map([0,0,z])[0]-4,325);}
  for(let y=0;y<=20;y+=4){line(ctx,[0,y,0],[0,y,43],'#29394e');ctx.fillText(`${y}`,10,map([0,y,0])[1]+4);}
  ctx.fillText('altitude',8,12);ctx.fillText('distance → (world units)',535,325);
  line(ctx,[0,0,0],[0,0,43],'#698470');
  ctx.setLineDash([5,5]);for(const v of [0,1])line(ctx,scene.camera.position,along(scene.camera.position,cameraRay(.5,v),45),'#7286a5');ctx.setLineDash([]);
  for(const cloud of scene.clouds){
   const [x,y]=map(cloud.center);ctx.beginPath();ctx.ellipse(x,y,cloud.radii[2]*15,cloud.radii[1]*15,0,0,Math.PI*2);ctx.fillStyle=cloud.color+'33';ctx.fill();ctx.strokeStyle=cloud.color;ctx.lineWidth=cloud.id===selected?3:1;ctx.stroke();ctx.fillStyle=cloud.color;ctx.fillText(cloud.id,x-20,y-cloud.radii[1]*15-8);
  }
  const cloud=scene.clouds.find(c=>c.id===selected),direction=sample??cloud.center.map((v,i)=>v-scene.camera.position[i]);
  const len=Math.hypot(...direction),ray=direction.map(v=>v/len),hit=intersectEllipsoid(scene.camera.position,ray,cloud);
  if(hit){const p=along(scene.camera.position,ray,hit[0]),n=surfaceNormal(p,cloud);line(ctx,scene.camera.position,p,'#e5f6ff',2);arrow(ctx,p,n,2,'#65f0bd');}
  const l=lightDirection(sun),incoming=l.map(v=>-v);
  for(const z of [12,23,34])arrow(ctx,[0,19,z],incoming,5,'#ffdc83');
  ctx.fillStyle='#ffdc83';ctx.fillText(`Incoming ${data.source} · elevation ${sun.elevation.toFixed(1)}° · azimuth ${sun.azimuth.toFixed(1)}°`,230,17);
  ctx.fillStyle='#65f0bd';ctx.fillText('surface normal',550,38);
  const camera=map(scene.camera.position);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(...camera,4,0,Math.PI*2);ctx.fill();ctx.fillText('camera',camera[0]+8,camera[1]-5);
  instance.highlightCloud?.(selected);
 }
 canvas.addEventListener('click',event=>{if(!scene)return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*720/r.width,y=(event.clientY-r.top)*330/r.height;const found=scene.clouds.find(c=>{const p=map(c.center);return ((x-p[0])/(c.radii[2]*15))**2+((y-p[1])/(c.radii[1]*15))**2<=1;});if(found){selected=found.id;sample=null;update();render?.();}});
 front.addEventListener('click',event=>{if(!scene)return;const r=front.getBoundingClientRect(),u=(event.clientX-r.left)/r.width,v=(event.clientY-r.top)/r.height,id=pickCloud(scene,u,v);if(id){selected=id;sample=cameraRay(u,v);update();render?.();}});
 root.addEventListener('toggle',update);
 return {update};
}
