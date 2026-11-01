/* Purpose: Shade baked cloud maps without deriving runtime normals.
 * Consumers: normal-lighting experiment and tests. Dependencies: decoded RGB normal/RGBA geometry arrays. */
export const clamp=x=>Math.max(0,Math.min(1,x));
export function facing(mu,model="lambert",wrap=.4){return model==="wrapped"?clamp((mu+wrap)/(1+wrap)):Math.max(0,mu);}
export function decodeMaps(normal,geometry,width,height){
  const count=width*height,normals=new Float32Array(count*3),depth=new Float32Array(count),thickness=new Float32Array(count),coverage=new Float32Array(count);
  for(let i=0;i<count;i++){
    let length=0;for(let c=0;c<3;c++){const v=normal[i*4+c]/127.5-1;normals[i*3+c]=v;length+=v*v;}
    length=Math.sqrt(length)||1;for(let c=0;c<3;c++)normals[i*3+c]/=length;
    depth[i]=geometry[i*4]*64/255-32;thickness[i]=geometry[i*4+1]*64/255;coverage[i]=geometry[i*4+3]/255;
  }
  return {width,height,normals,depth,thickness,coverage};
}
export function shadeCloud(asset,params={}){
  const {width,height,normals,depth,thickness,coverage}=asset,count=width*height;
  const {azimuth=-40,elevation=25,model="lambert",wrap=.4,gradientPosition=.5,gradientCompression=3,gradientStrength=1,diffusionAmount=.25,diffusionDistance=3}=params;
  const sunlight=clamp((elevation+6)/10);
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180,l=[Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)];
  const fields={incoming:new Float32Array(count*3),facing:new Float32Array(count),visibility:new Float32Array(count),direct:new Float32Array(count*3),diffusion:new Float32Array(count*3),scene:new Float32Array(count*3)};
  for(let i=0;i<count;i++){
    const x=i%width,y=Math.floor(i/width),t=clamp(((1-y/height)-gradientPosition)*gradientCompression+.5);
    const warm=[1,.035+.45*t,.02+.18*t];
    for(let c=0;c<3;c++)fields.incoming[i*3+c]=sunlight*(1+(warm[c]-1)*gradientStrength);
    if(!coverage[i])continue;
    const mu=l.reduce((sum,v,c)=>sum+v*normals[i*3+c],0);fields.facing[i]=facing(mu,model,wrap);
    let optical=0;
    for(let step=1;step<100;step++){
      const xx=Math.floor(x+.5+l[0]*step),yy=Math.floor(y+.5-l[1]*step),z=depth[i]+l[2]*step;
      if(xx<0||xx>=width||yy<0||yy>=height)break;
      const j=yy*width+xx;
      if(coverage[j]&&z<depth[j]-.5&&z>depth[j]-thickness[j])optical+=.18*coverage[j];
    }
    fields.visibility[i]=Math.exp(-optical);
    for(let c=0;c<3;c++){
      const ramp=[[.12,.025,.25],[1,.025,.045],[1,.6,.12]],u=clamp((mu+1)/2)*2,k=Math.min(1,Math.floor(u)),f=u-k;
      fields.direct[i*3+c]=(model==="ramp"?sunlight*(ramp[k][c]*(1-f)+ramp[k+1][c]*f):fields.incoming[i*3+c]*fields.facing[i])*fields.visibility[i];
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
    fields.scene[i*3+c]=sky*(1-coverage[i])+coverage[i]*(ambient+fields.direct[i*3+c]+fields.diffusion[i*3+c]);
  }
  return fields;
}
