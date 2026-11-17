/* Purpose: Test the scene contract independently of lightning, DOM and display resolution.
 * Consumers: Node test runner. Dependencies: node:test, node:assert and experiment-session.js. */
import test from "node:test";
import assert from "node:assert/strict";
import {createSession} from "./experiment-session.js";
const fixture={id:"counter-field",width:3,height:2,dt:0.05,parameters:[{key:"rate",min:0,max:4,step:0.5,default:1}],
  create:({seed})=>({time:0,value:seed}),step:(s,dt,p)=>{s.time+=dt;s.value+=p.rate;},
  render:s=>new Uint8ClampedArray(24).fill(s.value),actions:[{id:"double",run:s=>{s.value*=2;}}]};
test("host contract handles a different scene, resolution, action and parameter schema",()=>{
  const s=createSession(fixture,2);s.set("rate",2.24);assert.equal(s.params.rate,2);
  s.step();assert.equal(s.state.value,4);s.action("double");assert.equal(s.state.value,8);
  assert.equal(s.render().length,24);s.reset();assert.equal(s.state.value,2);
  s.set("unknown",99);s.set("rate",NaN);assert.equal(s.params.rate,2);
});
test("fixed steps are independent of frame partitioning and catch-up is bounded",()=>{
  const a=createSession(fixture),b=createSession(fixture);
  for(let i=0;i<4;i++)a.advance(.05);b.advance(.2);assert.deepEqual(a.state,b.state);
  const c=createSession(fixture);c.advance(100);assert.ok(c.state.time<=.25+1e-10);
  c.advance(.01);c.clearClock();c.advance(.04);assert.ok(c.state.time<=.25+1e-10);
});
test("seed and normalized parameter presets round-trip without sharing mutable objects",()=>{
  const a=createSession(fixture,5);a.set("rate",100);const settings=a.getParams();assert.equal(settings.params.rate,4);
  const b=createSession(fixture);assert.equal(b.applyParams(settings),true);assert.deepEqual(a.getParams(),b.getParams());
  settings.params.rate=0;assert.equal(b.params.rate,4);assert.equal(b.applyParams({version:2,params:{},seed:1}),false);
});
