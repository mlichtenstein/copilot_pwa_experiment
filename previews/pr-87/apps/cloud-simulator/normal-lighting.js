/* Purpose: Mount lighting, a linked side elevation and the field inspector. Consumers: normal-lighting.html.
 * Dependencies: shared host, configurable weather inspector, normal-lighting experiment. */
import {mountCloudSideView} from './cloud-side-view.js';
import {mountExperiment} from './core/host.js';
import {mountWeatherInspector} from './weather-inspector.js';
import {normalLighting,nodes,passes} from './normal-lighting-experiment.js';
const page=mountExperiment(normalLighting);
const side=mountCloudSideView({doc:document,root:document.getElementById('geometry-side'),canvas:document.getElementById('sky'),instance:page.instance,help:page.help,render:()=>page.render()});
const dependencies={earthLight:[],transmission:['depth','thickness'],coverage:[],normals:[],broadNormals:[],colorCoordinate:['broadNormals'],depth:[],thickness:[],incoming:['colorCoordinate','earthLight'],facing:['normals'],visibility:['depth','thickness'],direct:['incoming','facing','visibility'],diffusion:['coverage','transmission','colorCoordinate','earthLight']};
const inspector=mountWeatherInspector({doc:document,help:page.help,root:document.getElementById('weather-inspector'),select:next=>page.applyParams({...page.getParams(),...next}),metadata:{nodes,passes,describe:node=>node.description,layers:[{name:'cloud',label:'Cloud geometry'}],sourceLabel:'Sky',sourceHelp:'Sky and distant light before cloud attenuation.',sourceNote:'Geometry feeds normals, obstruction and transmission. Each layer has an independent shape; the side view shares those solids.',edges:Object.entries(dependencies).flatMap(([to,inputs])=>inputs.map(from=>({from:`cloud:${from}`,to:`cloud:${to}`})))}});
page.instance.onImage=()=>{inspector.update({...page.params,inspectLayer:'cloud'},page.instance);side.update();};
page.render();
