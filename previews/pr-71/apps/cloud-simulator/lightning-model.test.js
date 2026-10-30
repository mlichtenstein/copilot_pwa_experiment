/* Purpose: Verify reproducible growth, ground connectivity, read-only rendering and timing.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, lightning-model.js, experiment-session.js. */
import { randomInt } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {lightningScene,groundAt} from "./lightning-model.js";
import {createSession} from "./experiment-session.js";
const seeds = process.env.LIGHTNING_SEEDS ? process.env.LIGHTNING_SEEDS.split(",").map(Number) : Array.from({length:4},()=>randomInt(0,4294967296));
function grow(session){session.reset(session.seed,"before");for(let i=0;i<3000&&["ready","leader"].includes(session.state.layers[0].phase);i++)session.step();assert.equal(session.state.layers[0].phase,"flash");}
test(`channels reach terrain with valid ancestors (fresh seeds ${seeds.join(",")})`,()=>{
  for(const seed of seeds){
    const s=createSession(lightningScene,seed);grow(s);const state=s.state.layers[0];
    assert.ok(state.nodes.length<800);assert.equal(state.nodes[state.head].y,groundAt(state.nodes[state.head].x,state.depth));
    for(let i=1;i<state.nodes.length;i++){const n=state.nodes[i];assert.ok(n.parent>=0&&n.parent<i);assert.ok(n.x>=0&&n.x<=1&&n.y>=0&&n.y<=1);}
    assert.equal(state.returnPath[0],state.head);assert.equal(state.returnPath.at(-1),0);
    for(let i=0;i<state.returnPath.length-1;i++)assert.equal(state.nodes[state.returnPath[i]].parent,state.returnPath[i+1]);
  }
});
test("identical seeds/steps agree and JSON-restored state continues identically",()=>{
  const a=createSession(lightningScene,42),b=createSession(lightningScene,42);assert.deepEqual(a.state,b.state);
  for(let i=0;i<120;i++){a.step();b.step();}assert.deepEqual(a.state,b.state);
  const copy=JSON.parse(JSON.stringify(a.state));lightningScene.step(copy,lightningScene.dt,a.params);a.step();assert.deepEqual(a.state,copy);
  const c=createSession(lightningScene,43);assert.notDeepEqual(c.state.layers[0].nodes,b.state.layers[0].nodes);
});
test("zero branching removes side channels; roughness and branching affect geometry",()=>{
  const a=createSession(lightningScene,719,{branchChance:0,roughness:0});grow(a);assert.ok(a.state.layers[0].nodes.every(n=>!n.branch));
  const b=createSession(lightningScene,719,{branchChance:.6,roughness:3});grow(b);assert.ok(b.state.layers[0].nodes.some(n=>n.branch));assert.notDeepEqual(a.state.layers[0].nodes,b.state.layers[0].nodes);
});
test("rendering is read-only and light parameters affect output without changing geometry",()=>{
  const s=createSession(lightningScene,42);grow(s);const before=JSON.stringify(s.state),lit=s.render();
  s.set("flashStrength",0);assert.notDeepEqual(lit,s.render());assert.equal(JSON.stringify(s.state),before);
  for(let i=3;i<lit.length;i+=4)assert.equal(lit[i],255);assert.equal(lit.length,160*100*4);
});
test("a connected flash fades, waits, then starts another leader",()=>{
  const s=createSession(lightningScene,42,{flashDuration:.2,interval:3});grow(s);const strikes=s.state.layers[0].strikes;
  for(let i=0;i<14;i++)s.step();assert.equal(s.state.layers[0].phase,"quiet");
  for(let i=0;i<200;i++)s.step();assert.ok(s.state.layers[0].strikes>strikes);
});

test("peak and before-growth starts describe the same strike, and Step never replaces a peak shape",()=>{
  for(const seed of seeds){
    const peak=createSession(lightningScene,seed),before=createSession(lightningScene,seed);
    assert.equal(peak.state.layers[0].phase,"flash");assert.equal(peak.state.layers[0].age,0);
    const nodes=structuredClone(peak.state.layers[0].nodes);peak.step();assert.equal(peak.state.layers[0].phase,"flash");assert.deepEqual(peak.state.layers[0].nodes,nodes);assert.ok(peak.state.layers[0].age>0);
    before.reset(seed,"before");assert.equal(before.state.layers[0].phase,"ready");assert.equal(before.state.layers[0].nodes.length,0);
    before.step();assert.equal(before.state.layers[0].phase,"leader");assert.ok(before.state.layers[0].nodes.length>0);
    while(before.state.layers[0].phase==="leader")before.step();assert.deepEqual(before.state.layers[0].nodes,nodes);
    assert.equal(before.state.layers[0].age,0);assert.equal(before.state.layers[0].phase,"flash");
  }
});
test("starting mode survives parameter links, and old links default to peak",()=>{
  const a=createSession(lightningScene,19);a.reset(19,"before");const settings=a.getParams();assert.equal(settings.start,"before");
  const b=createSession(lightningScene);assert.equal(b.applyParams(settings),true);assert.equal(b.state.layers[0].phase,"ready");
  delete settings.start;assert.equal(b.applyParams(settings),true);assert.equal(b.state.layers[0].phase,"flash");
  assert.equal(b.applyParams({...settings,start:"unknown"}),false);
});

test("three independent depth layers connect to their own terrain and all evolve",()=>{
  for(const seed of seeds){
    const s=createSession(lightningScene,seed);assert.equal(s.state.layers.length,3);
    for(const [depth,layer] of s.state.layers.entries()){
      assert.equal(layer.depth,depth);assert.equal(layer.phase,"flash");
      const contact=layer.nodes[layer.head];assert.equal(contact.y,groundAt(contact.x,depth));
    }
    assert.notDeepEqual(s.state.layers[0].clouds,s.state.layers[1].clouds);
    s.step();for(const layer of s.state.layers)assert.ok(layer.age>0);
  }
});
test("ground light is local to the struck layer, fades, and stops at its radius",()=>{
  const s=createSession(lightningScene,42,{haze:0});
  // Isolate each depth pass without foreground terrain hiding the measurement.
  for(const source of s.state.layers){
    const state={time:0,layers:[structuredClone(source)]},layer=state.layers[0];
    const lit=lightningScene.render(state,s.params);layer.phase="quiet";
    const dark=lightningScene.render(state,s.params),hit=layer.nodes[layer.head];let changed=0;
    for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(y/100>=groundAt(x/160,layer.depth)){
      const i=(y*160+x)*4,delta=lit[i]-dark[i];
      if(delta>0){changed++;assert.ok(Math.hypot((x/160-hit.x)*1.6,y/100-hit.y)<0.19);}
    }
    assert.ok(changed>5);layer.phase="flash";layer.age=.15;
    const faded=lightningScene.render(state,s.params);
    assert.ok(faded.reduce((sum,v,i)=>sum+(i%4<3?v:0),0)<lit.reduce((sum,v,i)=>sum+(i%4<3?v:0),0));
    // A nearer quiet terrain fully covers a farther contact's illumination.
    if(layer.depth<2){const foreground=structuredClone(s.state.layers[2]);foreground.phase="quiet";
      const hidden=lightningScene.render({layers:[layer,foreground]},s.params);
      for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(y/100>=groundAt(x/160,2)){
        const i=(y*160+x)*4;assert.equal(hidden[i],Math.round(.018*255));
      }
    }
  }
});
