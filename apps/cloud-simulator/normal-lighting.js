/* Purpose: Mount baked lighting with the existing weather inspector. Consumers: normal-lighting.html.
 * Dependencies: shared host, configurable weather inspector, normal-lighting experiment. */
import {mountExperiment} from './core/host.js';
import {mountWeatherInspector} from './weather-inspector.js';
import {normalLighting,nodes,passes} from './normal-lighting-experiment.js';
const page=mountExperiment(normalLighting);
const dependencies={coverage:[],normals:[],depth:[],thickness:[],incoming:[],facing:['normals'],visibility:['depth','thickness'],direct:['incoming','facing','visibility'],diffusion:['coverage','direct']};
const inspector=mountWeatherInspector({doc:document,root:document.getElementById('weather-inspector'),select:next=>page.applyParams({...page.getParams(),view:next.view}),metadata:{nodes,passes,describe:node=>node.description,layers:[{name:'cloud',label:'Baked cloud'}],sourceLabel:'Sky',sourceHelp:'Fixed violet background.',sourceNote:'Baked geometry feeds facing and obstruction independently. Warm direct light and cool ambient reveal folds.',edges:Object.entries(dependencies).flatMap(([to,inputs])=>inputs.map(from=>({from:`cloud:${from}`,to:`cloud:${to}`})))}});
page.instance.onImage=()=>inspector.update({...page.params,inspectLayer:'cloud'},page.instance);
page.render();
