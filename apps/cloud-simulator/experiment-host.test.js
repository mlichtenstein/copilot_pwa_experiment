/* Purpose: Exercise generated controls, playback and seed/preset/reset behavior in the shared host.
 * Consumers: Node test runner. Dependencies: node:test, node:assert, experiment-host.js and a minimal DOM harness. */
import test from "node:test";
import assert from "node:assert/strict";
import {mountExperiment} from "./experiment-host.js";
test("generic DOM host builds controls, steps, plays, reseeds and restores parameters",()=>{
  const original={document:globalThis.document,raf:globalThis.requestAnimationFrame};
  const nodes=[],events={};let callback,stamp=0,painted;
  const node=(tag="div",id="")=>{const n={tag,id,children:[],handlers:{},style:{setProperty(){}},textContent:"",value:"",append(...children){this.children.push(...children);},addEventListener(event,fn){this.handlers[event]=fn;},setAttribute(){}};nodes.push(n);return n;};
  for(const id of ["sky","starts","play","step","reset","parameters","actions","presets","stats","status"])node("div",id);
  const get=id=>nodes.find(n=>n.id===id);
  get("sky").getContext=()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{painted=image.data;}});
  globalThis.document={hidden:false,getElementById:get,createElement:node,addEventListener:(event,fn)=>{events[event]=fn;}};
  globalThis.requestAnimationFrame=fn=>{callback=fn;};
  const scene={id:"fixture",defaultStart:"peak",starts:[{id:"peak",label:"Next shape",description:"New peak"},{id:"before",label:"Before strike",description:"New beginning"}],width:4,height:2,dt:.1,parameters:[{key:"rate",min:0,max:4,step:1,default:1,description:"Tick amount"}],create:({seed,start})=>({time:0,value:seed,mode:start}),step:(s,dt,p)=>{s.time+=dt;s.value+=p.rate;},render:s=>new Uint8ClampedArray(32).fill(s.value),actions:[{id:"double",label:"Double",description:"Double the value",play:true,run:s=>{s.value*=2;}}]};
  const frame=(dt=16)=>{stamp+=dt;callback(stamp);};
  try{
    let generatedSeed=41;const host=mountExperiment(scene,{randomSeed:()=>++generatedSeed});frame();assert.equal(painted.length,32);assert.equal(get("sky").width,4);
    get("rate").value="3";get("rate").handlers.input();get("step").handlers.click();frame();assert.equal(host.session.state.value,45);
    get("actions").children[0].handlers.click();frame();frame(100);assert.equal(host.session.state.value,93);
    globalThis.document.hidden=true;events.visibilitychange();frame(5000);globalThis.document.hidden=false;events.visibilitychange();frame();assert.equal(host.session.state.value,93);
    get("starts").children[0].handlers.click();frame();assert.equal(host.session.seed,43);assert.equal(host.session.start,"peak");assert.equal(get("play").textContent,"Play");
    get("starts").children[1].handlers.click();frame();assert.equal(host.session.seed,44);assert.equal(host.session.start,"before");assert.equal(host.session.state.mode,"before");
    assert.equal(nodes.filter(n=>n.type==="number").length,0);assert.ok(!get("stats").textContent.includes("seed"));
    assert.ok(host.session.applyParams({version:1,seed:7,params:{rate:4}}));
    host.applyParams({version:1,seed:9,params:{rate:2}});frame();assert.equal(get("rate").value,2);assert.equal(host.session.state.value,9);
    get("reset").handlers.click();frame();assert.equal(host.session.params.rate,1);assert.equal(host.session.seed,9);
  }finally{globalThis.document=original.document;globalThis.requestAnimationFrame=original.raf;}
});
