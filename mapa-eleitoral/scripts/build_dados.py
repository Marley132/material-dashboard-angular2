import sys,json,re,csv,unicodedata,collections,pyarrow.parquet as pq,shapely
from shapely.ops import unary_union
from shapely.geometry import Point, mapping
S=sys.argv[1]; T=S+'/tse/'
rd=lambda f:csv.DictReader(open(T+f,encoding='utf-8'),delimiter=';')
def norm(s):
    s=unicodedata.normalize('NFD',s.upper()); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    s=re.sub(r'\(.*?\)','',s); s=re.sub(r'^(BAIRRO|LOTEAMENTO|DISTRITO|POVOADO) ','',s.strip()); return re.sub(r'\s+',' ',s).strip()
MIN=set('de da do das dos e'.split())
def titulo(s):
    w=s.lower().split(); return ' '.join(x if (i and x in MIN) else (x.upper() if re.fullmatch(r'[ivx]+',x) else x[:1].upper()+x[1:]) for i,x in enumerate(w))

# ── bairros: partição sem sobreposição dos contornos do OpenStreetMap (Overture)
d=pq.read_table(S+'/ov/div.parquet').to_pylist()
J=[shapely.from_wkb(r['geometry']).buffer(0) for r in d if r['subtype']=='locality' and (r['names'] or {}).get('primary')=='Juazeiro'][0]
grp=collections.defaultdict(list); nomes={}
for r in d:
    if r['subtype'] not in('neighborhood','macrohood','microhood'): continue
    nm=(r['names'] or {}).get('primary') or ''; g=shapely.from_wkb(r['geometry']).buffer(0)
    if not J.contains(g.representative_point()): continue
    k=norm(nm)
    if re.match(r'^(CONDOMINIO|PRACA|RESIDENCIAL|JUA GARDEN|FACULDADE|PEDE)',k): continue
    grp[k].append(g.intersection(J)); nomes.setdefault(k,nm)
ALIAS={'LOMANTO JUINIOR':'LOMANTO JUNIOR','ANTONIO GUILHERMINIO':'ANTONIO GUILHERMINO','COUNTRY CLUB':'COUNTRY CLUBE',
 'EXPEDITO NASCIMENTO':'EXPEDITO DE ALMEIDA NASCIMENTO','NOVA JUZEIRO':'NOVO JUAZEIRO','ALTO MARAVILHA':'ALTO DA MARAVILHA',
 'PEDRO RAUMINDO':'PEDRO RAIMUNDO','INDUSTRIAL':'DISTRITO INDUSTRIAL','MARIA GORETE':'SANTA MARIA GORETTI'}
for a,b in ALIAS.items():
    if a in grp: grp[b]+=grp.pop(a); nomes.setdefault(b,nomes.pop(a))
NOME_FIXO={'LOMANTO JUNIOR':'Lomanto Júnior','COUNTRY CLUBE':'Country Club','ANTONIO GUILHERMINO':'Antônio Guilhermino',
 'NOVO JUAZEIRO':'Novo Juazeiro','DISTRITO INDUSTRIAL':'Distrito Industrial','CARNAIBA DO SERTAO':'Carnaíba do Sertão',
 'SANTA MARIA GORETTI':'Santa Maria Goretti','JOAO XXIII':'João XXIII','JOAO PAULO II':'João Paulo II','PEDRO RAIMUNDO':'Pedro Raimundo'}
polys=[]
for k,gs in grp.items():
    g=unary_union(gs).buffer(0)
    nm=NOME_FIXO.get(k) or titulo(re.sub(r'^(Bairro|Loteamento|Distrito) ','',re.sub(r'\s*\(.*?\)','',nomes[k])).strip())
    polys.append({'k':k,'nome':nm,'g':g,'area':g.area})
polys.sort(key=lambda p:p['area'])
ocupado=shapely.Polygon(); pecas=[]
for p in polys:
    resto=p['g'].difference(ocupado).buffer(0)
    if resto.is_empty or resto.area<max(2e-6,0.2*p['area']):   # quase todo dentro de um bairro menor: descarta
        continue
    ocupado=unary_union([ocupado,resto]).buffer(0)
    tipo='distrito' if p['area']>0.004 else 'bairro'
    pecas.append({'k':p['k'],'nome':p['nome'],'tipo':tipo,'g':resto})
print('bairros/distritos na partição:',len(pecas),collections.Counter(x['tipo'] for x in pecas))

