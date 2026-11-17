/* Purpose: Linked side elevation of the renderer's solids, camera and distant source.
 * Consumers: normal-lighting.js. Dependencies: cloud-geometry, canvas, shared hold help. */
import {lightDirection,cameraRay,rayCloud,along,pickCloud,localToWorld,sideSilhouettes,sideCloudAt,sideLightMarker,SIDE} from './cloud-geometry.js';
export function mountCloudSideView({doc,root,canvas:front,instance,help,render}){
 const make=(tag,props={})=>Object.assign(doc.createElement(tag),props);
 const heading=make('summary',{textContent:'Side view · world geometry'}),canvas=make('canvas',{width:720,height:390});
 canvas.setAttribute('aria-label','Side elevation of cloud solids, camera rays, surface normal and a labelled distant sun or moon.');canvas.setAttribute('role','img');
 const controls=make('div',{className:'geometry-selection'}),label=make('span',{textContent:'selectedCloud'}),buttons=[];
 controls.append(label);
 for(const id of ['near','middle','far']){
  const button=make('button',{type:'button',textContent:id});button.addEventListener('click',()=>{selected=id;sample=null;update();render?.();});
  help?.attach(button,`Highlight the ${id} cloud in both views.`,button);buttons.push(button);controls.append(button);
 }
 const note=make('p',{className:'geometry-note',textContent:'X collapsed. White: viewing ray. Green: surface normal. Sun/Moon marks direction at infinity. Tap a cloud in either view.'});
 root.append(heading,canvas,controls,note);
 let selected='near',sample=null,scene=null,lastScene=null,silhouettes=[];
 const plot={x:42,y:30,width:624,height:312}; // Equal 12-pixel/world-unit axes.
 const map=p=>[plot.x+(p[2]-SIDE.minZ)*12,plot.y+(SIDE.maxY-p[1])*12];
 const line=(ctx,a,b,color,width=1)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...map(a));ctx.lineTo(...map(b));ctx.stroke();};
 function arrow(ctx,p,d,length,color){const q=along(p,d,length);line(ctx,p,q,color,2);const a=map(p),b=map(q),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...b);ctx.lineTo(b[0]-7*Math.cos(angle-.45),b[1]-7*Math.sin(angle-.45));ctx.lineTo(b[0]-7*Math.cos(angle+.45),b[1]-7*Math.sin(angle+.45));ctx.fill();}
 function update(){
  const data=instance.geometry?.();scene=data?.scene;const sun=data?.sun;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#111c30';ctx.fillRect(0,0,720,390);
  if(!scene)return;
  if(lastScene!==scene){
   lastScene=scene;const masks=sideSilhouettes(scene);
   silhouettes=masks.map((mask,k)=>{const off=make('canvas',{width:SIDE.width,height:SIDE.height}),context=off.getContext('2d'),image=context.createImageData(SIDE.width,SIDE.height),color=scene.clouds[k].color.match(/\w\w/g).map(hex=>parseInt(hex,16));
    for(let i=0;i<mask.length;i++)if(mask[i])image.data.set([...color,200],i*4);context.putImageData(image,0,0);return off;});
  }
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===selected)));
  ctx.font='14px sans-serif';ctx.fillStyle='#9eafc9';
  for(let z=0;z<=40;z+=10){line(ctx,[0,-4,z],[0,22,z],'#29394e');ctx.fillText(`${z}`,map([0,0,z])[0]-4,359);}
  for(let y=0;y<=20;y+=4){line(ctx,[0,y,-3],[0,y,49],'#29394e');ctx.fillText(`${y}`,12,map([0,y,0])[1]+4);}
  ctx.fillText('altitude',8,17);ctx.fillText('distance → (world units)',475,380);line(ctx,[0,0,-3],[0,0,49],'#698470');
  ctx.save();ctx.beginPath();ctx.rect(plot.x,plot.y,plot.width,plot.height);ctx.clip();
  ctx.setLineDash([5,5]);for(const v of [0,1])line(ctx,scene.camera.position,along(scene.camera.position,cameraRay(.5,v),60),'#7286a5');ctx.setLineDash([]);
  scene.clouds.forEach((cloud,k)=>{ctx.globalAlpha=cloud.id===selected?1:.5;ctx.drawImage(silhouettes[k],plot.x,plot.y,plot.width,plot.height);});ctx.globalAlpha=1;
  const cloud=scene.clouds.find(c=>c.id===selected),anchor=localToWorld(cloud,cloud.shape?.anchor??[0,0,0]),direction=sample??anchor.map((v,i)=>v-scene.camera.position[i]);
  const len=Math.hypot(...direction),ray=direction.map(v=>v/len),hit=rayCloud(cloud,scene.camera.position,ray)[0];
  if(hit){const p=along(scene.camera.position,ray,hit.start);line(ctx,scene.camera.position,p,'#e5f6ff',2);arrow(ctx,p,hit.normal,2,'#65f0bd');}
  const l=lightDirection(sun),incoming=l.map(v=>-v);
  for(const z of [14,26,38])arrow(ctx,[0,19,z],incoming,5,'#ffdc83');ctx.restore();
  for(const cloud of scene.clouds){const [x,y]=map(cloud.center);ctx.fillStyle=cloud.color;ctx.fillText(`${cloud.id} · ${cloud.shapeName}`,Math.min(550,Math.max(60,x-30)),Math.max(52,y-cloud.radii[1]*12-12));}
  const camera=map(scene.camera.position);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(...camera,4,0,Math.PI*2);ctx.fill();ctx.fillText('camera',camera[0]+8,camera[1]-6);
  const marker=sideLightMarker(sun),moon=data.source==='moon',color=moon?'#d7e6ff':'#ffdc83';
  ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(marker.x,marker.y,10,0,Math.PI*2);ctx.fill();
  if(!moon)for(let a=0;a<Math.PI*2;a+=Math.PI/4){ctx.beginPath();ctx.moveTo(marker.x+14*Math.cos(a),marker.y+14*Math.sin(a));ctx.lineTo(marker.x+19*Math.cos(a),marker.y+19*Math.sin(a));ctx.stroke();}
  ctx.font='bold 16px sans-serif';const labelX=Math.min(565,Math.max(45,marker.x-45)),labelY=marker.y<195?marker.y+35:marker.y-27;
  ctx.fillText(`${moon?'Moon':'Sun'} · ∞`,labelX,labelY);
  if(marker.outOfPlane){ctx.font='13px sans-serif';ctx.fillText(`out of plane (${marker.towardX?'+':'−'}X)`,labelX,marker.y+51);}
  ctx.font='14px sans-serif';ctx.fillStyle=color;ctx.fillText(`elevation ${sun.elevation.toFixed(1)}° · azimuth ${sun.azimuth.toFixed(1)}°`,170,17);
  canvas.setAttribute('aria-label',`Side elevation. ${moon?'Moon':'Sun'} at infinity: elevation ${sun.elevation.toFixed(1)} degrees, azimuth ${sun.azimuth.toFixed(1)} degrees. Selected ${selected}: ${cloud.shapeName}.`);
  instance.highlightCloud?.(selected);
 }
 canvas.addEventListener('click',event=>{if(!scene)return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*720/r.width,y=(event.clientY-r.top)*390/r.height,u=(x-plot.x)/plot.width,v=(y-plot.y)/plot.height;if(u<0||u>1||v<0||v>1)return;const id=sideCloudAt(scene,u,v);if(id){selected=id;sample=null;update();render?.();}});
 front.addEventListener('click',event=>{if(!scene)return;const r=front.getBoundingClientRect(),u=(event.clientX-r.left)/r.width,v=(event.clientY-r.top)/r.height,id=pickCloud(scene,u,v);if(id){selected=id;sample=cameraRay(u,v);update();render?.();}});
 root.addEventListener('toggle',update);
 return {update};
}
