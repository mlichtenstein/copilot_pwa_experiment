/* Purpose: Evolve a coarse stochastic charge field and select/discharge strong potential gradients.
 * Consumers: lightning-model.js and model tests. Dependencies: none; charge is an artistic normalized potential proxy. */
export const chargeWidth=12,chargeHeight=6;
const bounded=value=>Math.max(-8,Math.min(8,value));
function random(field){field.rng=(Math.imul(field.rng,1664525)+1013904223)>>>0;return field.rng/4294967296;}
export function chargePoint(index,depth){return {x:0.06+(index%chargeWidth)*0.88/(chargeWidth-1),y:0.09+depth*0.035+Math.floor(index/chargeWidth)*0.055};}
export function createCharge(seed){
  const field={rng:seed>>>0,values:[],drift:[],bulkDrift:0,clock:0};
  for(let i=0;i<chargeWidth*chargeHeight;i++){field.values.push((random(field)-.5)*.25);field.drift.push((random(field)-.5)*2);}
  return field;
}
export function stepCharge(field,dt,rate,bias=0){
  // Fixed coarse ticks keep the field smooth in time and independent of render frequency.
  field.clock+=dt;
  while(field.clock+1e-10>=.1){
    field.clock-=.1;const next=[];
    field.bulkDrift=Math.max(-2,Math.min(2,field.bulkDrift*.98+(random(field)-.5)*.3));
    for(let i=0;i<field.values.length;i++){
      const x=i%chargeWidth,y=Math.floor(i/chargeWidth),q=field.values[i];let neighbors=0,count=0;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])if(x+dx>=0&&x+dx<chargeWidth&&y+dy>=0&&y+dy<chargeHeight){neighbors+=field.values[i+dx+dy*chargeWidth];count++;}
      field.drift[i]=Math.max(-2,Math.min(2,field.drift[i]*.96+(random(field)-.5)*.48));
      next.push(bounded(q+.1*rate*(bias+(.7*field.bulkDrift+.3*field.drift[i])-.025*q+.12*(neighbors/count-q))));
    }
    field.values=next;
  }
}
export function strongestGradient(field,depth,groundAt){
  let best={gradient:0};
  for(let i=0;i<field.values.length;i++){
    const from=chargePoint(i,depth),q=field.values[i];
    const ground={x:from.x,y:groundAt(from.x,depth)},gradient=Math.abs(q)/(ground.y-from.y);
    if(gradient>best.gradient)best={from:i,to:-1,target:ground,kind:"ground",gradient};
    for(let j=i+1;j<field.values.length;j++){
      if(q*field.values[j]>=0)continue;
      const target=chargePoint(j,depth),distance=Math.hypot((target.x-from.x)*1.6,target.y-from.y);
      // Compare regional gradients rather than one-cell sparks; both ends are cloud charge regions.
      if(distance<.20||distance>.65)continue;
      const gradient=Math.abs(q-field.values[j])/distance;
      if(gradient>best.gradient)best={from:i,to:j,target,kind:"cloud",gradient};
    }
  }
  return best;
}
export function discharge(field,depth,nodes){
  field.bulkDrift*=.55;
  for(let i=0;i<field.values.length;i++){
    const p=chargePoint(i,depth);let distance=Infinity;
    for(const n of nodes)distance=Math.min(distance,Math.hypot((p.x-n.x)*1.6,p.y-n.y));
    const amount=.45+.50*Math.max(0,1-distance/.25);
    field.values[i]*=1-amount;field.drift[i]*=1-amount;
  }
}
