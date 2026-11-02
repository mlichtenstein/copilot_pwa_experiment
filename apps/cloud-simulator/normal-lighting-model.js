/* Purpose: Shade baked cloud maps without deriving runtime normals.
 * Consumers: normal-lighting experiment and tests. Dependencies: decoded RGB normal/RGBA geometry arrays. */
export const clamp=x=>Math.max(0,Math.min(1,x));
// Linear-light control palettes; interpolation happens before display encoding.
export const palettes={sunset:[[.16,.015,.4],[.65,.015,.4],[1,.015,.03],[1,.2,.01],[1,.85,.12]],spectrum:[[.3,.01,.6],[.02,.06,1],[0,.7,.9],[.03,.7,.06],[1,.9,.03],[1,.22,.01],[1,.01,.02]],bicolor:[[1,.035,.02],[1,.485,.2]],moon:[[.035,.015,.1],[.12,.18,.32],[.6,.7,.85]]};
export function gradientColor(position,params={}){
 const {gradientKind='sunset',gradientStart=0,gradientEnd=1,gradientWarp=1,gradientPosition=.5,gradientCompression=3,lightSource='sun'}=params;
 const palette=palettes[gradientKind==='auto'?(lightSource==='moon'?'moon':'sunset'):gradientKind]??palettes.sunset;
 const t=Math.pow(clamp((position-gradientPosition)*gradientCompression+.5),gradientWarp);
 const u=clamp(gradientStart+(gradientEnd-gradientStart)*t)*(palette.length-1),k=Math.min(palette.length-2,Math.floor(u)),f=u-k;
 return palette[k].map((v,c)=>v*(1-f)+palette[k+1][c]*f);
}
export function facing(mu,model="lambert",wrap=.4){return model==="wrapped"?clamp((mu+wrap)/(1+wrap)):Math.max(0,mu);}
export function decodeMaps(normal,geometry,width,height,broadNormal=normal){
  const count=width*height,normals=new Float32Array(count*3),broadNormals=new Float32Array(count*3),depth=new Float32Array(count),thickness=new Float32Array(count),coverage=new Float32Array(count);
  for(let i=0;i<count;i++){
    let length=0;for(let c=0;c<3;c++){const v=normal[i*4+c]/127.5-1;normals[i*3+c]=v;length+=v*v;}
    length=Math.sqrt(length)||1;for(let c=0;c<3;c++)normals[i*3+c]/=length;
    let broadLength=0;for(let c=0;c<3;c++){const v=broadNormal[i*4+c]/127.5-1;broadNormals[i*3+c]=v;broadLength+=v*v;}
    broadLength=Math.sqrt(broadLength)||1;for(let c=0;c<3;c++)broadNormals[i*3+c]/=broadLength;
    depth[i]=geometry[i*4]*64/255-32;thickness[i]=geometry[i*4+1]*64/255;coverage[i]=geometry[i*4+3]/255;
  }
  return {width,height,normals,broadNormals,depth,thickness,coverage};
}
export function shadeCloud(asset,params={}){
  const {width,height,normals,broadNormals=normals,depth,thickness,coverage}=asset,count=width*height;
  const {azimuth=-40,elevation=25,model="lambert",wrap=.4,heightInfluence=1,broadNormalInfluence=.35,detailShadingStrength=1,gradientStrength=1,diffusionAmount=.25,diffusionDistance=3}=params;
  const moon=params.lightSource==='moon',brightness=moon?(params.nightBrightness??.45):1,saturation=moon?(params.nightSaturation??.45):1;
  const sunlight=clamp((elevation+6)/10)*brightness;
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180,l=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
  const fields={colorCoordinate:new Float32Array(count),incoming:new Float32Array(count*3),facing:new Float32Array(count),visibility:new Float32Array(count),direct:new Float32Array(count*3),diffusion:new Float32Array(count*3),sky:new Float32Array(count*3),ambient:new Float32Array(count*3),ambientPass:new Float32Array(count*3),directPass:new Float32Array(count*3),directAdded:new Float32Array(count*3),diffusionAdded:new Float32Array(count*3),scene:new Float32Array(count*3)};
  for(let i=0;i<count;i++){
    const x=i%width,y=Math.floor(i/width);
    const broadFacing=coverage[i]?l.reduce((sum,v,c)=>sum+v*broadNormals[i*3+c],0):0;
    const coordinate=.5+heightInfluence*((1-(y+.5)/height)-.5)+broadNormalInfluence*broadFacing;
    fields.colorCoordinate[i]=clamp(coordinate);
    const warm=gradientColor(coordinate,params);
    for(let c=0;c<3;c++)fields.incoming[i*3+c]=sunlight*(1+(warm[c]-1)*gradientStrength);
    if(!coverage[i])continue;
    const mu=l.reduce((sum,v,c)=>sum+v*normals[i*3+c],0);fields.facing[i]=1-detailShadingStrength+detailShadingStrength*facing(mu,model,wrap);
    let optical=0;
    for(let step=1;step<100;step++){
      const xx=Math.floor(x+.5+l[0]*step),yy=Math.floor(y+.5-l[1]*step),z=depth[i]+l[2]*step;
      if(xx<0||xx>=width||yy<0||yy>=height)break;
      const j=yy*width+xx;
      if(coverage[j]&&z<depth[j]-.5&&z>depth[j]-thickness[j])optical+=.18*coverage[j];
    }
    fields.visibility[i]=Math.exp(-optical);
    for(let c=0;c<3;c++){
      fields.direct[i*3+c]=fields.incoming[i*3+c]*(model==="ramp"?1:fields.facing[i])*fields.visibility[i];
    }
  }
  const radius=Math.max(0,Math.round(diffusionDistance));
  for(let i=0;i<count;i++)for(let c=0;c<3;c++){
    const x=i%width,y=Math.floor(i/width);let sum=0,weight=0;
    if(coverage[i]&&diffusionAmount>0)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
      const j=yy*width+xx;sum+=fields.direct[j*3+c]*coverage[j];weight+=coverage[j];
    }
    fields.diffusion[i*3+c]=weight?diffusionAmount*sum/weight:0;
    const sky=[.07,.035,.13][c],ambient=[.09,.035,.17][c];
    const j=i*3+c;
    fields.sky[j]=sky*brightness;
    fields.ambient[j]=coverage[i]*ambient*brightness;
    fields.ambientPass[j]=fields.sky[j]*(1-coverage[i])+fields.ambient[j];
    fields.directAdded[j]=params.directEnabled===false?0:coverage[i]*fields.direct[j];
    fields.diffusionAdded[j]=params.diffusionEnabled===false?0:coverage[i]*fields.diffusion[j];
    fields.directPass[j]=fields.ambientPass[j]+fields.directAdded[j];
    fields.scene[j]=fields.directPass[j]+fields.diffusionAdded[j];
  }
  if(moon)for(const name of ['incoming','direct','diffusion','sky','ambient','ambientPass','directAdded','diffusionAdded','directPass','scene']){
    const f=fields[name];for(let i=0;i<count;i++){const j=i*3,gray=.2126*f[j]+.7152*f[j+1]+.0722*f[j+2];for(let c=0;c<3;c++)f[j+c]=gray+(f[j+c]-gray)*saturation;}
  }
  return fields;
}
