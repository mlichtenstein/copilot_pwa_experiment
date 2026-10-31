/* Purpose: Three charge-driven storm layers, branching discharge dynamics and read-only pixel rendering.
 * Consumers: lightning.js, model tests, and the generic experiment host. Dependencies: valley-noise.js and charge-field.js. */
import { perlin3 } from "./valley-noise.js";
import {createCharge,stepCharge,strongestGradient,chargePoint,discharge} from "./charge-field.js";
const width = 160, height = 100, clamp = v => Math.max(0, Math.min(1, v));
export const parameters = [
  { key:"fieldBias", default:2, min:0.2, max:4, step:0.1, description:"Strength of attraction along the selected charge gradient toward its cloud or ground endpoint." },
  { key:"roughness", default:1.4, min:0, max:3, step:0.1, description:"Strength of seeded field variation and random direction choice; larger values make the path wander." },
  { key:"branchChance", default:0.25, min:0, max:0.6, step:0.05, description:"Probability of a short side branch at each main-channel growth step." },
  { key:"leaderSpeed", default:70, min:10, max:150, step:5, description:"Main-channel growth steps per simulated second." },
  { key:"flashDuration", default:0.6, min:0.2, max:1.5, step:0.1, description:"Seconds over which the connected channel and its surrounding illumination fade." },
  { key:"flashStrength", default:0.65, min:0, max:1, step:0.05, description:"Brightness of the connected channel and its illumination of clouds, air and struck terrain." },
  { key:"haze", default:0.55, min:0, max:1, step:0.05, description:"How strongly air and cloud droplets reveal light around the channel." },
  { key:"chargeRate", default:1, min:0, max:3, step:0.1, description:"Rate of stochastic charge buildup, relaxation and diffusion in each layer; zero freezes quiet fields." },
  { key:"chargeBias", default:0.2, min:-1, max:1, step:0.05, description:"Mean signed charge added to stochastic buildup; zero is unbiased. Either polarity favors a difference from neutral ground. Multiplied by chargeRate." },
  { key:"breakdownGradient", default:4, min:1, max:10, step:0.25, description:"Potential difference per scene distance required to initiate a cloud-to-cloud or cloud-to-ground channel." }
];
export function groundAt(x, depth = 2) { return [0.66,0.79,0.91][depth]+0.035*Math.sin(x*9+1+depth*1.7)+0.016*Math.sin(x*23+depth); }
const terrainAt = (state,x) => groundAt(x,state.depth);
function random(state) { state.rng = (Math.imul(state.rng,1664525)+1013904223)>>>0; return state.rng/4294967296; }
export function beginStrike(state) {
  const origin=chargePoint(state.strike.from,state.depth);
  state.nodes = [{...origin,parent:-1,branch:false}];
  state.head=0;state.returnPath=[];state.phase="leader";state.age=0;state.growth=0;state.strikes++;
}
function extend(state, parent, params, branch = false, direction = 0) {
  const from = state.nodes[parent], length = branch ? 0.025 : 0.018;
  const targetAngle=Math.atan2(state.strike.target.x-from.x,state.strike.target.y-from.y);
  let best, score = -Infinity;
  for (let i=0;i<7;i++) {
    const angle = branch ? targetAngle+direction + (i-3)*0.12 : targetAngle+(i-3)*0.36;
    const dx=Math.sin(angle)*length,dy=Math.cos(angle)*length;
    const field=perlin3((from.x+dx)*14,(from.y+dy)*14,state.seed%997,91);
    const candidate=params.fieldBias*Math.cos(angle-targetAngle)+params.roughness*(field+random(state)*0.7);
    if(candidate>score){score=candidate;best={x:Math.max(0.02,Math.min(0.98,from.x+dx)),y:Math.min(terrainAt(state,Math.max(0.02,Math.min(0.98,from.x+dx))),from.y+dy),parent,branch};}
  }
  state.nodes.push(best); return state.nodes.length-1;
}
function grow(state, params) {
  state.head=extend(state,state.head,params);
  if (state.nodes.length<700 && random(state)<params.branchChance) {
    let parent=state.head; const direction=(random(state)<0.5?-1:1)*(0.65+random(state)*0.65), count=2+Math.floor(random(state)*7);
    for(let i=0;i<count;i++) parent=extend(state,parent,params,true,direction);
  }
  const head=state.nodes[state.head],target=state.strike.target;
  if(Math.hypot(head.x-target.x,head.y-target.y)<.025 || head.y>=terrainAt(state,head.x)) {
    // A cloud target may wander into terrain first; record the actual connection type.
    if(head.y>=terrainAt(state,head.x))state.strike.kind="ground";
    else {state.nodes.push({...target,parent:state.head,branch:false});state.head=state.nodes.length-1;}
    for(let i=state.head;i>=0;i=state.nodes[i].parent)state.returnPath.push(i);
    discharge(state.charge,state.depth,state.returnPath.map(i=>state.nodes[i]));
    state.phase="flash";state.age=0;
  } else if(state.nodes.length>=760) {
    // A failed channel dissipates instead of teleporting to a target or faking contact.
    state.phase="quiet";state.age=0;
  }
}

