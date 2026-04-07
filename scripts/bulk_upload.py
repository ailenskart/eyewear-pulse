import json, urllib.request, subprocess, os, sys, time

BLOB_TOKEN = os.environ["BLOB_READ_WRITE_TOKEN"]
FEED = "/home/user/eyewear-pulse/src/data/scraped-feed.json"
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def dl(url, t=20):
    try:
        r = urllib.request.Request(url, headers={'User-Agent':UA,'Accept':'*/*'})
        with urllib.request.urlopen(r, timeout=t) as resp:
            d = resp.read(); return d if len(d)>500 else None
    except: return None

def up(data, path, ct):
    tmp = '/home/user/eyewear-pulse/scripts/_bu.tmp'
    open(tmp,'wb').write(data)
    try:
        r = subprocess.run(['curl','-s','-X','PUT',f'https://blob.vercel-storage.com/{path}',
            '-H',f'Authorization: Bearer {BLOB_TOKEN}','-H','x-api-version: 7',
            '-H',f'Content-Type: {ct}','-H',f'x-content-type: {ct}',
            '--data-binary',f'@{tmp}'], capture_output=True,text=True,timeout=60)
        return json.loads(r.stdout).get('url')
    except: return None
    finally:
        try: os.remove(tmp)
        except: pass

posts = json.load(open(FEED))
total = len(posts)
io=vo=so=ie=ve=0

for i,p in enumerate(posts):
    pid=str(p.get('id',p.get('shortCode',i)))
    
    if not p.get('blobUrl'):
        url=(p.get('images')or[None])[0]or p.get('displayUrl')
        if url:
            d=dl(url)
            if d:
                u=up(d,f'posts/{pid}.jpg','image/jpeg')
                if u:p['blobUrl']=u;io+=1
                else:ie+=1
            else:ie+=1

    if p.get('videoUrl') and not p.get('videoBlobUrl'):
        d=dl(p['videoUrl'],45)
        if d and len(d)<20*1024*1024:
            u=up(d,f'posts/video_{pid}.mp4','video/mp4')
            if u:p['videoBlobUrl']=u;vo+=1
            else:ve+=1
        else:ve+=1

    ch=p.get('childPosts',[])
    if ch and not p.get('carouselSlides'):
        sl=[]
        for j,c in enumerate(ch):
            cu=c.get('displayUrl')
            if cu:
                cd=dl(cu)
                if cd:
                    cid=c.get('id',f'{pid}_{j}')
                    cu2=up(cd,f'posts/slide_{cid}.jpg','image/jpeg')
                    if cu2:sl.append({'url':cu2,'type':c.get('type','Image')});so+=1
            if c.get('videoUrl'):
                vd=dl(c['videoUrl'],45)
                if vd and len(vd)<20*1024*1024:
                    cid=c.get('id',f'{pid}_{j}')
                    vu=up(vd,f'posts/video_slide_{cid}.mp4','video/mp4')
                    if vu:sl.append({'url':vu,'type':'Video'});vo+=1
        if sl:p['carouselSlides']=sl

    if(i+1)%50==0:
        print(f'[{i+1}/{total}] img:{io} vid:{vo} slides:{so} | fail img:{ie} vid:{ve}',flush=True)
        json.dump(posts,open(FEED,'w'))

json.dump(posts,open(FEED,'w'))
print(f'\nDONE img:{io} vid:{vo} slides:{so} | fail img:{ie} vid:{ve}',flush=True)
