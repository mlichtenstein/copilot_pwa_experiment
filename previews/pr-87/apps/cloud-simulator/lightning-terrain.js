/* Purpose: Fixed pixel-art terrain props and contact-light shadow geometry.
 * Consumers: lightning-model.js and model tests. Dependencies: supplied terrain profile; no DOM or hidden randomness. */
export const groundLightRadius=.30;
export function createTerrainObjects(seed,depth,groundAt){
  let rng=(seed^0x92d68ca2)>>>0;
  const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const scale=[.65,.82,1][depth];
  return Array.from({length:17},(_,i)=>{
    const x=.025+i*.059+(random()-.5)*.025,kind=random()<.65?"tree":"rock";
    return {kind,x,y:Math.min(.985,groundAt(x,depth)+.015+random()*.055),height:(kind==="tree"?.038+random()*.035:.012+random()*.015)*scale,radius:(kind==="tree"?.005+random()*.004:.009+random()*.006)*scale};
  });
}
export function terrainShadowAt(objects,source,x,y){
  // Ground is a projected plane. A low point light at the contact makes tall props cast long wedges.
  const dx=(x-source.x)*1.6,dy=y-source.y,length2=dx*dx+dy*dy;
  if(length2<1e-10)return 1;
  for(const prop of objects){
    const ox=(prop.x-source.x)*1.6,oy=prop.y-source.y;
    const t=(ox*dx+oy*dy)/length2;
    if(t<=0||t>=1)continue;
    const cross2=(ox-t*dx)**2+(oy-t*dy)**2;
    if(cross2<=prop.radius**2 && prop.height>=.025*(1-t))return .06;
  }
  return 1;
}
export function drawTerrainObjects(pixels,width,height,objects){
  // Draw back-to-front within a depth so lower props cover higher ones.
  for(const prop of [...objects].sort((a,b)=>a.y-b.y)){
    const foot=prop.y*height,top=foot-prop.height*height,cx=prop.x*width;
    const halfWidth=prop.kind==="tree"?prop.height*height*.40:prop.radius*height*1.45;
    for(let y=Math.max(0,Math.floor(top));y<=Math.min(height-1,Math.floor(foot));y++)for(let x=Math.max(0,Math.floor(cx-halfWidth));x<=Math.min(width-1,Math.ceil(cx+halfWidth));x++){
      const v=(y-top)/(foot-top),dx=Math.abs(x-cx);
      const inside=prop.kind==="tree"?(v>.7?dx<.65:dx<=halfWidth*(.18+v)):(dx/halfWidth)**2+((v-1)/1.05)**2<=1;
      if(inside)pixels.set(prop.kind==="tree"?[3,7,10,255]:[5,9,13,255],(y*width+x)*4);
    }
  }
}