# ── locais de votação (TSE) e atribuição a bairros
def carregar_locais(fn):
    L={}
    for x in rd(fn):
        if x['NR_TURNO']!='1': continue
        lid=f"{x['NR_ZONA']}-{x['NR_LOCAL_VOTACAO']}"
        lat,lon=float(x['NR_LATITUDE'].replace(',','.')),float(x['NR_LONGITUDE'].replace(',','.'))
        l=L.setdefault(lid,{'n':titulo(x['NM_LOCAL_VOTACAO']).replace('Ifba','IFBA').replace('Univasf','UNIVASF').replace('Uneb','UNEB').replace('Cetep','CETEP'),
            'e':x['DS_ENDERECO'],'bt':x['NM_BAIRRO'],'p':[round(lon,5),round(lat,5)] if lat!=-1 else None,'ag':{}})
        if x['DS_TIPO_SECAO_AGREGADA']=='Agregada': l['ag'][str(int(x['NR_SECAO']))]=int(x['NR_SECAO_PRINCIPAL'])
    return L
anos={'2026':{'locais':carregar_locais('lv26.csv')},'2024':{'locais':carregar_locais('lv24.csv')},'2022':{'locais':carregar_locais('lv22.csv')},'2020':{'locais':carregar_locais('lv20.csv')}}
# local sem coordenada num ano: usa a do mesmo código de local em outro ano
for ano,A in anos.items():
    for lid,l in A['locais'].items():
        if not l['p']:
            for B in anos.values():
                if B['locais'].get(lid,{}).get('p'): l['p']=B['locais'][lid]['p']; break
print('locais sem coordenada:',{a:[l['n'] for l in A['locais'].values() if not l['p']] for a,A in anos.items()})
extras={}   # povoados sem contorno, agrupados pelo bairro do TSE
for ano,A in anos.items():
    for lid,l in A['locais'].items():
        if not l['p']:   # sem coordenada: tenta o distrito/bairro pelo nome no cadastro do TSE
            k=norm(l['bt']); l['b']=k if any(p['k']==k for p in pecas) else None; continue
        pt=Point(l['p']); dentro=[i for i,p in enumerate(pecas) if p['g'].contains(pt)]
        if dentro: l['b']=pecas[dentro[0]]['k']
        else:
            k=norm(l['bt']); k={'CARNAIBA':'CARNAIBA DO SERTAO'}.get(k,k); m=[p for p in pecas if p['k']==k]
            if m: l['b']=k
            else:
                extras.setdefault(k,{'k':k,'nome':titulo(re.sub(r'^(POVOADO|DISTRITO) ','',l['bt'])),'tipo':'povoado','pts':[]})['pts'].append(l['p']); l['b']=k
print('povoados sem contorno:',[e['nome'] for e in extras.values()])

Q=1e5
def enc(g):
    out=[]
    def line(cs):
        o=[];px=py=0
        for x,y in cs:
            X=round(x*Q);Y=round(y*Q);o+=[X-px,Y-py];px,py=X,Y
        return o
    for p in (g.geoms if g.geom_type=='MultiPolygon' else [g]):
        if p.geom_type!='Polygon' or p.area<5e-8: continue
        out.append([line(p.exterior.coords)]+[line(r.coords) for r in p.interiors])
    return out
bairros=[]
for p in pecas:
    g=p['g'].simplify(0.00003)
    c=p['g'].representative_point()
    bairros.append({'id':p['k'],'nome':p['nome'],'tipo':p['tipo'],'geo':enc(g),'c':[round(c.x,5),round(c.y,5)],
                    'bb':[round(v,4) for v in p['g'].bounds],'km2':round(p['g'].area*12300,2)})
for e in extras.values():
    xs=[q[0] for q in e['pts']];ys=[q[1] for q in e['pts']]
    bairros.append({'id':e['k'],'nome':e['nome'],'tipo':'povoado','geo':None,'c':[round(sum(xs)/len(xs),5),round(sum(ys)/len(ys),5)],
                    'bb':[min(xs)-.01,min(ys)-.01,max(xs)+.01,max(ys)+.01],'km2':None})

# ── candidatos e votos por seção
cands={}
for x in rd('cand20.csv'):
    cands[('2020',x['DS_CARGO'].upper(),x['NR_CANDIDATO'])]={'u':x['NM_URNA_CANDIDATO'],'n':x['NM_CANDIDATO'],'p':x['SG_PARTIDO'],'s':x['DS_SIT_TOT_TURNO']}
for x in rd('cand24.csv'):
    cands[('2024',x['DS_CARGO'].upper(),x['NR_CANDIDATO'])]={'u':x['NM_URNA_CANDIDATO'],'n':x['NM_CANDIDATO'],'p':x['SG_PARTIDO'],'s':x['DS_SIT_TOT_TURNO']}
