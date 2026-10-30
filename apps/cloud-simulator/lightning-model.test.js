/* Purpose: Verify reproducible growth, ground connectivity, read-only rendering and timing.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, lightning-model.js, experiment-session.js. */
import test from "node:test";
import assert from "node:assert/strict";
import {lightningScene,groundAt} from "./lightning-model.js";
import {createSession} from "./experiment-session.js";
function grow(session){session.action("strike");for(let i=0;i<3000&&session.state.phase==="leader";i++)session.step();assert.equal(session.state.phase,"flash");}
test("seeded channels reach terrain and every return-path node has a valid ancestor",()=>{
  for(const seed of [1,42,719,99999]){
    const s=createSession(lightningScene,seed);grow(s);const state=s.state;
    assert.ok(state.nodes.length<800);assert.equal(state.nodes[state.head].y,groundAt(state.nodes[state.head].x));
    for(let i=1;i<state.nodes.length;i++){const n=state.nodes[i];assert.ok(n.parent>=0&&n.parent<i);assert.ok(n.x>=0&&n.x<=1&&n.y>=0&&n.y<=1);}
    assert.equal(state.returnPath[0],state.head);assert.equal(state.returnPath.at(-1),0);
    for(let i=0;i<state.returnPath.length-1;i++)assert.equal(state.nodes[state.returnPath[i]].parent,state.returnPath[i+1]);
  }
});
test("identical seeds/steps agree and JSON-restored state continues identically",()=>{
  const a=createSession(lightningScene,42),b=createSession(lightningScene,42);assert.deepEqual(a.state,b.state);
  for(let i=0;i<120;i++){a.step();b.step();}assert.deepEqual(a.state,b.state);
  const copy=JSON.parse(JSON.stringify(a.state));lightningScene.step(copy,lightningScene.dt,a.params);a.step();assert.deepEqual(a.state,copy);
  const c=createSession(lightningScene,43);assert.notDeepEqual(c.state.nodes,b.state.nodes);
});
test("zero branching removes side channels; roughness and branching affect geometry",()=>{
  const a=createSession(lightningScene,719,{branchChance:0,roughness:0});grow(a);assert.ok(a.state.nodes.every(n=>!n.branch));
  const b=createSession(lightningScene,719,{branchChance:.6,roughness:3});grow(b);assert.ok(b.state.nodes.some(n=>n.branch));assert.notDeepEqual(a.state.nodes,b.state.nodes);
});
test("rendering is read-only and light parameters affect output without changing geometry",()=>{
  const s=createSession(lightningScene,42);grow(s);const before=JSON.stringify(s.state),lit=s.render();
  s.set("flashStrength",0);assert.notDeepEqual(lit,s.render());assert.equal(JSON.stringify(s.state),before);
  for(let i=3;i<lit.length;i+=4)assert.equal(lit[i],255);assert.equal(lit.length,160*100*4);
});
test("a connected flash fades, waits, then starts another leader",()=>{
  const s=createSession(lightningScene,42,{flashDuration:.2,interval:3});grow(s);const strikes=s.state.strikes;
  for(let i=0;i<14;i++)s.step();assert.equal(s.state.phase,"quiet");
  for(let i=0;i<200;i++)s.step();assert.ok(s.state.strikes>strikes);
});
