/* Purpose: Verify charge-triggered independent lightning, connections, discharge, rendering and repeatability.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, node:crypto, scene/session and charge-field modules. */
import {randomInt} from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {lightningScene,groundAt} from "./lightning-model.js";
import {createSession} from "./experiment-session.js";
import {createCharge,stepCharge,strongestGradient,chargePoint} from "./charge-field.js";
const seeds=process.env.LIGHTNING_SEEDS?process.env.LIGHTNING_SEEDS.split(",").map(Number):Array.from({length:4},()=>randomInt(0,4294967296));
const active=s=>s.state.layers.find(l=>l.phase==="flash"||l.phase==="ready"||l.phase==="leader");
function finish(s,layer){for(let i=0;i<3000&&["ready","leader"].includes(layer.phase);i++)s.step();assert.equal(layer.phase,"flash");}
function quiet(s){for(const layer of s.state.layers){layer.phase="quiet";layer.nodes=[];layer.charge.values.fill(0);layer.charge.drift.fill(0);layer.charge.bulkDrift=0;}}
function forced(kind){const s=createSession(lightningScene,42,{chargeRate:0});quiet(s);const l=s.state.layers[0];l.charge.values[29]=3;if(kind==="cloud")l.charge.values[32]=-3;s.step();assert.equal(l.strike.kind,kind);return {s,l};}
test(`one inspected event; channels connect with valid ancestors (fresh seeds ${seeds.join(',')})`,()=>{
  for(const seed of seeds){const s=createSession(lightningScene,seed),layer=active(s);
    assert.equal(s.state.layers.length,3);assert.equal(s.state.layers.filter(l=>l.phase==="flash").length,1);
    assert.ok(layer.nodes.length<800);const hit=layer.nodes[layer.head];
    if(layer.strike.kind==="ground")assert.equal(hit.y,groundAt(hit.x,layer.depth));else assert.deepEqual({x:hit.x,y:hit.y},layer.strike.target);
    for(let i=1;i<layer.nodes.length;i++){const n=layer.nodes[i];assert.ok(n.parent>=0&&n.parent<i);assert.ok(n.x>=0&&n.x<=1&&n.y>=0&&n.y<=1);}
    assert.equal(layer.returnPath[0],layer.head);assert.equal(layer.returnPath.at(-1),0);
    for(let i=0;i<layer.returnPath.length-1;i++)assert.equal(layer.nodes[layer.returnPath[i]].parent,layer.returnPath[i+1]);
  }
});
test("same seeds and JSON-restored state continue identically",()=>{
  const a=createSession(lightningScene,42),b=createSession(lightningScene,42);assert.deepEqual(a.state,b.state);
  for(let i=0;i<120;i++){a.step();b.step();}assert.deepEqual(a.state,b.state);
  const copy=JSON.parse(JSON.stringify(a.state));lightningScene.step(copy,lightningScene.dt,a.params);a.step();assert.deepEqual(a.state,copy);
});
test("peak and before starts share one event; Step retains that peak channel",()=>{
  for(const seed of seeds){const peak=createSession(lightningScene,seed),before=createSession(lightningScene,seed);before.reset(seed,"before");
    const layer=active(peak),nodes=structuredClone(layer.nodes),ready=active(before);assert.equal(ready.phase,"ready");
    assert.equal(before.state.layers.filter(l=>l.phase==="ready").length,1);assert.ok(before.state.layers.every(l=>l.nodes.length===0));
    assert.equal(ready.depth,layer.depth);before.step();assert.equal(ready.phase,"leader");finish(before,ready);assert.deepEqual(ready.nodes,nodes);
    peak.step();assert.equal(layer.phase,"flash");assert.deepEqual(layer.nodes,nodes);assert.ok(layer.age>0);
  }
});
test("strongest gradient selects ground or an opposite cloud region from field values",()=>{
  const field=createCharge(42);field.values.fill(0);field.values[29]=3;
  const ground=strongestGradient(field,0,groundAt);assert.equal(ground.kind,"ground");assert.equal(ground.from,29);
  field.values[32]=-3;const cloud=strongestGradient(field,0,groundAt);assert.equal(cloud.kind,"cloud");assert.equal(cloud.from,29);assert.equal(cloud.to,32);
  field.values.fill(0);assert.equal(strongestGradient(field,0,groundAt).gradient,0);
});
test("subthreshold fields stay quiet; threshold, location and layer determine initiation",()=>{
  const s=createSession(lightningScene,42,{chargeRate:0});quiet(s);for(let i=0;i<180;i++)s.step();assert.ok(s.state.layers.every(l=>l.phase==="quiet"));
  const l=s.state.layers[2];l.charge.values[29]=3;l.charge.values[32]=-3;s.step();assert.equal(l.phase,"leader");assert.deepEqual({x:l.nodes[0].x,y:l.nodes[0].y},chargePoint(29,2));assert.equal(s.state.layers[0].phase,"quiet");
  const high=createSession(lightningScene,42,{chargeRate:0,breakdownGradient:10});quiet(high);high.state.layers[0].charge.values[29]=1;high.step();assert.equal(high.state.layers[0].phase,"quiet");
});
test("ground and cloud connections discharge the field and only ground lights terrain",()=>{
  for(const kind of ["cloud","ground"]){const {s,l}=forced(kind),before=l.charge.values.reduce((sum,v)=>sum+Math.abs(v),0);finish(s,l);
    assert.equal(l.strike.kind,kind);assert.ok(l.charge.values.reduce((sum,v)=>sum+Math.abs(v),0)<before*.6);
    const lit=lightningScene.render({layers:[l]},s.params);l.phase="quiet";const dark=lightningScene.render({layers:[l]},s.params);let changed=0;
    const hit=l.nodes[l.head];for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(y/100>=groundAt(x/160,l.depth)){
      const i=(y*160+x)*4;if(lit[i]>dark[i]){changed++;assert.ok(Math.hypot((x/160-hit.x)*1.6,y/100-hit.y)<.19);}
    }
    if(kind==="ground")assert.ok(changed>5);else assert.equal(changed,0);
  }
});
test("stochastic fields generate varied times, locations and both strike types across depths",()=>{
  for(const seed of seeds){const s=createSession(lightningScene,seed),events=[];
    for(let tick=0;tick<7200;tick++){const counts=s.state.layers.map(l=>l.strikes);s.step();for(const l of s.state.layers)if(l.strikes>counts[l.depth])events.push({tick,depth:l.depth,kind:l.strike.kind,from:l.strike.from});}
    assert.ok(new Set(events.map(e=>e.depth)).size===3);assert.ok(new Set(events.map(e=>e.kind)).size===2);assert.ok(new Set(events.map(e=>e.from)).size>3);
    assert.ok(new Set(events.map(e=>e.tick)).size>events.length*.6);
    const gaps=events.slice(1).map((e,i)=>e.tick-events[i].tick);assert.ok(new Set(gaps).size>4);
  }
});
test("charge ticks are repeatable, bounded, and freeze when rate is zero",()=>{
  const a=createCharge(2),b=structuredClone(a);for(let i=0;i<600;i++)stepCharge(a,1/60,1);for(let i=0;i<100;i++)stepCharge(b,.1,1);assert.deepEqual(a.values,b.values);assert.deepEqual(a.drift,b.drift);
  const values=[...a.values];stepCharge(a,1,0);assert.deepEqual(a.values,values);assert.ok(a.values.every(v=>Number.isFinite(v)&&Math.abs(v)<=8));
});
test("render is read-only; flash fades and foreground terrain covers farther contact light",()=>{
  const {s,l}=forced("ground");finish(s,l);const before=JSON.stringify(s.state),lit=s.render();assert.equal(JSON.stringify(s.state),before);s.set("flashStrength",0);assert.notDeepEqual(lit,s.render());s.set("flashStrength",.65);
  for(let i=3;i<lit.length;i+=4)assert.equal(lit[i],255);
  const foreground=s.state.layers[2];foreground.phase="quiet";const hidden=lightningScene.render({layers:[l,foreground]},s.params);
  for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(y/100>=groundAt(x/160,2))assert.equal(hidden[(y*160+x)*4],Math.round(.018*255));
  l.age=.15;const faded=s.render();assert.ok(faded.reduce((sum,v)=>sum+v,0)<lit.reduce((sum,v)=>sum+v,0));
  for(let i=0;i<60;i++)s.step();assert.equal(l.phase,"quiet");
});
test("branch setting affects geometry and parameter links preserve the starting mode",()=>{
  const a=createSession(lightningScene,719,{branchChance:0,roughness:0});assert.ok(active(a).nodes.every(n=>!n.branch));
  const b=createSession(lightningScene,719,{branchChance:.6,roughness:3});assert.ok(active(b).nodes.some(n=>n.branch));assert.notDeepEqual(active(a).nodes,active(b).nodes);
  a.reset(19,"before");const settings=a.getParams();assert.equal(b.applyParams(settings),true);assert.equal(active(b).phase,"ready");
  delete settings.start;assert.equal(b.applyParams(settings),true);assert.equal(active(b).phase,"flash");assert.equal(b.applyParams({...settings,start:"unknown"}),false);
});