partido_num={'2020':{x['NR_PARTIDO']:x['SG_PARTIDO'] for x in rd('cand20.csv')},
             '2024':{x['NR_PARTIDO']:x['SG_PARTIDO'] for x in rd('cand24.csv')},
             '2022':{x['NR_PARTIDO']:x['SG_PARTIDO'] for x in rd('c22ba.csv')},
             '2026':{x['NR_PARTIDO']:x['SG_PARTIDO'] for x in rd('c26ba.csv')}}
PROP=('VEREADOR','DEPUTADO FEDERAL','DEPUTADO ESTADUAL')
for ano,f in (('2022','cand22_BR.csv'),('2022','c22ba.csv'),('2026','c26br.csv'),('2026','c26ba.csv')):
    for x in rd(f):
        k=(ano,x['DS_CARGO'].upper()+x['NR_TURNO'],x['NR_CANDIDATO'])
        if k in cands and x['DS_SIT_TOT_TURNO']=='#NULO': continue
        cands[k]={'u':x['NM_URNA_CANDIDATO'],'n':x['NM_CANDIDATO'],'p':x['SG_PARTIDO'],'s':x['DS_SIT_TOT_TURNO']}
CORES={'2020_PREFEITO':{'45':'#f0534f','13':'#4c8dff','25':'#2fbf71','10':'#f5a524','70':'#b07cff','50':'#22b8cf'},
       '2024_PREFEITO':{'15':'#4c8dff','45':'#f0534f','55':'#2fbf71','11':'#b07cff'},
       '2022_PRESIDENTE':{'13':'#f0534f','22':'#4c8dff','12':'#f5a524','15':'#b07cff','44':'#2fbf71'},
       '2026_PRESIDENTE':{'13':'#f0534f','22':'#4c8dff','55':'#2fbf71','30':'#f5a524'},
       '2026_GOVERNADOR':{'13':'#f0534f','44':'#4c8dff'},
       '2026_SENADOR':{'133':'#f0534f','130':'#f5a524','222':'#4c8dff','100':'#2fbf71','500':'#b07cff'},
       '2022_SENADOR':{'555':'#2fbf71','111':'#4c8dff','222':'#b07cff','500':'#f5a524'},
       '2022_GOVERNADOR':{'13':'#f0534f','44':'#4c8dff','22':'#2fbf71','50':'#f5a524'}}
SIT={'ELEITO':'Eleito','ELEITO POR QP':'Eleito por QP','ELEITO POR MÉDIA':'Eleito por média','2º TURNO':'2º turno','SUPLENTE':'Suplente'}
def eleicao(chave,ano,cargo,turno,vsf,dvf,titulo_e,vagas=1):
    E={'ano':ano,'cargo':cargo.title(),'turno':int(turno),'titulo':titulo_e,'prop':int(cargo in PROP),'vagas':vagas,'cands':{},'secoes':{}}
    for x in rd(dvf):
        if x['DS_CARGO'].upper()!=cargo or x['NR_TURNO']!=turno or x['SG_UF']!='BA': continue
        k=f"{x['NR_ZONA']}-{int(x['NR_SECAO'])}"
        E['secoes'][k]=[f"{x['NR_ZONA']}-{x['NR_LOCAL_VOTACAO']}",int(x['QT_APTOS']),int(x['QT_COMPARECIMENTO']),int(x['QT_VOTOS_BRANCOS']),int(x['QT_VOTOS_NULOS']),int(x['QT_VOTOS_LEGENDA']),{}]
    for x in rd(vsf):
        if x['DS_CARGO'].upper()!=cargo or x['NR_TURNO']!=turno: continue
        n=x['NR_VOTAVEL']
        if n in('95','96','97'): continue
        s=E['secoes'][f"{x['NR_ZONA']}-{int(x['NR_SECAO'])}"]; s[6][n]=s[6].get(n,0)+int(x['QT_VOTOS'])
        if n in E['cands']: continue
        ck=(ano,cargo+(turno if ano not in('2024','2020') else ''),n)
        if cargo in PROP and len(n)==2:
            pn=partido_num[ano].get(n,n); E['cands'][n]={'u':pn,'p':pn,'leg':1}
        else:
            c=cands.get(ck,{'u':x['NM_VOTAVEL'],'n':x['NM_VOTAVEL'],'p':'','s':''})
            E['cands'][n]={'u':c['u'],'n':c['n'],'p':c['p']}
            if SIT.get(c['s']): E['cands'][n]['s']=SIT[c['s']]
    cor=CORES.get(re.sub(r'_\d$','',chave),{})
    for n,c in E['cands'].items():
        if n in cor: c['c']=cor[n]
    return E
