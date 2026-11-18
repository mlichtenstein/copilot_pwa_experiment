# Purpose: Bake fixed analytic cloud geometry into PNG data maps.
# Consumers: normal-lighting model and contributors. Dependencies: Python, Pillow.
from PIL import Image
from math import sqrt, sin, pi
from pathlib import Path
ROOT = Path(__file__).parent
SIZE = (96, 60)
SHAPES = {'cluster': [(27,35,-5,21,18,24),(47,24,4,19,20,27),(68,35,-8,21,17,22)]}
for name, lobes in SHAPES.items():
    normal = Image.new('RGB', SIZE, (128,128,255))
    geometry = Image.new('RGBA', SIZE, (0,0,0,0))
    for y in range(SIZE[1]):
        for x in range(SIZE[0]):
            hits=[]
            for cx,cy,cz,rx,ry,rz in lobes:
                u,v=(x+.5-cx)/rx,(cy-y-.5)/ry
                q=1-u*u-v*v
                if q<=0: continue
                z=rz*sqrt(q)
                n=(u/rx,v/ry,z/(rz*rz))
                length=sqrt(sum(a*a for a in n))
                hits.append((cz+z,cz-z,tuple(a/length for a in n)))
            if not hits: continue
            front,_,n=max(hits,key=lambda h:h[0])
            back=min(h[1] for h in hits)
            normal.putpixel((x,y),tuple(round((a+1)*127.5) for a in n))
            geometry.putpixel((x,y),(round((front+32)*255/64),round((front-back)*255/64),0,255))
    normal.save(ROOT/f'{name}-normal.png')
    geometry.save(ROOT/f'{name}-geometry.png')
# Curved, feathered ribbons and a pointed drop: bake their height gradients once.
from PIL import ImageFilter
for name in ['wisps','teardrop','image']:
    heights=[[0.0]*96 for _ in range(60)]
    alpha=[[0.0]*96 for _ in range(60)]
    if name=='image':
        mask=Image.open(ROOT.parent/'textures/FX_CloudAlpha01.jpg').convert('L').resize(SIZE)
        relief=mask.filter(ImageFilter.GaussianBlur(.55))
    for y in range(60):
        for x in range(96):
            if name=='image':
                m=mask.getpixel((x,y))/255
                # Amplify the relief and preserve smaller lobes lost in the old blur.
                heights[y][x]=30*(relief.getpixel((x,y))/255)**.65
                alpha[y][x]=min(1,sqrt(m)*1.4)
            elif name=='teardrop':
                t=(y-5)/49
                if 0<t<1:
                    radius=24*sin(pi*t)**.7*(.3+.7*t)
                    q=1-((x-48)/radius)**2
                    if q>0:
                        heights[y][x]=23*sin(pi*t)*sqrt(q)
                        alpha[y][x]=min(1,q*8)
            else:
                for offset,phase in [(18,0),(31,1.1),(43,2.2)]:
                    t=(x-7)/82
                    if not 0<t<1: continue
                    center=offset+5*sin(t*2*pi+phase)
                    halfwidth=.6+1.2*sin(pi*t)**2
                    q=1-((y+.5-center)/halfwidth)**2
                    if q>0:
                        heights[y][x]=max(heights[y][x],2.5*sqrt(q)*sin(pi*t))
                        alpha[y][x]=max(alpha[y][x],min(1,q*2)*sin(pi*t)**.5)
    normal=Image.new('RGB',SIZE,(128,128,255));geometry=Image.new('RGBA',SIZE)
    for y in range(60):
        for x in range(96):
            dx=(heights[y][min(95,x+1)]-heights[y][max(0,x-1)])/2
            dy=(heights[min(59,y+1)][x]-heights[max(0,y-1)][x])/2
            n=(-dx,dy,1);length=sqrt(sum(v*v for v in n))
            normal.putpixel((x,y),tuple(round((v/length+1)*127.5) for v in n))
            z=heights[y][x]
            geometry.putpixel((x,y),(round((z+32)*255/64),round(z*255/64),0,round(alpha[y][x]*255)))
    normal.save(ROOT/f'{name}-normal.png');geometry.save(ROOT/f'{name}-geometry.png')

# Two-scale normals: preserve smooth analytic shape; smooth image HEIGHT, not RGB normals.
# Fine analytic ripples are shading-only relief: the shadow envelope is unchanged.
for name in ['cluster','wisps','teardrop','image']:
    original=Image.open(ROOT/f'{name}-normal.png').copy()
    broad=original.copy()
    if name=='image':
        source=Image.open(ROOT.parent/'textures/FX_CloudAlpha01.jpg').convert('L').resize(SIZE)
        smooth=source.filter(ImageFilter.GaussianBlur(3))
        h=[[30*(smooth.getpixel((x,y))/255)**.65 for x in range(96)] for y in range(60)]
        for y in range(60):
            for x in range(96):
                dx=(h[y][min(95,x+1)]-h[y][max(0,x-1)])/2
                dy=(h[min(59,y+1)][x]-h[max(0,y-1)][x])/2
                n=(-dx,dy,1);length=sqrt(sum(v*v for v in n))
                broad.putpixel((x,y),tuple(round((v/length+1)*127.5) for v in n))
    elif name in ['cluster','teardrop']:
        # Small deterministic bumps perturb slope while retaining broad-facing direction.
        from math import cos
        for y in range(60):
            for x in range(96):
                nx,ny,nz=[c/127.5-1 for c in original.getpixel((x,y))]
                dx=.32*cos(x*.8)*sin(y*.65)
                dy=.26*sin(x*.8)*cos(y*.65)
                n=(nx-dx*nz,ny+dy*nz,nz);length=sqrt(sum(v*v for v in n))
                original.putpixel((x,y),tuple(round((v/length+1)*127.5) for v in n))
    broad.save(ROOT/f'{name}-broad-normal.png')
    original.save(ROOT/f'{name}-normal.png')
