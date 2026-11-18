/* Purpose: Reusable closed cloud solids, independent of layer placement and either view.
 * Consumers: cloud-geometry and tests. Dependencies: decoded image relief for the image solid. */
export const SHAPE_NAMES=['ellipsoid','cluster','wisps','teardrop','image'];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
function bounds(triangles){return [0,1,2].map(c=>[Math.min(...triangles.map(t=>t.min[c])),Math.max(...triangles.map(t=>t.max[c]))]);}
function tree(triangles){
 if(!triangles.length)return null;
 const box=bounds(triangles);if(triangles.length<=8)return {box,triangles};
 const axis=[0,1,2].sort((a,b)=>(box[b][1]-box[b][0])-(box[a][1]-box[a][0]))[0];
 triangles.sort((a,b)=>a.min[axis]+a.max[axis]-b.min[axis]-b.max[axis]);const mid=triangles.length>>1;
 return {box,left:tree(triangles.slice(0,mid)),right:tree(triangles.slice(mid))};
}
export function makeMesh(vertices,faces){
 const normals=vertices.map(()=>[0,0,0]),triangles=[];
 for(const face of faces){const [a,b,c]=face.map(i=>vertices[i]),e1=sub(b,a),e2=sub(c,a),n=cross(e1,e2);if(Math.hypot(...n)<1e-12)continue;
  for(const i of face)for(let k=0;k<3;k++)normals[i][k]+=n[k];
  triangles.push({a,e1,e2,face,normal:unit(n),min:[0,1,2].map(k=>Math.min(a[k],b[k],c[k])),max:[0,1,2].map(k=>Math.max(a[k],b[k],c[k]))});
 }
 return {kind:'mesh',vertices,faces,root:tree(triangles),normals:normals.map(unit)};
}
function boxHit(box,o,d){
 let low=-Infinity,high=Infinity;
 for(let c=0;c<3;c++){if(Math.abs(d[c])<1e-12){if(o[c]<box[c][0]||o[c]>box[c][1])return false;continue;}let a=(box[c][0]-o[c])/d[c],b=(box[c][1]-o[c])/d[c];if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);if(high<low)return false;}
 return high>=0;
}
function meshHits(shape,o,d,withNormals){
 const hits=[];
 function walk(node){if(!node||!boxHit(node.box,o,d))return;
  if(!node.triangles){walk(node.left);walk(node.right);return;}
  for(const tri of node.triangles){const p=cross(d,tri.e2),det=dot(tri.e1,p);if(Math.abs(det)<1e-12)continue;
   const q=sub(o,tri.a),u=dot(q,p)/det;if(u< -1e-8||u>1+1e-8)continue;
   const r=cross(q,tri.e1),v=dot(d,r)/det;if(v< -1e-8||u+v>1+1e-8)continue;
   const t=dot(tri.e2,r)/det;if(t< -1e-8)continue;
   const weights=[1-u-v,u,v],normal=withNormals?unit([0,1,2].map(c=>tri.face.reduce((s,i,k)=>s+shape.normals[i][c]*weights[k],0))):tri.normal;
   hits.push({t:Math.max(0,t),normal,geometricNormal:tri.normal,entering:dot(d,tri.normal)<0});
  }
 }
 walk(shape.root);hits.sort((a,b)=>a.t-b.t);
 // A ray through a shared triangle edge must cross the boundary only once.
 return hits.filter((hit,i)=>!i||Math.abs(hit.t-hits[i-1].t)>1e-7);
}
function ellipsoidInterval(o,d,part,withNormals){
 const q=o.map((v,i)=>(v-part.center[i])/part.radii[i]),v=d.map((x,i)=>x/part.radii[i]);
 const a=dot(v,v),b=dot(q,v),disc=b*b-a*(dot(q,q)-1);if(disc<=0)return [];
 const root=Math.sqrt(disc),start=(-b-root)/a,end=(-b+root)/a;if(end<=0)return [];
 const normal=withNormals?unit(o.map((x,i)=>(x+d[i]*start-part.center[i])/part.radii[i]**2)):[0,0,0];
 return [{start:Math.max(0,start),end,normal,geometricNormal:normal}];
}
export function traceShape(shape,o,d,withNormals=true){
 if(!shape)return [];
 if(shape.kind==='parts'){
  const intervals=shape.parts.flatMap(part=>ellipsoidInterval(o,d,part,withNormals)).sort((a,b)=>a.start-b.start),result=[];
  for(const interval of intervals){const last=result.at(-1);if(last&&interval.start<=last.end+1e-8)last.end=Math.max(last.end,interval.end);else result.push({...interval});}
  return result;
 }
 const hits=meshHits(shape,o,d,withNormals),intervals=[];let entry=null;
 for(const hit of hits){if(hit.entering){entry??=hit;}else {intervals.push({start:entry?.t??0,end:hit.t,normal:entry?.normal??hit.normal,geometricNormal:entry?.geometricNormal??hit.geometricNormal});entry=null;}}
 return intervals.filter(x=>x.end-x.start>1e-7);
}
// Closed swept rings. Ring winding is outward for an increasing axial parameter.
function sweep(point,rings=28,sides=20){
 const vertices=[],faces=[];
 for(let i=0;i<=rings;i++)for(let j=0;j<sides;j++)vertices.push(point(i/rings,j*2*Math.PI/sides));
 for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=b+sides,d=a+sides;faces.push([a,b,c],[a,c,d]);}
 return {vertices,faces};
}
function combine(meshes){const vertices=[],faces=[];for(const mesh of meshes){const offset=vertices.length;vertices.push(...mesh.vertices);faces.push(...mesh.faces.map(f=>f.map(i=>i+offset)));}return makeMesh(vertices,faces);}
const part=(center,radii)=>({center,radii});
const ellipsoid={kind:'parts',parts:[part([0,0,0],[1,1,1])]};
const cluster={kind:'parts',parts:[part([-.46,-.13,.08],[.55,.7,.8]),part([0,.25,-.12],[.55,.8,.95]),part([.5,-.17,.12],[.53,.65,.7])]};
const teardrop=combine([sweep((t,a)=>{
 const r=Math.sin(Math.PI*t),width=r**.7*(.3+.7*t);
 return [Math.cos(a)*width,1-2*t,Math.sin(a)*r*.75];
})]);
const wisps=combine([0,1,2].map(k=>sweep((t,a)=>{
 const radius=Math.sin(Math.PI*t),cy=(k-1)*.55+.17*Math.sin(t*Math.PI*2+k*1.1);
 // Angle around X follows the outward winding of the closed tube.
 return [2*t-1,cy+.10*radius*Math.cos(a),.35*Math.sin(a)*radius];
},32,12)));
wisps.anchor=[0,.17*Math.sin(Math.PI+1.1),0];
export const ANALYTIC_SHAPES={ellipsoid,cluster,teardrop,wisps};
// Image relief is a closed front/back mesh. The mask is thresholded explicitly;
// boundary walls close the outline, so side views and shadow rays see real volume.
export function imageReliefShape(asset){
 if(!asset)return null;
 const nx=32,ny=20,vertices=[],faces=[],active=[];
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
  const i=Math.min(asset.height-1,Math.floor(y/ny*asset.height))*asset.width+Math.min(asset.width-1,Math.floor(x/nx*asset.width));
  const front=-asset.depth[i]/32,back=(asset.thickness[i]-asset.depth[i])/32;
  vertices.push([2*x/nx-1,1-2*y/ny,front],[2*x/nx-1,1-2*y/ny,Math.max(front+.005,back)]);
 }
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const i=Math.min(asset.height-1,Math.floor((y+.5)/ny*asset.height))*asset.width+Math.min(asset.width-1,Math.floor((x+.5)/nx*asset.width));
  active[y*nx+x]=asset.coverage[i]>.18&&asset.thickness[i]>.25;
 }
 const has=(x,y)=>x>=0&&x<nx&&y>=0&&y<ny&&active[y*nx+x];
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(has(x,y)){
  const a=(y*(nx+1)+x)*2,b=a+2,d=a+(nx+1)*2,c=d+2;
  faces.push([a,b,c],[a,c,d],[a+1,c+1,b+1],[a+1,d+1,c+1]);
  for(const [u,v,open] of [[a,b,!has(x,y-1)],[b,c,!has(x+1,y)],[c,d,!has(x,y+1)],[d,a,!has(x-1,y)]])if(open)faces.push([v,u,u+1],[v,u+1,v+1]);
 }
 const mesh=makeMesh(vertices,faces),cell=active.findIndex(Boolean);
 if(cell>=0){const x=cell%nx,y=Math.floor(cell/nx),a=(y*(nx+1)+x)*2,c=a+(nx+1)*2+2;mesh.anchor=[(vertices[a][0]+vertices[c][0])/2,(vertices[a][1]+vertices[c][1])/2,(vertices[a][2]+vertices[c][2]+vertices[a+1][2]+vertices[c+1][2])/4];}
 return mesh;
}
