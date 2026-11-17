/* Purpose: Verify shared shape topology, layer independence and distant-source inspection.
 * Consumers: Node test runner. Dependencies: shape library, world model, workbench migration. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANALYTIC_SHAPES,imageReliefShape,traceShape} from './cloud-shapes.js';
import {createCloudScene,rayCloud,localToWorld,opticalDepth,sideSilhouettes,sideLightMarker,sidePixel,CAMERA,SOURCE_DIAL,renderCloudScene,pickCloud,projectDirection} from './cloud-geometry.js';
import {migrateLayerShapes} from './normal-lighting-experiment.js';
const image=imageReliefShape({width:2,height:2,coverage:[1,1,1,1],depth:[16,16,16,16],thickness:[32,32,32,32]});
const shapes={...ANALYTIC_SHAPES,image};
test('all shapes are closed from front, side and inside, with outward entry normals',()=>{
 for(const [name,shape] of Object.entries(shapes)){
  const anchor=shape.anchor??[0,0,0];
  for(const axis of [0,2]){const d=[0,0,0];d[axis]=1;const o=anchor.map((v,i)=>v-3*d[i]);const hit=traceShape(shape,o,d)[0];assert.ok(hit,`${name} axis ${axis}`);assert.ok(hit.end>hit.start);assert.ok(hit.geometricNormal[axis]<0,`${name} entry normal`);
   const inside=traceShape(shape,anchor,d)[0];assert.ok(inside,`${name} inside`);assert.equal(inside.start,0);assert.ok(inside.end>0);
  }
 }
});
test('overlapping cluster lobes form a union, not added optical thickness',()=>{
 const intervals=traceShape(shapes.cluster,[0,0,-3],[0,0,1]);assert.equal(intervals.length,1);assert.ok(intervals[0].end-intervals[0].start<2);
});
test('layer shape changes preserve placements and other shapes',()=>{
 const before=createCloudScene({nearShape:'cluster',middleShape:'wisps',farShape:'image'},shapes);
 const after=createCloudScene({nearShape:'teardrop',middleShape:'wisps',farShape:'image'},shapes);
 assert.deepEqual(before.clouds.map(c=>[c.center,c.radii,c.yaw]),after.clouds.map(c=>[c.center,c.radii,c.yaw]));
 assert.equal(before.clouds[1].shape,after.clouds[1].shape);assert.equal(before.clouds[2].shape,after.clouds[2].shape);assert.notEqual(before.clouds[0].shape,after.clouds[0].shape);
});
test('yaw transforms geometry consistently for intersections, picking and obstruction',()=>{
 for(const shapeName of Object.keys(shapes))for(const yaw of [-60,0,60]){
  const world=createCloudScene({nearShape:shapeName,nearYaw:yaw},shapes),cloud=world.clouds[0],p=localToWorld(cloud,cloud.shape.anchor??[0,0,0]);
  const vector=p.map((v,i)=>v-world.camera.position[i]),norm=Math.hypot(...vector),d=vector.map(v=>v/norm),hits=rayCloud(cloud,world.camera.position,d);
  assert.ok(hits.length,`${shapeName} ${yaw}`);assert.ok(opticalDepth({clouds:[cloud]},world.camera.position,d,1)>0);
  assert.equal(pickCloud(world,...projectDirection(vector)),cloud.id);
 }
});
test('side silhouettes come from the chosen solids, including image relief',()=>{
 const sums=[];
 for(const shapeName of Object.keys(shapes)){
  const world=createCloudScene({nearShape:shapeName,middleShape:shapeName,farShape:shapeName},shapes),masks=sideSilhouettes(world);
  assert.ok(masks.every(mask=>mask.some(Boolean)),shapeName);sums.push(masks[0].reduce((s,x)=>s+x,0));
 }
 assert.ok(new Set(sums).size>=4,'different shapes have different side profiles');
});
test('mixed shapes produce finite fields and transmitted light',()=>{
 const world=createCloudScene({nearShape:'cluster',middleShape:'wisps',farShape:'image'},shapes);
 const fields=renderCloudScene(world,{}, {azimuth:15,elevation:20},48,30);
 for(const field of Object.values(fields))assert.ok(field.every(Number.isFinite));assert.ok(fields.transmission.some(v=>v>0));
});
test('legacy global shapes migrate without overriding new independent choices',()=>{
 assert.deepEqual(migrateLayerShapes({cloudShape:'image',nearShape:'wisps'}),{nearShape:'wisps',middleShape:'image',farShape:'image'});
 assert.deepEqual(migrateLayerShapes({cloudShape:'layers'}),{nearShape:'ellipsoid',middleShape:'ellipsoid',farShape:'ellipsoid'});
 assert.deepEqual(migrateLayerShapes({nearShape:'cluster',middleShape:'teardrop'}),{nearShape:'cluster',middleShape:'teardrop'});
});
test('sun marker keeps fixed angular radius and the true projected angle',()=>{
 const {x:cx,y:cy,radius}=SOURCE_DIAL;
 for(const elevation of [-90,-20,0,20,90])for(const azimuth of [-180,-90,0,90,180]){
  const p=sideLightMarker({azimuth,elevation});assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!p.outOfPlane){assert.ok(Math.abs(Math.hypot(p.x-cx,p.y-cy)-radius)<1e-9);const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;assert.ok(Math.abs((p.x-cx)*Math.sin(e)+(p.y-cy)*Math.cos(a)*Math.cos(e))<1e-9);}
 }
 assert.equal(sideLightMarker({azimuth:0,elevation:0}).y,cy);
 assert.ok(sideLightMarker({azimuth:0,elevation:-20}).y>cy);
 assert.ok(sideLightMarker({azimuth:0,elevation:20}).y<cy);
 assert.ok(sideLightMarker({azimuth:180,elevation:0}).x<cx);
 assert.equal(sideLightMarker({azimuth:90,elevation:0}).outOfPlane,true);
});
