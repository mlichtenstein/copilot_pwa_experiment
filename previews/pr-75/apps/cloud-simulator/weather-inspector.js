/* Purpose: Build the read-only live field graph and progressive composition viewer.
 * Consumers: weather.js. Dependencies: weather-inspection.js metadata, a DOM/document and instance.preview(). */
import {nodes,passes,graphEdges,describeNode} from "./weather-inspection.js";
const SVG="http://www.w3.org/2000/svg";
export function mountWeatherInspector({doc,root,select}){
  if(!root)return {update(){}};
  const make=(tag,props={},...children)=>{const node=Object.assign(doc.createElement(tag),props);node.append(...children);return node;};
  const svgNode=(tag,attrs)=>{const node=doc.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  let mode="fields",latest;
  const tabs=make("div",{className:"inspector-tabs"}),fieldTab=make("button",{type:"button",textContent:"Ingredients",title:"Show the fields and their real data dependencies"}),passTab=make("button",{type:"button",textContent:"Composition",title:"Show the image accumulating through the actual render passes"}),full=make("button",{type:"button",textContent:"Full scene",title:"Return the main viewport to the final combined image"});
  const help=make("p",{className:"inspector-help",textContent:"Click any tile to inspect it in the main viewport. Select a field: amber arrows enter it; mint arrows leave it. Unselected links fade. Collapse a depth to its header to simplify the graph. Black light tiles mean no contribution right now."});
  const detail=make("p",{className:"inspector-detail"});detail.setAttribute("role","status");
  const board=make("div",{className:"weather-graph-board"}),wire=svgNode("svg",{"aria-hidden":"true",class:"weather-graph-wires"}),defs=svgNode("defs",{});
  for(const [id,color] of [["weather-arrow","#76b7d0"],["weather-cross-arrow","#e4b36a"],["weather-input-arrow","#ffc266"],["weather-output-arrow","#6bffcf"]]){const marker=svgNode("marker",{id,viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:5,markerHeight:5,orient:"auto-start-reverse"});marker.append(svgNode("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:color}));defs.append(marker);}wire.append(defs);board.append(wire);
  const refs=new Map(),tiles=[];
  function tile(id,label,view,layer,description){
    const canvas=make("canvas",{width:32,height:20});canvas.setAttribute("aria-hidden","true");
    const button=make("button",{id:`inspect-${id.replace(":","-")}`,className:"weather-node",type:"button",title:description},canvas,make("span",{textContent:label}));
    button.setAttribute("aria-label",layer?`${layer}: ${label}`:label);
    button.addEventListener("click",()=>select({view,...(layer?{inspectLayer:layer}:{})}));
    refs.set(id,button);tiles.push({id,view,layer,canvas,button,label});return button;
  }
  const source=make("div",{className:"weather-graph-source"},tile("sun","Sun + atmosphere","sky",null,"Atmospheric sky and sun/path lighting. Supplies polygon origins, cloud colors and light-veil colors."),make("p",{textContent:"Shared sun & atmosphere feed every depth. Humidity is diagnostic; charge remains independent of cloud water."}));board.append(source);
  const sections=[];
  const columns=make("div",{className:"weather-graph-columns"}),headers=[];
  for(const [index,name] of ["near","middle","far"].entries()){
    const heading=make("summary",{title:"Expand or collapse this distance layer",textContent:`${name} · ${[8,24,65][index]} km`});headers.push(heading);
    const grid=make("div",{className:"weather-node-grid"});
    for(const node of nodes)grid.append(tile(`${name}:${node.id}`,node.label,node.id,name,describeNode(node)));
    const section=make("details",{className:"weather-graph-column",open:index===0},heading,grid);section.id=`inspect-layer-${name}`;
    section.addEventListener("toggle",()=>{if(latest)update(...latest);});sections.push(section);columns.append(section);
  }
  board.append(columns);
  const composition=make("ol",{className:"weather-composition",hidden:true}),passTiles=[];
  for(const pass of passes){const button=tile(`pass-${pass.index}`,`${pass.index+1}. ${pass.label}`,pass.view,null,`Accumulated image after ${pass.label}. Uses the same renderer as the final scene.`);passTiles.push(tiles.at(-1));composition.append(make("li",{},button));}
  tabs.append(fieldTab,passTab,full);root.append(tabs,help,detail,board,composition);
  const paths=graphEdges().map(edge=>{const path=svgNode("path",{fill:"none",stroke:edge.cross?"#e4b36a":"#76b7d0","stroke-width":edge.cross?1.7:1.2,"stroke-dasharray":edge.cross?"5 3":"none","marker-end":`url(#${edge.cross?"weather-cross-arrow":"weather-arrow"})`});wire.append(path);return {edge,path};});
  function drawWires(){
    if(!board.getBoundingClientRect)return;
    const bounds=board.getBoundingClientRect();wire.setAttribute("viewBox",`0 0 ${board.scrollWidth} ${board.scrollHeight}`);wire.setAttribute("width",board.scrollWidth);wire.setAttribute("height",board.scrollHeight);
    for(const {edge,path} of paths){const endpoint=id=>{const tile=refs.get(id),name=id.split(":")[0],index=["near","middle","far"].indexOf(name);return index>=0&&!sections[index].open?headers[index]:tile;};
      const a=endpoint(edge.from).getBoundingClientRect(),b=endpoint(edge.to).getBoundingClientRect();
      const down=b.top>=a.bottom-1,x1=a.left+a.width*.5-bounds.left,y1=(down?a.bottom:a.top)-bounds.top,x2=b.left+b.width*.5-bounds.left,y2=(down?b.top:b.bottom)-bounds.top,mid=(y1+y2)/2;
      path.setAttribute("d",`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
    }
  }
  function show(next){mode=next;board.hidden=mode!=="fields";composition.hidden=mode!=="passes";fieldTab.setAttribute("aria-pressed",String(mode==="fields"));passTab.setAttribute("aria-pressed",String(mode==="passes"));if(latest)update(...latest);}
  fieldTab.addEventListener("click",()=>show("fields"));passTab.addEventListener("click",()=>show("passes"));full.addEventListener("click",()=>select({view:"scene"}));
  root.addEventListener("toggle",()=>{if(latest&&root.open)update(...latest);});
  function update(params,instance){
    latest=[params,instance];
    const selected=nodes.find(node=>node.id===params.view),pass=passes.find(pass=>pass.view===params.view),layer=instance.state.layers.find(l=>l.name===params.inspectLayer);
    const description=params.view==="scene"?"Final combined scene.":selected?`${params.inspectLayer} · ${selected.label}: ${describeNode(selected)}`:params.view==="sky"?"Sky: atmospheric background before any light veils or scene layers.":pass?`Composition ${pass.index+1}/6: accumulated image ${pass.label}.`:"Final combined scene.";
    if(detail.textContent!==description)detail.textContent=description;
    const caption=doc.getElementById("inspection-caption");if(caption&&caption.textContent!==description)caption.textContent=description;
    if(!root.open)return;
    for(let i=0;i<headers.length;i++)headers[i].textContent=`${["near","middle","far"][i]} · ${[8,24,65][i]} km${params[["near","middle","far"][i]]?"":" · hidden (fields retained)"}`;
    const selectedId=params.view==="sky"?"sun":selected?`${params.inspectLayer}:${params.view}`:null;
    for(const {edge,path} of paths){const incoming=edge.to===selectedId,outgoing=edge.from===selectedId;
      path.setAttribute("stroke",incoming?"#ffc266":outgoing?"#6bffcf":edge.cross?"#e4b36a":"#76b7d0");
      path.setAttribute("stroke-width",incoming||outgoing?3.5:1.2);path.setAttribute("opacity",selectedId?(incoming||outgoing?1:.15):.7);
      path.setAttribute("marker-end",`url(#${incoming?"weather-input-arrow":outgoing?"weather-output-arrow":edge.cross?"weather-cross-arrow":"weather-arrow"})`);
    }
    const shown=mode==="fields"?tiles.filter(t=>!t.id.startsWith("pass-")&&(!t.layer||sections[["near","middle","far"].indexOf(t.layer)].open)):passTiles;
    for(const t of shown){const pixels=instance.preview(t.view,t.layer??params.inspectLayer,32,20),ctx=t.canvas.getContext("2d"),image=ctx.createImageData(32,20);image.data.set(pixels);ctx.putImageData(image,0,0);t.button.setAttribute("aria-pressed",String(params.view===t.view&&(!t.layer||params.inspectLayer===t.layer)));}
    if(mode==="fields")drawWires();
  }
  doc.defaultView?.addEventListener("resize",()=>{if(root.open&&mode==="fields")drawWires();});
  show("fields");return {update};
}