function createLayer({seed,depth}) {
  const state={depth,seed:seed>>>0,rng:seed>>>0,time:0,age:0,phase:"quiet",charge:createCharge(seed^0xa341316c),strike:null,nodes:[],returnPath:[],head:0,growth:0,strikes:0,clouds:[]};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) state.clouds.push(clamp((perlin3(x/width*5,y/height*9,seed%997,13)-0.25)*2)*Math.exp(-(((y/height-(0.16+depth*0.06))/0.22)**4)));
  return state;
}
function stepLayer(state,dt,params) {
  state.time+=dt;
  if(state.phase==="ready")beginStrike(state);
  if(state.phase==="leader") {
    state.growth+=dt*params.leaderSpeed;
    while(state.growth>=1 && state.phase==="leader"){state.growth--;grow(state,params);}
  } else if(state.phase==="flash") {
    state.age+=dt;
    if(state.age+1e-10>=params.flashDuration){state.phase="quiet";state.age=0;}
  } else {
    stepCharge(state.charge,dt,params.chargeRate,params.chargeBias);
    const candidate=strongestGradient(state.charge,state.depth,groundAt);
    if(candidate.gradient>=params.breakdownGradient){state.strike=candidate;beginStrike(state);}
  }
}
function renderLayer(state,params,pixels) {
  const light=new Float32Array(width*height), cores=new Float32Array(width*height), path=new Set(state.returnPath);
  const power=state.phase==="flash"?params.flashStrength*Math.exp(-state.age/Math.max(0.05,params.flashDuration*0.3)):state.phase==="leader"?0.09:0;
  for(let i=1;i<state.nodes.length && power>0;i++) {
    const b=state.nodes[i],a=state.nodes[b.parent], ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height;
    const energy=power*(path.has(i)?1:b.branch?0.3:0.6), radius=3+params.haze*10;
    for(let y=Math.max(0,Math.floor(Math.min(ay,by)-radius));y<=Math.min(height-1,Math.ceil(Math.max(ay,by)+radius));y++)for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius));x<=Math.min(width-1,Math.ceil(Math.max(ax,bx)+radius));x++) {
      const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1));
      const d2=(x-ax-t*dx)**2+(y-ay-t*dy)**2,index=y*width+x;
      light[index]+=energy*params.haze*Math.exp(-d2/(4+params.haze*18))*0.6;
      cores[index]=Math.max(cores[index],energy*Math.exp(-d2/0.45));
    }
  }
  const contact=state.nodes[state.head];
  const terrainPower=state.phase==="flash"&&state.strike.kind==="ground"?power:0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x, v=y/height,cloud=state.clouds[i],hills=terrainAt(state,x/width);
    const glow=Math.min(1.3,light[i]),core=cores[i],offset=i*4;
    // Each depth pass owns its clouds, channel and opaque terrain. Later passes occlude it.
    if(v>=hills) {
      const dx=(x/width-(contact?.x??0))*1.6,dy=v-(contact?.y??0);
      const distance=Math.hypot(dx,dy),radius=0.19;
      const pool=terrainPower*Math.max(0,1-distance/radius)**2;
      const base=[[0.045,0.06,0.085],[0.026,0.044,0.065],[0.018,0.032,0.05]][state.depth];
      for(let c=0;c<3;c++)pixels[offset+c]=clamp(base[c]+pool*[0.8,0.85,1][c])*255;
    } else {
      const alpha=cloud*0.72,cloudColor=[0.14,0.15,0.21];
      for(let c=0;c<3;c++) {
        const background=pixels[offset+c]/255;
        pixels[offset+c]=clamp(background*(1-alpha)+cloudColor[c]*alpha+glow*[0.7,0.72,1][c]*(0.5+cloud)+core*[0.85,0.92,1][c])*255;
      }
    }
  }
}
export function createLightning({seed,params,start="peak"}) {
  const state={time:0,layers:[0,1,2].map(depth=>createLayer({seed:(seed+Math.imul(depth,2654435761))>>>0,params,depth}))};
  // Prepare just one naturally triggered event for inspection. Other layers retain their own charge.
  // At chargeRate=0 use unit rate only during preparation, then freeze the live quiet fields.
  let selected;
  for(let tick=0;tick<12000&&!selected;tick++)for(const layer of state.layers){
    stepCharge(layer.charge,.1,params.chargeRate||1,params.chargeBias);
    const candidate=strongestGradient(layer.charge,layer.depth,groundAt);
    if(candidate.gradient>=params.breakdownGradient){layer.strike=candidate;layer.phase="ready";selected=layer;break;}
  }
  if(selected&&start==="peak"){beginStrike(selected);while(selected.phase==="leader")grow(selected,params);}
  state.phase=phaseSummary(state);
  return state;
}
const phaseSummary=state=>state.layers.map((layer,i)=>`${["far","middle","near"][i]}: ${layer.strike&&layer.phase!=="quiet"?layer.strike.kind+" ":""}${layer.phase}`).join(" / ");
export function stepLightning(state,dt,params) {
  state.time+=dt;
  for(const layer of state.layers)stepLayer(layer,dt,params);
  state.phase=phaseSummary(state);
}
export function renderLightning(state,params) {
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const v=y/height;
    pixels.set([255*(0.045+v*0.07),255*(0.065+v*0.045),255*(0.14+v*0.08),255],(y*width+x)*4);
  }
  for(const layer of state.layers)renderLayer(layer,params,pixels);
  return pixels;
}
export const lightningScene={id:"lightning",title:"Lightning",width,height,dt:1/60,parameters,create:createLightning,step:stepLightning,render:renderLightning,
  defaultStart:"peak", starts:[
    {id:"peak",label:"Next shape",description:"Generate a fresh lightning shape, paused at peak brightness. Step fades this same channel."},
    {id:"before",label:"Before strike",description:"Generate a fresh setup paused just before growth. Step starts the leader; Play runs the whole strike."}
  ]};
