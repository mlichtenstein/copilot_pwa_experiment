# Purpose: Bake fixed analytic cloud geometry into PNG data maps.
# Consumers: normal-lighting model and contributors. Dependencies: Python, Pillow.
from PIL import Image
from math import sqrt
from pathlib import Path
ROOT = Path(__file__).parent
SIZE = (96, 60)
SHAPES = {'sphere': [(48,30,0,23,23,23)],
          'cluster': [(28,34,0,20,18,18),(47,24,4,20,20,20),(66,34,0,22,18,18)],
          'wisps': [(25,36,0,23,4,3),(48,29,1,27,5,4),(72,23,0,20,3,2)]}
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
# Interpret an existing CC0 opacity image as a relief, not measured cloud geometry.
from PIL import ImageFilter
mask=Image.open(ROOT.parent/'textures/FX_CloudAlpha01.jpg').convert('L').resize(SIZE)
relief=mask.filter(ImageFilter.GaussianBlur(2))
normal=Image.new('RGB',SIZE,(128,128,255));geometry=Image.new('RGBA',SIZE)
for y in range(SIZE[1]):
    for x in range(SIZE[0]):
        z=relief.getpixel((x,y))*18/255
        dx=(relief.getpixel((min(95,x+1),y))-relief.getpixel((max(0,x-1),y)))*9/255
        dy=(relief.getpixel((x,min(59,y+1)))-relief.getpixel((x,max(0,y-1))))*9/255
        n=(-dx,dy,1);length=sqrt(sum(v*v for v in n))
        normal.putpixel((x,y),tuple(round((v/length+1)*127.5) for v in n))
        geometry.putpixel((x,y),(round((z+32)*255/64),round(z*255/64),0,mask.getpixel((x,y))))
normal.save(ROOT/'image-normal.png');geometry.save(ROOT/'image-geometry.png')
