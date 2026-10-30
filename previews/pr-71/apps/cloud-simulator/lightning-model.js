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
  { key:"flashStrength", default:0.65, min:0, max:1, step:0.05, description:"Brightness of the connected channel and its illumination of clouds and air." },
  { key:"haze", default:0.55, min:0, max:1, step:0.05, description:"How strongly air and cloud droplets reveal light around the channel." },
  { key:"interval", default:6, min:3, max:15, step:0.5, description:"Seconds of quiet after a flash before the next automatically grown strike." }
];
export function groundAt(x) { return 0.84+0.035*Math.sin(x*9+1)+0.016*Math.sin(x*23); }
function random(state) { state.rng = (Math.imul(state.rng,1664525)+1013904223)>>>0; return state.rng/4294967296; }
export function beginStrike(state) {
  state.nodes = [{x:0.3+random(state)*0.4,y:0.12,parent:-1,branch:false}];
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
    if(candidate>score){score=candidate;best={x:Math.max(0.02,Math.min(0.98,from.x+dx)),y:Math.min(groundAt(Math.max(0.02,Math.min(0.98,from.x+dx))),from.y+dy),parent,branch};}
  }
  state.nodes.push(best); return state.nodes.length-1;
}
function grow(state, params) {
  state.head=extend(state,state.head,params);
  if (state.nodes.length<700 && random(state)<params.branchChance) {
    let parent=state.head; const direction=(random(state)<0.5?-1:1)*(0.65+random(state)*0.65), count=2+Math.floor(random(state)*7);
    for(let i=0;i<count;i++) parent=extend(state,parent,params,true,direction);
  }
  if(state.nodes[state.head].y>=groundAt(state.nodes[state.head].x) || state.nodes.length>=760) {
    if(state.nodes[state.head].y<groundAt(state.nodes[state.head].x)){state.nodes.push({x:state.nodes[state.head].x,y:groundAt(state.nodes[state.head].x),parent:state.head,branch:false});state.head=state.nodes.length-1;}
    for(let i=state.head;i>=0;i=state.nodes[i].parent) state.returnPath.push(i);
    state.phase="flash";state.age=0;
  }
}
export function createLightning({seed,params}) {
  const state={seed:seed>>>0,rng:seed>>>0,time:0,age:0,phase:"preview",nodes:[],returnPath:[],head:0,growth:0,strikes:0,clouds:[]};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) state.clouds.push(clamp((perlin3(x/width*5,y/height*9,seed%997,13)-0.25)*2)*Math.exp(-(((y/height-0.21)/0.22)**4)));
  beginStrike(state);while(state.phase==="leader")grow(state,params);state.phase="preview";
  return state;
}
export function stepLightning(state,dt,params) {
  state.time+=dt;
  if(state.phase==="preview")beginStrike(state);
  if(state.phase==="leader") {
    state.growth+=dt*params.leaderSpeed;
    while(state.growth>=1 && state.phase==="leader"){state.growth--;grow(state,params);}
  } else {
    state.age+=dt;
    if(state.phase==="flash" && state.age>=params.flashDuration){state.phase="quiet";state.age=0;}
    else if(state.phase==="quiet" && state.age>=params.interval)beginStrike(state);
  }
}
export function renderLightning(state,params) {
  const light=new Float32Array(width*height), cores=new Float32Array(width*height), path=new Set(state.returnPath);
  const power=state.phase==="preview"?0.6*params.flashStrength:state.phase==="flash"?params.flashStrength*Math.exp(-state.age/Math.max(0.05,params.flashDuration*0.3)):state.phase==="leader"?0.09:0;
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
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x, v=y/height,cloud=state.clouds[i],hills=groundAt(x/width);
    const glow=Math.min(1.3,light[i]),core=cores[i];
    let color=[0.045+v*0.07,0.065+v*0.045,0.14+v*0.08].map((value,c)=>value+cloud*[0.07,0.065,0.10][c]+glow*[0.7,0.72,1][c]*(0.5+cloud)+core*[0.85,0.92,1][c]);
    if(v>hills)color=[0.018,0.032,0.05].map(value=>value+glow*0.07);
    pixels.set([...color.map(value=>clamp(value)*255),255],i*4);
  }
  return pixels;
}
export const lightningScene={id:"lightning",title:"Lightning",width,height,dt:1/60,parameters,create:createLightning,step:stepLightning,render:renderLightning,
  actions:[{id:"strike",label:"Grow strike",description:"Start a newly seeded channel and play its growth and flash.",play:true,run:beginStrike}]};
