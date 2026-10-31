/* Purpose: Reusable browser host for scene modules: controls, clock, presets and pixel display.
 * Consumers: lightning.js and future experiment entries. Dependencies: experiment-session.js,
 * ../shared/presets-panel.js, DOM IDs in lightning.html, Canvas and browser scheduling APIs. */
import { createSession } from "./experiment-session.js";
import { mountPresetBar } from "../shared/presets-panel.js";
export function mountExperiment(scene, { randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] } = {}) {
  const el=id=>document.getElementById(id),canvas=el("sky"),ctx=canvas.getContext("2d"),session=createSession(scene,randomSeed());
  canvas.width=scene.width;canvas.height=scene.height;canvas.style.setProperty("--ar",scene.width/scene.height);
  let playing=false,last,dirty=true,renderMs=0;
  function setPlaying(value){playing=value;last=undefined;session.clearClock();el("play").textContent=playing?"Pause":"Play";el("play").setAttribute("aria-pressed",String(playing));}
  function sync(){el("status").textContent="";for(const p of scene.parameters){el(p.key).value=session.params[p.key];el(p.key+"-value").textContent=String(session.params[p.key]);}dirty=true;}
  for(const p of scene.parameters){
    const label=document.createElement("label"),name=document.createElement("code"),description=document.createElement("small"),output=document.createElement("output"),input=document.createElement("input");
    name.textContent=p.key;description.textContent=p.description;output.id=p.key+"-value";
    Object.assign(input,{id:p.key,type:"range",min:p.min,max:p.max,step:p.step,value:p.default,title:p.description});
    input.addEventListener("input",()=>{session.set(p.key,input.value);output.textContent=session.params[p.key];dirty=true;});
    label.append(name,description,output,input);el("parameters").append(label);
  }
  for(const action of scene.actions??[]){const button=document.createElement("button");Object.assign(button,{type:"button",textContent:action.label,title:action.description});
    button.addEventListener("click",()=>{session.action(action.id);if(action.play)setPlaying(true);dirty=true;});el("actions").append(button);}
  el("play").addEventListener("click",()=>setPlaying(!playing));
  el("step").addEventListener("click",()=>{setPlaying(false);session.step();dirty=true;});
  el("reset").addEventListener("click",()=>{setPlaying(false);for(const p of scene.parameters)session.set(p.key,p.default);session.reset(session.seed);sync();});
  for(const start of scene.starts??[]){const button=document.createElement("button");Object.assign(button,{type:"button",textContent:start.label,title:start.description});
    button.addEventListener("click",()=>{setPlaying(false);session.reset(randomSeed(),start.id);sync();});el("starts").append(button);}
  document.addEventListener("visibilitychange",()=>{last=undefined;session.clearClock();});
  const applyParams=value=>{if(session.applyParams(value)){setPlaying(false);sync();}};
  sync();mountPresetBar(el("presets"),{app:"cloud-simulator/"+scene.id,getParams:()=>session.getParams(),applyParams,canvas});
  function frame(stamp){
    try{
      if(!document.hidden){
        if(playing&&last!==undefined){session.advance((stamp-last)/1000);dirty=true;}
        if(dirty){const start=performance.now(),image=ctx.createImageData(scene.width,scene.height);image.data.set(session.render());ctx.putImageData(image,0,0);renderMs=performance.now()-start;dirty=false;}
        el("stats").textContent=`${session.state.phase??"scene"} · t ${(session.state.time??0).toFixed(2)} s · ${renderMs.toFixed(1)} ms/render`;
      }
      last=stamp;requestAnimationFrame(frame);
    }catch(error){setPlaying(false);console.error("Experiment failed",error);el("status").textContent="The experiment stopped after an error. Reset or reload to retry.";dirty=false;requestAnimationFrame(frame);}
  }
  requestAnimationFrame(frame);
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./cloud-sw.js").catch(error=>{console.error("Offline setup failed",error);el("status").textContent="Offline setup failed; the experiment still works online.";});
  return {session,applyParams};
}
