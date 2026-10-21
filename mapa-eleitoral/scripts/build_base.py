import sys,json,re,unicodedata,collections,pyarrow.parquet as pq,shapely
from shapely.ops import unary_union
S=sys.argv[1]
def norm(s):
    s=unicodedata.normalize('NFD',s.upper()); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    s=re.sub(r'\(.*?\)','',s); s=re.sub(r'^(BAIRRO|LOTEAMENTO|DISTRITO) ','',s.strip()); return re.sub(r'\s+',' ',s).strip()
Q=1e5
def enc_line(coords):
    out=[];px=py=0
    for x,y in coords:
        X=round(x*Q);Y=round(y*Q);out+= [X-px,Y-py];px,py=X,Y
    return out
def enc_geom(g):  # lista de anéis/linhas
    if g.is_empty: return []
    if g.geom_type in('Polygon',): return [enc_line(g.exterior.coords)]+[enc_line(r.coords) for r in g.interiors]
    if g.geom_type=='LineString': return [enc_line(g.coords)]
    out=[]
    for p in getattr(g,'geoms',[]): out+=enc_geom(p)
    return out
def bb(g): x0,y0,x1,y1=g.bounds; return [round(x0,4),round(y0,4),round(x1,4),round(y1,4)]

d=pq.read_table(S+'/ov/div.parquet').to_pylist()
loc={(r['names'] or {}).get('primary'):shapely.from_wkb(r['geometry']).buffer(0) for r in d if r['subtype']=='locality'}
J=loc['Juazeiro']
# bairros reais dentro de Juazeiro (sem condomínios/praças), mesmo nome unido
grp=collections.defaultdict(list); nomes={}
for r in d:
    if r['subtype'] not in('neighborhood','macrohood','microhood'): continue
    nm=(r['names'] or {}).get('primary') or ''
    g=shapely.from_wkb(r['geometry']).buffer(0)
    if not J.contains(g.representative_point()): continue
    k=norm(nm)
    if re.match(r'^(CONDOMINIO|PRACA|RESIDENCIAL|JUA GARDEN|FACULDADE)',k): continue
    grp[k].append(g); nomes.setdefault(k,re.sub(r'^(Bairro|Loteamento) ','',re.sub(r'\s*\(.*?\)','',nm)).strip())
bairrosOSM={k:unary_union(v) for k,v in grp.items()}
# junta grafias duplicadas
for a,b in [('LOMANTO JUINIOR','LOMANTO JUNIOR'),('ANTONIO GUILHERMINIO','ANTONIO GUILHERMINO'),('COUNTRY CLUB','COUNTRY CLUBE'),('EXPEDITO NASCIMENTO','EXPEDITO DE ALMEIDA NASCIMENTO'),('NOVA JUZEIRO','NOVO JUAZEIRO'),('ALTO MARAVILHA','ALTO DA MARAVILHA'),('PEDRO RAUMINDO','PEDRO RAIMUNDO')]:
    if a in bairrosOSM:
        bairrosOSM[b]=unary_union([bairrosOSM.pop(a)]+([bairrosOSM[b]] if b in bairrosOSM else [])); nomes.setdefault(b,nomes[a])
nomes['LOMANTO JUNIOR']='Lomanto Júnior'; nomes['COUNTRY CLUBE']='Country Club'; nomes['ANTONIO GUILHERMINO']='Antônio Guilhermino'; nomes['NOVO JUAZEIRO']='Novo Juazeiro'

html=open(S+'/mapa/mapa-eleitoral-juazeiro.html',encoding='utf-8').read()
i=html.index('let GEOJSON ');base=json.loads(html[html.index('=',i)+1:html.index('\n',i)].strip().rstrip(';'))
alias={'COUNTRY CLUB':'COUNTRY CLUBE','CARNAIBA':'CARNAIBA DO SERTAO'}
zonas=[];centros={};sem=[]
for f in base['features']:
    b=f['properties']['bairro'];k=alias.get(norm(b),norm(b))
    g=bairrosOSM.get(k)
    if g is None: sem.append(b); continue
    zonas.append({'type':'Feature','properties':{'bairro':b},'geometry':shapely.geometry.mapping(shapely.set_precision(g.simplify(0.00003),1e-5))})
    p=g.representative_point() if g.area<0.001 else g.centroid
    if not g.contains(p): p=g.representative_point()
    centros[b]=[round(p.x,5),round(p.y,5)]
print('sem contorno:',sem)
lim={'municipio':{'type':'Feature','properties':{'nome':'Juazeiro'},'geometry':shapely.geometry.mapping(shapely.set_precision(J.simplify(0.0005),1e-4))},
     'zonas':zonas,'centros':centros}
open(S+'/geo/limites_reais.json','w',encoding='utf-8').write(json.dumps(lim,ensure_ascii=False,separators=(',',':')))

# ── mapa de fundo
CL=['trunk','primary','secondary','tertiary','unclassified','residential','living_street','unknown','service']
roads=[]
for r in pq.read_table(S+'/ov/seg.parquet',columns=['class','names','geometry']).to_pylist():
    if r['class'] not in CL: continue
    g=shapely.from_wkb(r['geometry']).simplify(0.00002)
    nm=(r['names'] or {}).get('primary') if r['class'] in('trunk','primary','secondary','tertiary') else None
    roads.append([CL.index(r['class']),bb(g),enc_geom(g)]+([nm] if nm else []))
WP=[];WL=[]
for r in pq.read_table(S+'/ov/water.parquet',columns=['subtype','class','names','geometry']).to_pylist():
    g=shapely.from_wkb(r['geometry'])
    if r['class'] in('swimming_pool','sewage'): continue
    if g.geom_type in('Polygon','MultiPolygon'):
        tol=0.0002 if g.area>0.1 else 0.00004
        g=g.simplify(tol)
        if g.area<2e-7: continue
        WP.append([bb(g),enc_geom(g)])
    elif g.geom_type in('LineString','MultiLineString'):
        if r['class'] not in('river','canal','stream'): continue
        g=g.simplify(0.00004); WL.append([1 if r['class']=='canal' else 0,bb(g),enc_geom(g)])
bairros=[[nomes[k],bb(g),enc_geom(g.simplify(0.00003)),[round(g.representative_point().x,5),round(g.representative_point().y,5)],round(g.area*1e6)] for k,g in bairrosOSM.items()]
cidades=[['Juazeiro',[-40.4995,-9.4135]],['Petrolina',[-40.5005,-9.3915]]]
basemap={'q':Q,'classes':CL,'roads':roads,'waterPoly':WP,'waterLine':WL,'bairros':bairros,'cidades':cidades}
s=json.dumps(basemap,ensure_ascii=False,separators=(',',':'))
open(S+'/pub/basemap.json','w',encoding='utf-8').write(s)
print('basemap MB',round(len(s)/1e6,2),'roads',len(roads),'wp',len(WP),'wl',len(WL),'bairros',len(bairros))
