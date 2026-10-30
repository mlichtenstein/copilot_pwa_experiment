/* Purpose: Seeded branching lightning growth, flash dynamics and read-only pixel rendering.
 * Consumers: lightning.js, model tests, and the generic experiment host. Dependencies: valley-noise.js. */
import { perlin3 } from "./valley-noise.js";
const width = 160, height = 100, clamp = v => Math.max(0, Math.min(1, v));
export const parameters = [
  { key:"downwardBias", default:1.1, min:0.2, max:3, step:0.1, description:"Strength of downward preference in the leader's direction score; larger values straighten the main channel." },
  { key:"roughness", default:1.4, min:0, max:3, step:0.1, description:"Strength of seeded field variation and random direction choice; larger values make the path wander." },
  { key:"branchChance", default:0.25, min:0, max:0.6, step:0.05, description:"Probability of a short side branch at each main-channel growth step." },
  { key:"leaderSpeed", default:70, min:10, max:150, step:5, description:"Main-channel growth steps per simulated second." },
  { key:"flashDuration", default:0.6, min:0.2, max:1.5, step:0.1, description:"Seconds over which the connected channel and its surrounding illumination fade." },
  { key:"flashStrength", default:0.65, min:0, max:1, step:0.05, description:"Brightness of the connected channel and its illumination of clouds, air and struck terrain." },
  { key:"haze", default:0.55, min:0, max:1, step:0.05, description:"How strongly air and cloud droplets reveal light around the channel." },
  { key:"interval", default:6, min:3, max:15, step:0.5, description:"Seconds of quiet after a flash before the next automatically grown strike." }
];
export function groundAt(x, depth = 2) { return [0.66,0.79,0.91][depth]+0.035*Math.sin(x*9+1+depth*1.7)+0.016*Math.sin(x*23+depth); }
const terrainAt = (state,x) => groundAt(x,state.depth);
function random(state) { state.rng = (Math.imul(state.rng,1664525)+1013904223)>>>0; return state.rng/4294967296; }
export function beginStrike(state) {
  state.nodes = [{x:0.3+random(state)*0.4,y:0.10+state.depth*0.055,parent:-1,branch:false}];
  state.head = 0; state.returnPath = []; state.phase = "leader"; state.age = 0; state.growth = 0; state.strikes++;
}
function extend(state, parent, params, branch = false, direction = 0) {
  const from = state.nodes[parent], length = branch ? 0.025 : 0.018;
  let best, score = -Infinity;
  for (let i=0;i<7;i++) {
    const angle = branch ? direction + (i-3)*0.12 : (i-3)*0.36;
    const dx=Math.sin(angle)*length,dy=Math.cos(angle)*length;
    const field=perlin3((from.x+dx)*14,(from.y+dy)*14,state.seed%997,91);
    const candidate=params.downwardBias*dy/length+params.roughness*(field+random(state)*0.7);
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
  if(state.nodes[state.head].y>=terrainAt(state,state.nodes[state.head].x) || state.nodes.length>=760) {
    if(state.nodes[state.head].y<terrainAt(state,state.nodes[state.head].x)){state.nodes.push({x:state.nodes[state.head].x,y:terrainAt(state,state.nodes[state.head].x),parent:state.head,branch:false});state.head=state.nodes.length-1;}
    for(let i=state.head;i>=0;i=state.nodes[i].parent) state.returnPath.push(i);
    state.phase="flash";state.age=0;
  }
}
function createLayer({seed,params,start,depth}) {
  const state={depth,seed:seed>>>0,rng:seed>>>0,time:0,age:0,phase:"ready",nodes:[],returnPath:[],head:0,growth:0,strikes:0,clouds:[]};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) state.clouds.push(clamp((perlin3(x/width*5,y/height*9,seed%997,13)-0.25)*2)*Math.exp(-(((y/height-(0.16+depth*0.06))/0.22)**4)));
  if(start==="peak"){beginStrike(state);while(state.phase==="leader")grow(state,params);}
  return state;
}
function stepLayer(state,dt,params) {
  state.time+=dt;
  if(state.phase==="ready")beginStrike(state);
  if(state.phase==="leader") {
    state.growth+=dt*params.leaderSpeed;
    while(state.growth>=1 && state.phase==="leader"){state.growth--;grow(state,params);}
  } else {
    state.age+=dt;
    if(state.phase==="flash" && state.age+1e-10>=params.flashDuration){state.phase="quiet";state.age=0;}
    else if(state.phase==="quiet" && state.age+1e-10>=params.interval)beginStrike(state);
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
  const terrainPower=state.phase==="flash"?power:0;
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
  return {time:0,layers:[0,1,2].map(depth=>createLayer({seed:(seed+Math.imul(depth,2654435761))>>>0,params,start,depth}))};
}
export function stepLightning(state,dt,params) {
  state.time+=dt;
  for(const layer of state.layers)stepLayer(layer,dt,params);
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