EL={'2026_PRESIDENTE_1':eleicao('2026_PRESIDENTE_1','2026','PRESIDENTE','1','vs26br.csv','dv26br.csv','Presidente 2026 · 1º turno'),
    '2026_GOVERNADOR_1':eleicao('2026_GOVERNADOR_1','2026','GOVERNADOR','1','vs26.csv','dv26br.csv','Governador 2026 · 1º turno'),
    '2026_SENADOR':eleicao('2026_SENADOR','2026','SENADOR','1','vs26.csv','dv26br.csv','Senador 2026',vagas=2),
    '2026_DEPUTADO_FEDERAL':eleicao('2026_DEPUTADO_FEDERAL','2026','DEPUTADO FEDERAL','1','vs26.csv','dv26br.csv','Deputado Federal 2026'),
    '2026_DEPUTADO_ESTADUAL':eleicao('2026_DEPUTADO_ESTADUAL','2026','DEPUTADO ESTADUAL','1','vs26.csv','dv26br.csv','Deputado Estadual 2026'),
    '2024_PREFEITO':eleicao('2024_PREFEITO','2024','PREFEITO','1','vs24.csv','dv24.csv','Prefeito 2024'),
    '2024_VEREADOR':eleicao('2024_VEREADOR','2024','VEREADOR','1','vs24.csv','dv24.csv','Vereador 2024'),
    '2022_PRESIDENTE_2':eleicao('2022_PRESIDENTE_2','2022','PRESIDENTE','2','vs22br.csv','dv22br.csv','Presidente 2022 · 2º turno'),
    '2022_PRESIDENTE_1':eleicao('2022_PRESIDENTE_1','2022','PRESIDENTE','1','vs22br.csv','dv22br.csv','Presidente 2022 · 1º turno'),
    '2022_GOVERNADOR_2':eleicao('2022_GOVERNADOR_2','2022','GOVERNADOR','2','vs22.csv','dv22br.csv','Governador 2022 · 2º turno'),
    '2022_GOVERNADOR_1':eleicao('2022_GOVERNADOR_1','2022','GOVERNADOR','1','vs22.csv','dv22br.csv','Governador 2022 · 1º turno'),
    '2022_SENADOR':eleicao('2022_SENADOR','2022','SENADOR','1','vs22.csv','dv22br.csv','Senador 2022'),
    '2022_DEPUTADO_FEDERAL':eleicao('2022_DEPUTADO_FEDERAL','2022','DEPUTADO FEDERAL','1','vs22.csv','dv22br.csv','Deputado Federal 2022'),
    '2022_DEPUTADO_ESTADUAL':eleicao('2022_DEPUTADO_ESTADUAL','2022','DEPUTADO ESTADUAL','1','vs22.csv','dv22br.csv','Deputado Estadual 2022'),
    '2020_PREFEITO':eleicao('2020_PREFEITO','2020','PREFEITO','1','vs20.csv','dv20.csv','Prefeito 2020'),
    '2020_VEREADOR':eleicao('2020_VEREADOR','2020','VEREADOR','1','vs20.csv','dv20.csv','Vereador 2020')}
for k,E in EL.items():
    t=collections.Counter()
    for s in E['secoes'].values():
        for n,v in s[6].items(): t[n]+=v
    print(k,len(E['secoes']),'secoes;',', '.join(f"{E['cands'][n]['u']} {v}" for n,v in t.most_common(4)))
    for s in E['secoes'].values():
        if s[0] not in anos[E['ano']]['locais']: print('  !! local sem cadastro',s[0])
loc_com_dados=collections.Counter(anos['2024']['locais'][s[0]]['b'] for s in EL['2024_PREFEITO']['secoes'].values() if anos['2024']['locais'][s[0]]['b'])
print('bairros com locais 2024:',len(loc_com_dados),'| sem locais:',sum(1 for b in bairros if b['id'] not in loc_com_dados))
import os
os.makedirs(S+'/pub/eleicoes',exist_ok=True)
indice={}
for k,E in EL.items():
    s=json.dumps(E,ensure_ascii=False,separators=(',',':'))
    open(f"{S}/pub/eleicoes/{k}.json",'w',encoding='utf-8').write(s)
    indice[k]={'titulo':E['titulo'],'ano':E['ano'],'cargo':E['cargo'],'prop':E['prop'],'vagas':E['vagas'],'kb':round(len(s)/1e3)}
print('arquivos:',{k:v['kb'] for k,v in indice.items()})
out={'municipio':enc(J.simplify(0.0005)),'bairros':bairros,'anos':anos,'indice':indice}
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
open(S+'/pub/dados.json','w',encoding='utf-8').write(s); print('dados.json MB',round(len(s)/1e6,2))
