'use strict';
/* ══════════════════════════════════════════════════════════
   Utilidades
══════════════════════════════════════════════════════════ */
const $=s=>document.querySelector(s);
const fmt=n=>Number(n).toLocaleString('pt-BR');
const pct=(n,casas=1)=>(Number.isFinite(n)?n:0).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas})+'%';
const mil=n=>n>=1e4?(n/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':fmt(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const soma=o=>Object.values(o).reduce((a,b)=>a+b,0);
const ordenar=v=>Object.entries(v).sort((a,b)=>b[1]-a[1]);
const semAcento=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const PASSAR_MOUSE=matchMedia('(hover:hover) and (pointer:fine)').matches;
const MOVIMENTO=!matchMedia('(prefers-reduced-motion:reduce)').matches;
const DESKTOP=()=>innerWidth>=900;
const PALETA_EXTRA=['#22b8cf','#e879a6','#f5a524','#c9a27e','#7dd3fc','#9aa5b8','#b07cff','#2fbf71'];

/* ══════════════════════════════════════════════════════════
   Estado
══════════════════════════════════════════════════════════ */
const estado={vista:'bairros',modo:'eleicao',verEleitos:false,eleicao:'2024_PREFEITO',nivel:'cidade',bairro:null,local:null,candidato:null,colorir:'vencedor',
  ordemBairros:'votos',verTodos:false,camadaBairros:true,camadaLocais:true};
let D=null;                    // dados.json
const cache={};                // agregados por eleição
const BAIRRO={};               // id -> bairro ou região (regiões têm id 'R:...')
const REGIAO_DE={};            // id do bairro -> id da região
/* Unidade de área em uso: bairros, ou regiões (vista "Regiões" e "Mancha") */
const usaRegioes=()=>estado.vista!=='bairros';
const ehRegiao=id=>typeof id==='string'&&id.startsWith('R:');
const ativa=id=>ehRegiao(id)===usaRegioes();
const areaDe=l=>l&&l.b?(usaRegioes()?REGIAO_DE[l.b]||null:l.b):null;
const areasAtivas=R=>Object.entries(R.bairros).filter(([id])=>ativa(id));

/* ══════════════════════════════════════════════════════════
   Agregação: urna -> local -> bairro -> cidade
══════════════════════════════════════════════════════════ */
function novoTotal(){return {a:0,c:0,br:0,nu:0,lg:0,v:{},urnas:0,locais:new Set()}}
function acumular(T,s,lid){
  T.a+=s[1];T.c+=s[2];T.br+=s[3];T.nu+=s[4];T.lg+=s[5];T.urnas++;T.locais.add(lid);
  for(const n in s[6])T.v[n]=(T.v[n]||0)+s[6][n];
}
function agregados(chave){
  if(cache[chave])return cache[chave];
  const E=D.eleicoes[chave],L=D.anos[E.ano].locais;
  const R={E,L,cidade:novoTotal(),bairros:{},locais:{},secoesPorLocal:{}};
  for(const [sk,s] of Object.entries(E.secoes)){
    const lid=s[0],l=L[lid];
    acumular(R.cidade,s,lid);
    acumular(R.locais[lid]||(R.locais[lid]=novoTotal()),s,lid);
    (R.secoesPorLocal[lid]||(R.secoesPorLocal[lid]=[])).push(sk);
    if(l&&l.b)acumular(R.bairros[l.b]||(R.bairros[l.b]=novoTotal()),s,lid);
    const rg=l&&l.b&&REGIAO_DE[l.b];   // a mesma urna também soma na região do bairro
    if(rg)acumular(R.bairros[rg]||(R.bairros[rg]=novoTotal()),s,lid);
  }
  for(const k in R.secoesPorLocal)R.secoesPorLocal[k].sort((a,b)=>+a.split('-')[1]-+b.split('-')[1]);
  // cores: as definidas nos dados; os demais candidatos majoritários recebem tons da paleta auxiliar
  const usadas=new Set(Object.values(E.cands).map(c=>c.c).filter(Boolean));
  const livres=PALETA_EXTRA.filter(c=>!usadas.has(c));let i=0;
  for(const [n] of ordenar(R.cidade.v)){const c=E.cands[n];if(!c.c&&!isVereador(chave))c.c=livres[i++%livres.length]}
  return cache[chave]=R;
}
// proporcional (vereador e deputados): muitos candidatos, busca + ranking em vez de lista completa
const isVereador=(ch=estado.eleicao)=>!!D.indice[ch].prop;
const validos=T=>soma(T.v);                      // nominais (+ legenda, no caso de vereador)
const nominais=(T,E)=>Object.entries(T.v).reduce((a,[n,q])=>a+(E.cands[n].leg?0:q),0);
const cand=(n,E=agregados(estado.eleicao).E)=>E.cands[n];
const corCand=n=>isVereador()?'var(--acento)':(cand(n).c||'#9aa5b8');
function vencedor(T,E){
  const r=ordenar(T.v).filter(([n])=>!E.cands[n].leg);
  if(!r.length)return null;
  const tot=validos(T);
  return {n:r[0][0],q:r[0][1],p:r[0][1]/tot*100,margem:r[1]?(r[0][1]-r[1][1])/tot*100:100};
}
const partePct=(T,n)=>{const t=validos(T);return t?(T.v[n]||0)/t*100:0};

/* ══════════════════════════════════════════════════════════
   Mapa
══════════════════════════════════════════════════════════ */
const map=L.map('map',{zoomControl:false,center:[-9.43,-40.50],zoom:12,minZoom:8,maxZoom:18,
  maxBounds:[[-10.6,-41.5],[-8.7,-39.4]],attributionControl:true});
L.control.zoom({position:'bottomright'}).addTo(map);
map.attributionControl.setPrefix(false);
map.createPane('bairros').style.zIndex=410;
map.createPane('contorno').style.zIndex=420;
map.createPane('locais').style.zIndex=450;
map.createPane('rotulos').style.zIndex=460;
map.getPane('rotulos').style.pointerEvents='none';

function decodificar(arr,q=1e5){
  const out=[];let x=0,y=0;
  for(let i=0;i<arr.length;i+=2){x+=arr[i];y+=arr[i+1];out.push([y/q,x/q])}
  return out;
}

const camadas={bairros:{},locais:{},rotulos:L.layerGroup(),contorno:null};

function montarMapa(){
  camadas.contorno=L.polygon(D.municipio.map(p=>p.map(r=>decodificar(r))),
    {pane:'contorno',color:'#f2b33d',weight:1.6,opacity:.55,dashArray:'6 5',fill:false,interactive:false}).addTo(map);
  for(const r of D.regioes||[])for(const b of r.bairros)REGIAO_DE[b]=r.id;
  // regiões de um só distrito/povoado já têm o contorno e o nome do próprio distrito
  const areas=[...D.bairros,...(D.regioes||[]).map(r=>({...r,rotulo:r.tipo==='região'}))];
  for(const b of areas){
    BAIRRO[b.id]=b;
    if(b.geo){
      const lay=L.polygon(b.geo.map(p=>p.map(r=>decodificar(r))),{pane:'bairros',weight:1,smoothFactor:.5});
      lay.on('click',e=>{L.DomEvent.stopPropagation(e);
        // tocar de novo no bairro já aberto volta para a cidade
        if(estado.nivel==='bairro'&&estado.bairro===b.id)voltar();else irBairro(b.id)});
      if(PASSAR_MOUSE){
        lay.on('mouseover',()=>{if(estado.bairro!==b.id)lay.setStyle({weight:2.2})});
        lay.on('mouseout',()=>estilizarBairro(b.id));
        lay.bindTooltip(()=>dicaBairro(b.id),{sticky:true,className:'dica-mapa',direction:'top',offset:[0,-8]});
      }
      lay.addTo(map);camadas.bairros[b.id]=lay;
    }
    if(ehRegiao(b.id)&&!b.rotulo)continue;
    const cls=b.tipo==='bairro'?'rotulo-bairro':b.tipo==='região'?'rotulo-regiao':'rotulo-distrito';
    const m=L.marker([b.c[1],b.c[0]],{pane:'rotulos',interactive:false,keyboard:false,
      // região: no mapa só o primeiro nome (o completo fica no painel), para não encavalar no centro
      icon:L.divIcon({className:'rotulo '+cls,html:`<span>${esc(b.tipo==='região'?b.nome.split(' · ')[0]:b.nome)}</span>`,iconSize:null})});
    m.tipo=b.tipo;m.addTo(camadas.rotulos);
  }
  camadas.rotulos.addTo(map);
  map.on('zoomend',atualizarRotulos);
  map.fitBounds(L.latLngBounds([[-9.475,-40.56],[-9.39,-40.455]]),{animate:false});
}
function atualizarRotulos(){
  const z=map.getZoom();
  camadas.rotulos.eachLayer(m=>{
    const ver=m.tipo==='bairro'?(!usaRegioes()&&z>=14):m.tipo==='região'?(usaRegioes()&&z>=13&&z<=15):(z>=10&&z<=14);
    const el=m.getElement();if(el)el.style.display=ver?'':'none';
  });
}

/* Escala de cor por intensidade (0..1), sobre a cor do candidato */
function estiloBairro(id){
  if(!ativa(id))return {stroke:false,fill:false};
  const s=estiloArea(id);
  // na vista "Mancha" a cor vem do mapa de calor; a região fica só com o contorno (e continua clicável)
  if(estado.vista==='calor'&&s.fill!==false&&estado.bairro!==id)return {...s,color:'#c9d1d9',weight:1.4,opacity:.5,dashArray:null,fillOpacity:0};
  if(estado.vista==='calor'&&estado.bairro===id)return {...s,fillOpacity:0};
  return s;
}
function estiloArea(id){
  if(modoComparar())return cmpPronto()?estiloComparar(id):{color:'#6b7486',weight:.8,opacity:.5,dashArray:null,fill:false};
  const R=agregados(estado.eleicao),T=R.bairros[id],sel=estado.bairro===id,algumSel=!!estado.bairro;
  if(!estado.camadaBairros)return {stroke:false,fill:false};
  if(!T)return {color:'#6b7486',weight:sel?2.5:.8,opacity:sel?1:.6,dashArray:'3 4',fill:true,fillColor:'#0b0e13',fillOpacity:sel?.25:.02};
  let cor,op;
  const m=modoCor();
  if(m.tipo==='candidato'){
    const p=partePct(T,m.n);cor=m.cor;op=.06+.66*Math.min(1,p/Math.max(m.max,1));
  }else if(m.tipo==='comparecimento'){
    const t=T.c/T.a*100;cor='#22b8cf';op=.06+.7*Math.max(0,Math.min(1,(t-m.min)/Math.max(m.max-m.min,1)));
  }else{
    const v=vencedor(T,R.E);cor=v?corCand(v.n):'#6b7486';op=.2+.5*Math.min(1,(v?v.margem:0)/35);
  }
  return {color:sel?'#ffffff':cor,weight:sel?3:1,opacity:sel?1:.85,dashArray:null,fill:true,fillColor:cor,
    fillOpacity:algumSel&&!sel?op*.45:op};
}
function estilizarBairro(id){const l=camadas.bairros[id];if(l)l.setStyle(estiloBairro(id))}
function estilizarBairros(){for(const id in camadas.bairros)estilizarBairro(id);const s=camadas.bairros[estado.bairro];if(s)s.bringToFront()}

/* Modo de cor atual, com escala calculada sobre os bairros */
function modoCor(){
  const R=agregados(estado.eleicao);
  let c=estado.colorir;
  if(isVereador())c=estado.candidato?'cand:'+estado.candidato:'comparecimento';
  if(c.startsWith('cand:')){
    const n=c.slice(5);
    const max=Math.max(...areasAtivas(R).map(([,T])=>partePct(T,n)),0.1);
    return {tipo:'candidato',n,cor:corCand(n),max};
  }
  if(c==='comparecimento'){
    const ts=areasAtivas(R).map(([,T])=>T.c/T.a*100);
    return {tipo:'comparecimento',min:Math.min(...ts),max:Math.max(...ts)};
  }
  return {tipo:'vencedor'};
}

/* Locais de votação */
function desenharLocais(){
  for(const id in camadas.locais)map.removeLayer(camadas.locais[id]);
  camadas.locais={};
  if(!estado.camadaLocais)return;
  if(modoComparar()){if(cmpPronto())desenharLocaisComparar();return}
  const R=agregados(estado.eleicao),m=modoCor();
  const valor=T=>m.tipo==='candidato'?(T.v[m.n]||0):validos(T);
  const mx=Math.max(...Object.values(R.locais).map(valor),1);
  for(const [lid,T] of Object.entries(R.locais)){
    const l=R.L[lid];if(!l||!l.p)continue;
    const v=valor(T),sel=estado.local===lid,foraDoBairro=estado.bairro&&areaDe(l)!==estado.bairro;
    let cor;
    if(m.tipo==='candidato')cor=v>0?m.cor:'#4a5263';
    else if(m.tipo==='comparecimento')cor='#22b8cf';
    else{const w=vencedor(T,R.E);cor=w?corCand(w.n):'#6b7486'}
    const r=v>0?Math.max(4,Math.sqrt(v/mx)*17):3.5;
    const c=L.circleMarker([l.p[1],l.p[0]],{pane:'locais',radius:r,color:sel?'#fff':'#0b0e13',weight:sel?3:1.4,
      fillColor:cor,fillOpacity:foraDoBairro?.35:.95,opacity:foraDoBairro?.5:1});
    c.on('click',e=>{L.DomEvent.stopPropagation(e);irLocal(lid)});
    if(PASSAR_MOUSE)c.bindTooltip(()=>dicaLocal(lid),{className:'dica-mapa',direction:'top',offset:[0,-6]});
    c.addTo(map);camadas.locais[lid]=c;
  }
  if(estado.local&&camadas.locais[estado.local])camadas.locais[estado.local].bringToFront();
}

function dicaBairro(id){
  if(modoComparar())return cmpPronto()?cmpDica(BAIRRO[id].nome,cmpPar('bairros',id)):esc(BAIRRO[id].nome);
  const R=agregados(estado.eleicao),T=R.bairros[id],b=BAIRRO[id];
  if(!T)return `<b>${esc(b.nome)}</b><br><span class="x">Nenhum colégio fica neste bairro</span>`;
  const m=modoCor();
  if(m.tipo==='candidato')return `<b>${esc(b.nome)}</b><br>${esc(cand(m.n).u)}: <b>${fmt(T.v[m.n]||0)}</b> votos (${pct(partePct(T,m.n))})`;
  if(m.tipo==='comparecimento')return `<b>${esc(b.nome)}</b><br>Comparecimento: <b>${pct(T.c/T.a*100)}</b>`;
  const v=vencedor(T,R.E);
  return `<b>${esc(b.nome)}</b><br><span style="color:${corCand(v.n)}">●</span> ${esc(cand(v.n).u)} <b>${pct(v.p)}</b><br><span class="x">${T.locais.size} local(is) · ${fmt(T.c)} votantes</span>`;
}
function dicaLocal(lid){
  const R=agregados(estado.eleicao),T=R.locais[lid],l=R.L[lid],m=modoCor();
  if(m.tipo==='candidato')return `<b>${esc(l.n)}</b><br>${esc(cand(m.n).u)}: <b>${fmt(T.v[m.n]||0)}</b> votos (${pct(partePct(T,m.n))})`;
  const v=vencedor(T,R.E);
  return `<b>${esc(l.n)}</b><br><span style="color:${corCand(v.n)}">●</span> ${esc(cand(v.n).u)} <b>${pct(v.p)}</b><br><span class="x">${T.urnas} urna(s) · ${fmt(T.c)} votantes</span>`;
}

/* Enquadrar sem ficar atrás da folha do celular */
function enquadrar(bounds,maxZoom=16){
  const pad=DESKTOP()?{paddingTopLeft:[40,40],paddingBottomRight:[290,40]}
    :{paddingTopLeft:[24,60],paddingBottomRight:[24,alturaFolha()+24]};
  map.flyToBounds(bounds,{...pad,maxZoom,duration:MOVIMENTO?.75:0,animate:MOVIMENTO});
}
function focarPonto(ll,z){
  // no celular, desloca o centro para o ponto ficar acima da folha
  const desloc=DESKTOP()?[-125,0]:[0,alturaFolha()/2-20];
  const centro=map.unproject(map.project(ll,z).add(desloc),z);
  map.flyTo(centro,z,{duration:MOVIMENTO?.7:0,animate:MOVIMENTO});
}
function boundsBairro(id){
  const lay=camadas.bairros[id];if(lay)return lay.getBounds();
  const b=BAIRRO[id];return L.latLngBounds([[b.bb[1],b.bb[0]],[b.bb[3],b.bb[2]]]);
}

/* ══════════════════════════════════════════════════════════
   Navegação
══════════════════════════════════════════════════════════ */
/* Histórico: cada nível aberto ganha uma entrada, para o "voltar" do celular subir um nível */
let pilha=0,irParaCidade=false;
function empurrar(){try{history.pushState({mapa:pilha+1},'');pilha++}catch(e){}}
function subir(){
  if(estado.nivel==='local'&&estado.bairro)irBairro(estado.bairro,{historico:false});
  else if(estado.nivel!=='cidade')irCidade({historico:false});
}
function voltar(){if(pilha>0)history.back();else subir()}
function voltarAoInicio(){
  if(pilha>0){irParaCidade=true;history.go(-pilha)}else irCidade({historico:false});
}
addEventListener('popstate',()=>{
  pilha=Math.max(0,pilha-1);
  if(irParaCidade){irParaCidade=false;pilha=0;irCidade({historico:false})}else subir();
});

function irCidade(){
  estado.nivel='cidade';estado.bairro=null;estado.local=null;estado.verTodos=false;
  atualizar();
  enquadrar(L.latLngBounds([[-9.475,-40.56],[-9.39,-40.455]]),14);
}
function irBairro(id,{mover=true,historico=true}={}){
  if(historico&&estado.nivel==='cidade')empurrar();
  estado.nivel='bairro';estado.bairro=id;estado.local=null;estado.verTodos=false;
  atualizar();folha('meio');
  if(mover)enquadrar(boundsBairro(id),16);
}
function irLocal(lid){
  const l=infoLocal(lid);if(!l)return;
  if(estado.nivel!=='local')empurrar();
  estado.nivel='local';estado.local=lid;estado.bairro=areaDe(l);
  atualizar();folha('meio');
  if(l.p)focarPonto(L.latLng(l.p[1],l.p[0]),Math.max(map.getZoom(),16));
}
function escolherCandidato(n){
  estado.candidato=n;estado.verTodos=false;
  atualizar();
}

/* ══════════════════════════════════════════════════════════
   Painel
══════════════════════════════════════════════════════════ */
function kpis(T){
  // senador 2026: cada eleitor deu 2 votos, então brancos e nulos contam sobre 2 votos por eleitor
  const vagas=D.indice[estado.eleicao].vagas||1,brn=T.br+T.nu;
  return `<div class="kpis">
    <div class="kpi"><span>Eleitores aptos</span><b>${mil(T.a)}</b></div>
    <div class="kpi"><span>Comparecimento</span><b>${pct(T.c/T.a*100)}</b><em>${mil(T.c)}</em>
      <div class="medidor"><i style="width:${T.c/T.a*100}%"></i></div></div>
    <div class="kpi"><span>Abstenção</span><b>${pct((T.a-T.c)/T.a*100)}</b><em>${mil(T.a-T.c)}</em></div>
    <div class="kpi"><span>Brancos e nulos</span><b>${pct(brn/(T.c*vagas)*100)}</b><em>${mil(brn)}</em></div>
  </div>`;
}
function linhasCandidatos(T,ref,{clicavel=true}={}){
  const R=agregados(estado.eleicao),E=R.E,tot=validos(T),m=modoCor();
  return `<div class="cands">${ordenar(T.v).filter(([n])=>!E.cands[n].leg).map(([n,q])=>{
    const c=E.cands[n],p=q/tot*100,cor=corCand(n);
    let det=`<span>${fmt(q)} votos</span>`;
    if(ref){const d=p-partePct(ref,n);det+=`<span class="${d>=0?'dif-sobe':'dif-desce'}">${d>=0?'+':''}${d.toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})} p.p. vs. cidade</span>`}
    else det+=`<span>${esc(c.n||'')}</span>`;
    const tag=clicavel?'button':'div',ativo=m.tipo==='candidato'&&m.n===n;
    return `<${tag} class="cand${ativo?' ativo':''}" ${clicavel?`data-colorir="${n}" aria-pressed="${ativo}" title="Colorir o mapa pelo desempenho de ${esc(c.u)}"`:''}>
      <span class="cor" style="background:${cor}"></span>
      <span class="nome">${esc(c.u)}<small>${esc(c.p)}</small>${c.s?`<span class="selo${/Eleito/.test(c.s)?'':' neutro'}">${esc(c.s)}</span>`:''}</span>
      <span class="pct">${pct(p)}</span>
      <span class="barra"><i style="width:${p}%;background:${cor}"></i></span>
      <span class="det">${det}</span>
    </${tag}>`;
  }).join('')}</div>`;
}
function barraEmpilhada(T,E){
  const tot=validos(T);
  return `<span class="empilhada">${ordenar(T.v).filter(([n])=>!E.cands[n].leg).map(([n,q])=>`<i style="width:${q/tot*100}%;background:${corCand(n)}"></i>`).join('')}</span>`;
}

/* Bloco de vereador: busca + ficha */
function blocoBuscaVereador(){
  return `<div class="busca">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="busca" type="search" autocomplete="off" placeholder="Buscar candidato por nome ou número" aria-label="Buscar candidato">
  </div><ul class="sugestoes" id="sugestoes" hidden></ul>`;
}
function fichaCandidato(n,T,escopo){
  const R=agregados(estado.eleicao),c=R.E.cands[n],cid=R.cidade;
  const rank=ordenar(cid.v).filter(([k])=>!R.E.cands[k].leg).findIndex(([k])=>k===n)+1;
  const noEscopo=T&&T!==cid;
  return `<div class="ficha">
    <div class="ficha-topo"><div><h3>${esc(c.u)}</h3><p>${esc(c.p)} · nº ${n}${c.s?` · <b style="color:var(--acento)">${esc(c.s)}</b>`:''}</p></div>
      <button class="fechar" data-limpar>Limpar</button></div>
    <div class="kpis">
      <div class="kpi"><span>Votos na cidade</span><b>${fmt(cid.v[n]||0)}</b><em>${rank}º</em></div>
      <div class="kpi"><span>${noEscopo?'Votos '+escopo:'Dos votos válidos'}</span><b>${noEscopo?fmt(T.v[n]||0):pct(partePct(cid,n),2)}</b>${noEscopo?`<em>${pct(partePct(T,n))}</em>`:''}</div>
    </div>
  </div>`;
}
function maisVotadosVereador(T,{limite=10}={}){
  const R=agregados(estado.eleicao),E=R.E,tot=validos(T);
  const lista=ordenar(T.v).filter(([n])=>!E.cands[n].leg);
  const mostrar=estado.verTodos?lista:lista.slice(0,limite);
  return `<div class="cands">${mostrar.map(([n,q],i)=>{
    const c=E.cands[n],sel=estado.candidato===n,p=q/tot*100;
    return `<button class="cand${sel?' ativo':''}" data-candidato="${n}" aria-pressed="${sel}">
      <span class="cor" style="background:${sel?'var(--acento)':'#5b7cb0'}"></span>
      <span class="nome">${i+1}. ${esc(c.u)}<small>${esc(c.p)}</small>${/Eleito/.test(c.s||'')?'<span class="selo">Eleito</span>':''}</span>
      <span class="pct" style="font-size:16px">${fmt(q)}</span>
      <span class="barra"><i style="width:${p/(lista[0][1]/tot*100)*100}%;background:${sel?'var(--acento)':'#5b7cb0'}"></i></span>
    </button>`}).join('')}</div>
    ${lista.length>limite?`<button class="ver-mais" data-ver-todos>${estado.verTodos?'Mostrar menos':`Ver todos os ${lista.length} candidatos com votos`}</button>`:''}`;
}
function camaraEleita(){
  const R=agregados(estado.eleicao),E=R.E;
  const todos=ordenar(R.cidade.v).filter(([n])=>/Eleito/.test(E.cands[n].s||''));
  if(!todos.length)return '<p class="nota">O TSE ainda não informou os eleitos.</p>';
  const lim=15,eleitos=estado.verEleitos?todos:todos.slice(0,lim),max=todos[0][1];
  return `<div class="cands">${eleitos.map(([n,q],i)=>{const c=E.cands[n],sel=estado.candidato===n;
    return `<button class="cand${sel?' ativo':''}" data-candidato="${n}">
      <span class="cor" style="background:${sel?'var(--acento)':'#5b7cb0'}"></span>
      <span class="nome">${esc(c.u)}<small>${esc(c.p)}</small><span class="selo neutro">${c.s==='Eleito por QP'?'QP':'Média'}</span></span>
      <span class="pct" style="font-size:16px">${fmt(q)}</span>
      <span class="barra"><i style="width:${q/max*100}%;background:${sel?'var(--acento)':'#5b7cb0'}"></i></span></button>`}).join('')}</div>
    ${todos.length>lim?`<button class="ver-mais" data-ver-eleitos>${estado.verEleitos?'Mostrar menos':`Ver todos os ${todos.length} eleitos`}</button>`:''}`;
}
function votosPorPartido(){
  const R=agregados(estado.eleicao),E=R.E,p={};
  for(const [n,q] of Object.entries(R.cidade.v)){const k=E.cands[n].p||'—';p[k]=(p[k]||0)+q}
  const lista=ordenar(p),tot=validos(R.cidade),max=lista[0][1];
  return `<div class="itens">${lista.slice(0,12).map(([k,q])=>`<div class="item" style="cursor:default">
      <span class="t">${esc(k)}</span><span class="v"><b>${fmt(q)}</b> · ${pct(q/tot*100)}</span>
      <span class="empilhada"><i style="width:${q/max*100}%;background:#5b7cb0"></i></span></div>`).join('')}</div>`;
}

/* Lista de bairros com ordenação */
function listaBairros(){
  const R=agregados(estado.eleicao),E=R.E,m=modoCor();
  const ids=Object.keys(R.bairros).filter(ativa);
  const chave={
    votos:id=>-R.bairros[id].c,
    vantagem:id=>{const v=vencedor(R.bairros[id],E);return -(v?v.margem:0)},
    comparecimento:id=>-R.bairros[id].c/R.bairros[id].a,
    nome:id=>BAIRRO[id].nome,
    candidato:id=>-partePct(R.bairros[id],m.n)
  };
  let ord=estado.ordemBairros;if(ord==='candidato'&&m.tipo!=='candidato')ord='votos';
  ids.sort((a,b)=>{const x=chave[ord](a),y=chave[ord](b);return typeof x==='string'?x.localeCompare(y):x-y});
  const opcoes=[['votos','Votantes'],...(m.tipo==='candidato'?[['candidato','% do candidato']]:isVereador()?[]:[['vantagem','Vantagem']]),['comparecimento','Comparec.'],['nome','A–Z']];
  const semDados=usaRegioes()?[]:D.bairros.filter(b=>!R.bairros[b.id]&&b.geo).map(b=>b.nome).sort();
  return `<div class="bloco"><p class="bloco-tit"><span>${usaRegioes()?'Por região':'Por bairro do colégio'} <small>${ids.length}</small></span>
    <span class="ordem" role="group" aria-label="Ordenar bairros">${opcoes.map(([k,t])=>`<button data-ordem="${k}" aria-pressed="${ord===k}">${t}</button>`).join('')}</span></p>
    <div class="itens">${ids.map(id=>{
      const T=R.bairros[id],b=BAIRRO[id];let dir,barra;
      if(m.tipo==='candidato'){const p=partePct(T,m.n);dir=`<b>${fmt(T.v[m.n]||0)}</b> · ${pct(p)}`;barra=`<span class="empilhada"><i style="width:${p/m.max*100}%;background:${m.cor}"></i></span>`}
      else if(isVereador()||ord==='comparecimento'){const t=T.c/T.a*100;dir=`<b>${pct(t)}</b> comparec.`;barra=`<span class="empilhada"><i style="width:${t}%;background:#22b8cf"></i></span>`}
      else{const v=vencedor(T,E);dir=`<b style="color:${corCand(v.n)}">${esc(cand(v.n).u)}</b> ${pct(v.p)}`;barra=barraEmpilhada(T,E)}
      return `<button class="item" data-bairro="${esc(id)}"><span class="t">${esc(b.nome)}${b.tipo!=='bairro'?`<small>${b.tipo}</small>`:''}</span><span class="v">${dir}</span>${barra}</button>`;
    }).join('')}</div>
    <p class="nota" style="margin:8px 2px 0">${usaRegioes()?'Cada região soma os colégios dos bairros que a formam; reduz o efeito de quem mora num bairro e vota em outro.':'Votos contados no bairro onde fica o colégio. O eleitor pode morar em outro bairro.'}</p>
    ${semDados.length?`<details class="mais"><summary>${semDados.length} bairros sem colégio eleitoral ▾</summary><p>${semDados.map(esc).join(' · ')}</p></details>`:''}
  </div>`;
}

function htmlCidade(){
  const R=agregados(estado.eleicao),E=R.E,T=R.cidade;
  let h=`<div class="bloco">${kpis(T)}</div>`;
  if(isVereador()){
    h+=`<div class="bloco"><p class="bloco-tit"><span>Candidato</span><small>${Object.keys(R.cidade.v).filter(n=>!E.cands[n].leg).length} com votos</small></p>${blocoBuscaVereador()}
      ${estado.candidato?`<div style="margin-top:12px">${fichaCandidato(estado.candidato,T)}</div>`:'<p class="nota" style="margin:10px 2px 0">Escolha um candidato para ver no mapa onde ele teve mais votos.</p>'}</div>`;
    if(estado.candidato)h+=topBairrosCandidato(estado.candidato);
    h+=`<div class="bloco"><p class="bloco-tit"><span>${E.cargo==='Vereador'?'Câmara eleita':'Eleitos pela Bahia'}</span><small>${E.cargo==='Vereador'?'21 vereadores':'ordem de votos em Juazeiro'}</small></p>${camaraEleita()}</div>`;
    h+=`<div class="bloco"><p class="bloco-tit"><span>Votos por partido</span><small>nominais + legenda</small></p>${votosPorPartido()}</div>`;
  }else{
    h+=`<div class="bloco"><p class="bloco-tit"><span>Resultado</span><small>toque para colorir o mapa</small></p>${linhasCandidatos(T,null)}
      ${(D.indice[estado.eleicao].vagas||1)>1?'<p class="nota" style="margin:10px 2px 0">Duas vagas em disputa: cada eleitor votou em até 2 candidatos. Os percentuais são sobre o total de votos válidos, como o TSE divulga.</p>':''}</div>`;
  }
  h+=listaBairros();
  h+=`<div class="bloco"><p class="nota"><b>Fontes:</b> TSE, dados abertos de votação por seção e cadastro de locais de votação; contornos de bairros do OpenStreetMap (via Overture Maps).
    <b>Como ler:</b> cada colégio é contado no bairro onde o prédio fica, não onde o eleitor mora; muita gente vota em colégio de bairro vizinho. Percentuais sobre votos válidos.</p></div>`;
  return h;
}
function topBairrosCandidato(n){
  const R=agregados(estado.eleicao);
  const lista=areasAtivas(R).map(([id,T])=>[id,T.v[n]||0,partePct(T,n)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!lista.length)return '';
  const max=lista[0][1];
  return `<div class="bloco"><p class="bloco-tit"><span>Onde teve mais votos</span></p><div class="itens">${lista.map(([id,q,p])=>`<button class="item" data-bairro="${esc(id)}">
    <span class="t">${esc(BAIRRO[id].nome)}</span><span class="v"><b>${fmt(q)}</b> · ${pct(p)} ${ehRegiao(id)?'da região':'nos colégios do bairro'}</span>
    <span class="empilhada"><i style="width:${q/max*100}%;background:var(--acento)"></i></span></button>`).join('')}</div></div>`;
}

function htmlBairro(id){
  const R=agregados(estado.eleicao),E=R.E,T=R.bairros[id],b=BAIRRO[id];
  if(!T)return `<div class="bloco"><p class="vazio">Nenhum colégio eleitoral fica dentro deste ${b.tipo}. Quem mora aqui vota em colégios de bairros vizinhos, que aparecem como pontos no mapa.${REGIAO_DE[id]&&VARIANTE==='lab'?` Veja a região <b>${esc(BAIRRO[REGIAO_DE[id]].nome)}</b> na opção “Regiões” da legenda.`:''}</p></div>`;
  const onde=ehRegiao(id)?'na região':b.tipo==='bairro'?'nos colégios do bairro':`no ${b.tipo}`;
  let h='';
  if(ehRegiao(id)&&b.bairros.length>1)h+=`<p class="nota" style="margin:12px 0 0">Bairros desta região: ${b.bairros.map(x=>esc(BAIRRO[x]?.nome||x)).join(', ')}.</p>`;
  else if(b.tipo==='bairro')h+=`<p class="nota" style="margin:12px 0 0">Números dos colégios que ficam neste bairro. Parte dos eleitores mora em bairros vizinhos.</p>`;
  h+=`<div class="bloco">${kpis(T)}</div>`;
  if(isVereador()){
    if(estado.candidato)h+=`<div class="bloco">${fichaCandidato(estado.candidato,T,onde)}</div>`;
    else h+=`<div class="bloco">${blocoBuscaVereador()}</div>`;
    h+=`<div class="bloco"><p class="bloco-tit"><span>Mais votados ${onde}</span></p>${maisVotadosVereador(T)}</div>`;
  }else{
    h+=`<div class="bloco"><p class="bloco-tit"><span>Resultado ${onde}</span></p>${linhasCandidatos(T,R.cidade)}</div>`;
  }
  const locais=[...T.locais].sort((a,b)=>R.locais[b].c-R.locais[a].c);
  const maxCand=estado.candidato?Math.max(...locais.map(x=>partePct(R.locais[x],estado.candidato)),.1):1;
  h+=`<div class="bloco"><p class="bloco-tit"><span>Locais de votação</span><small>${locais.length}</small></p><div class="itens">${locais.map(lid=>{
    const TL=R.locais[lid],l=R.L[lid];let dir,barra;
    if(isVereador()&&estado.candidato){const q=TL.v[estado.candidato]||0;dir=`<b>${fmt(q)}</b> votos · ${pct(partePct(TL,estado.candidato))}`;barra=`<span class="empilhada"><i style="width:${partePct(TL,estado.candidato)/maxCand*100}%;background:var(--acento)"></i></span>`}
    else if(isVereador()){dir=`<b>${TL.urnas}</b> urnas · ${fmt(TL.c)} votantes`;barra=''}
    else{const v=vencedor(TL,E);dir=`<b style="color:${corCand(v.n)}">${esc(cand(v.n).u)}</b> ${pct(v.p)}`;barra=barraEmpilhada(TL,E)}
    return `<button class="item" data-local="${lid}"><span class="t">${esc(l.n)}</span><span class="v">${dir}</span>${barra}</button>`;
  }).join('')}</div></div>`;
  return h;
}

function htmlLocal(lid){
  const R=agregados(estado.eleicao),E=R.E,T=R.locais[lid],l=R.L[lid];
  if(!T)return `<div class="bloco"><p class="vazio">Este local não teve urnas nesta eleição.</p></div>`;
  let h='';
  if(l.b&&BAIRRO[l.b]&&semAcento(BAIRRO[l.b].nome)!==semAcento(l.bt.replace(/^(DISTRITO|POVOADO) /,'')))
    h+=`<p class="nota" style="margin:12px 0 0">No cadastro do TSE, o bairro deste local é <b>${esc(l.bt)}</b>. No mapa, ele está dentro de ${esc(BAIRRO[l.b].nome)}.</p>`;
  const secoes=R.secoesPorLocal[lid]||[];
  h+=`<button class="ir-urnas" data-ir-urnas>Ver boletins de urna <b>${secoes.length}</b><span aria-hidden="true">↓</span></button>`;
  h+=`<div class="bloco">${kpis(T)}</div>`;
  if(isVereador()){
    if(estado.candidato)h+=`<div class="bloco">${fichaCandidato(estado.candidato,T,'neste local')}</div>`;
    h+=`<div class="bloco"><p class="bloco-tit"><span>Mais votados no local</span></p>${maisVotadosVereador(T)}</div>`;
  }else{
    h+=`<div class="bloco"><p class="bloco-tit"><span>Resultado no local</span></p>${linhasCandidatos(T,R.cidade)}</div>`;
  }
  h+=`<div class="bloco" id="boletins"><p class="bloco-tit"><span>Boletins de urna</span><small>${secoes.length} urna(s) · toque para abrir</small></p>
    ${secoes.map(sk=>htmlUrna(sk,E.secoes[sk],l)).join('')}</div>`;
  return h;
}
function htmlUrna(sk,s,l){
  const R=agregados(estado.eleicao),E=R.E,[z,sec]=sk.split('-'),v=s[6],tot=soma(v);
  const agregadas=Object.entries(l.ag||{}).filter(([,p])=>p===+sec).map(([a])=>a.padStart(4,'0'));
  const lista=ordenar(v);
  const top=lista.filter(([n])=>!E.cands[n].leg)[0];
  let res='';
  if(isVereador()&&estado.candidato)res=`<span style="color:var(--acento)">${fmt(v[estado.candidato]||0)}</span> <span style="color:var(--suave);font-weight:500">votos</span>`;
  else if(top)res=`<span style="color:${corCand(top[0])}">${esc(cand(top[0]).u)}</span> ${fmt(top[1])}`;
  const nom=lista.filter(([n])=>!E.cands[n].leg).reduce((a,[,q])=>a+q,0);
  return `<details class="urna"><summary>
      <span class="sec">Seção ${sec.padStart(4,'0')}</span><span class="res">${res}</span>
      <span class="sub">Zona ${z} · ${fmt(s[2])} de ${fmt(s[1])} votaram (${pct(s[2]/s[1]*100)})</span>
    </summary><div class="bu">
      <div class="bu-cab"><span>Boletim de urna · ${esc(E.titulo)}</span><span>Z${z} S${sec.padStart(4,'0')}</span></div>
      ${agregadas.length?`<p class="bu-nota">Inclui a seção agregada ${agregadas.join(', ')}.</p>`:''}
      <div class="bu-grade">
        <div><span>Aptos</span><b>${fmt(s[1])}</b></div><div><span>Votaram</span><b>${fmt(s[2])}</b></div><div><span>Faltaram</span><b>${fmt(s[1]-s[2])}</b></div>
        <div><span>Nominais</span><b>${fmt(nom)}</b></div><div><span>Brancos</span><b>${fmt(s[3])}</b></div><div><span>Nulos</span><b>${fmt(s[4])}</b></div>
        ${isVereador()?`<div><span>Legenda</span><b>${fmt(s[5])}</b></div>`:''}
      </div>
      ${lista.map(([n,q])=>{const c=E.cands[n];return `<div class="bu-linha${estado.candidato===n?' dest':''}">
        <span class="n">${n}</span><span class="nm">${c.leg?'Legenda ':''}${esc(c.u)}${!c.leg&&c.p?`<small>${esc(c.p)}</small>`:''}</span><span class="q">${fmt(q)}</span></div>`}).join('')}
    </div></details>`;
}

function cabecalho(){
  const R=agregados(estado.eleicao),E=R.E;
  const trilha=[];
  if(estado.nivel!=='cidade'){
    const destino=estado.nivel==='local'&&estado.bairro?BAIRRO[estado.bairro].nome:'Juazeiro';
    trilha.push(`<button class="voltar" data-voltar><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>${esc(destino)}</button>`);
    trilha.push(`<button class="ao-inicio" data-inicio aria-label="Voltar ao início (Juazeiro inteira)" title="Voltar ao início">✕</button>`);
  }
  let sobre,tit,sub;
  if(modoComparar())({sobre,tit,sub}=cabecalhoComparar());
  else if(estado.nivel==='cidade'){
    sobre='Juazeiro · Bahia';tit=E.titulo;
    sub=`${fmt(R.cidade.urnas)} urnas em ${R.cidade.locais.size} locais de votação`;
  }else if(estado.nivel==='bairro'){
    const b=BAIRRO[estado.bairro],T=R.bairros[estado.bairro];
    sobre=b.tipo==='bairro'?'Colégios no bairro':b.tipo==='região'?'Região':b.tipo==='distrito'?'Distrito':'Povoado';tit=b.nome;
    sub=T?`${T.locais.size} local(is) · ${T.urnas} urnas · ${E.titulo}`:E.titulo;
  }else{
    const l=R.L[estado.local],T=R.locais[estado.local];
    sobre=`Local de votação · Zona ${estado.local.split('-')[0]}`;tit=l.n;sub=l.e;
  }
  return `${estado.nivel==='cidade'?abasModo():''}${trilha.length?`<nav class="trilha" aria-label="Navegação">${trilha.join('')}</nav>`:''}
    <p class="sobre">${esc(sobre)}</p><h2 id="titulo-painel">${esc(tit)}</h2><p class="sub">${esc(sub)}</p>`;
}

function atualizarPainel(){
  $('#painel-cab').innerHTML=cabecalho();
  const corpo=$('#painel-corpo');
  if(modoComparar()){
    corpo.innerHTML=estado.nivel==='cidade'||!cmpPronto()?htmlCompararCidade():estado.nivel==='bairro'?htmlCompararBairro(estado.bairro):htmlCompararLocal(estado.local);
    ligarBuscaComparar();return;
  }
  corpo.innerHTML=estado.nivel==='cidade'?htmlCidade():estado.nivel==='bairro'?htmlBairro(estado.bairro):htmlLocal(estado.local);
  ligarBusca();
}
let ultimoNivel='';
function atualizar(){
  const chaveNivel=estado.modo+estado.nivel+estado.bairro+estado.local+estado.eleicao;
  if(modoComparar()&&cmpPronto())cmpCalcularEscalas();
  const rolar=chaveNivel!==ultimoNivel;ultimoNivel=chaveNivel;
  const topo=$('#painel-corpo').scrollTop;
  atualizarPainel();
  if(rolar)$('#painel-corpo').scrollTop=0;else $('#painel-corpo').scrollTop=topo;
  estilizarBairros();desenharLocais();atualizarLegenda();
  $('#chip-inicio').hidden=estado.nivel==='cidade';
  $('#eleicao').classList.toggle('inativo',modoComparar());
  if(typeof atualizarLab==='function')atualizarLab();   // só existe na versão Laboratório
}

/* Busca de vereador */
function ligarBusca(){
  const inp=$('#busca'),ul=$('#sugestoes');if(!inp)return;
  const R=agregados(estado.eleicao),E=R.E;
  const todos=Object.entries(E.cands).filter(([,c])=>!c.leg).map(([n,c])=>[n,c,R.cidade.v[n]||0]).sort((a,b)=>b[2]-a[2]);
  inp.addEventListener('input',()=>{
    const t=semAcento(inp.value.trim());
    if(t.length<2&&!/^\d+$/.test(t)){ul.hidden=true;return}
    const r=todos.filter(([n,c])=>n.startsWith(t)||semAcento(c.u).includes(t)||semAcento(c.n||'').includes(t)).slice(0,12);
    ul.innerHTML=r.length?r.map(([n,c,q])=>`<li><button data-candidato="${n}"><span>${esc(c.u)} <small>${esc(c.p)} · ${n}</small></span><small>${fmt(q)} votos</small></button></li>`).join('')
      :'<li style="padding:10px;color:var(--suave)">Nenhum candidato encontrado</li>';
    ul.hidden=false;
    if(!DESKTOP())fixarBusca(inp);
  });
  /* Celular: ao digitar, o painel sobe, o cabeçalho recolhe e a busca fica no topo, acima do teclado */
  inp.addEventListener('focus',()=>{
    if(DESKTOP())return;
    clearTimeout(timerBusca);
    $('#painel').classList.add('buscando');folha('cima');
    setTimeout(()=>fixarBusca(inp),60);setTimeout(()=>fixarBusca(inp),350);
  });
  inp.addEventListener('blur',()=>{
    // espera o toque na sugestão ser processado antes de reorganizar o painel
    timerBusca=setTimeout(()=>{$('#painel').classList.remove('buscando');if(!inp.value)ul.hidden=true},300);
  });
}
let timerBusca=null;
function fixarBusca(inp){
  const corpo=$('#painel-corpo'),caixa=inp.closest('.busca');
  corpo.scrollTop+=caixa.getBoundingClientRect().top-corpo.getBoundingClientRect().top-8;
}
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{
  const inp=$('#busca');if(inp&&document.activeElement===inp&&!DESKTOP())fixarBusca(inp);
});

/* Cliques no painel (delegação) */
$('#painel').addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if('voltar' in t.dataset)return voltar();
  if('inicio' in t.dataset)return voltarAoInicio();
  if(t.dataset.bairro)return irBairro(t.dataset.bairro);
  if(t.dataset.local)return irLocal(t.dataset.local);
  if(t.dataset.candidato){clearTimeout(timerBusca);$('#painel').classList.remove('buscando');escolherCandidato(t.dataset.candidato);return}
  if('limpar' in t.dataset){estado.candidato=null;atualizar();return}
  if('irUrnas' in t.dataset){const alvo=$('#boletins');if(alvo){folha('cima');alvo.scrollIntoView({behavior:MOVIMENTO?'smooth':'auto',block:'start'})}return}
  if('verTodos' in t.dataset){estado.verTodos=!estado.verTodos;atualizar();return}
  if('verEleitos' in t.dataset){estado.verEleitos=!estado.verEleitos;atualizar();return}
  if(t.dataset.ordem){estado.ordemBairros=t.dataset.ordem;atualizar();return}
  if(t.dataset.colorir){const k='cand:'+t.dataset.colorir;estado.colorir=estado.colorir===k?'vencedor':k;$('#colorir').value=estado.colorir;atualizar();return}
});

/* ══════════════════════════════════════════════════════════
   Legenda e camadas
══════════════════════════════════════════════════════════ */
function atualizarLegenda(){
  if(modoComparar()){legendaComparar();return}
  const R=agregados(estado.eleicao),E=R.E,m=modoCor(),sel=$('#colorir');
  if(isVereador()){
    sel.innerHTML=`<option value="x">${estado.candidato?'% do candidato escolhido':'Comparecimento'}</option>`;sel.disabled=true;
  }else{
    sel.disabled=false;
    const top=ordenar(R.cidade.v).slice(0,6);
    sel.innerHTML=`<option value="vencedor">Quem venceu</option>`+top.map(([n])=>`<option value="cand:${n}">% de ${esc(E.cands[n].u)}</option>`).join('')+`<option value="comparecimento">Comparecimento</option>`;
    sel.value=estado.colorir;if(sel.value!==estado.colorir){estado.colorir='vencedor';sel.value='vencedor'}
  }
  let itens='',dica='',amostras='';
  if(m.tipo==='vencedor'){
    const venc=new Set(Object.values(R.bairros).map(T=>vencedor(T,E)?.n).filter(Boolean));
    const lista=ordenar(R.cidade.v).filter(([n])=>venc.has(n));
    itens=lista.map(([n])=>`<div><i style="background:${corCand(n)}"></i>${esc(E.cands[n].u)}</div>`).join('');
    amostras=lista.map(([n])=>`<i style="background:${corCand(n)}"></i>`).join('');
    dica='Cor mais forte = vantagem maior. Ponto = local de votação, tamanho pelo nº de votos.';
  }else if(m.tipo==='candidato'){
    itens=`<div class="leg-grad" style="background:linear-gradient(90deg,transparent,${m.cor})"></div><div class="leg-escala"><span>0%</span><span>${pct(m.max,0)} dos válidos</span></div>`;
    amostras=`<i style="background:${m.cor}"></i>`;
    dica=`Bairros pela fatia de votos de ${esc(E.cands[m.n].u)}. Pontos pelo nº de votos dele em cada local.`;
  }else{
    itens=`<div class="leg-grad" style="background:linear-gradient(90deg,rgba(34,184,207,.1),#22b8cf)"></div><div class="leg-escala"><span>${pct(m.min,0)}</span><span>${pct(m.max,0)}</span></div>`;
    amostras=`<i style="background:#22b8cf"></i>`;
    dica=isVereador()?'Escolha um candidato para ver onde ele foi mais votado.':'Percentual de eleitores aptos que votaram.';
  }
  $('#leg-itens').innerHTML=`<div class="leg-itens">${itens}</div>`;
  $('#leg-dica').textContent=dica;
  $('#leg-amostras').innerHTML=amostras;
}
$('#colorir').addEventListener('change',e=>{const v=e.target.value;if(v.startsWith('cmp:'))CMP.metrica=v.slice(4);else estado.colorir=v;atualizar()});
function legendaAberta(abrir){const l=$('#legenda');l.classList.toggle('aberta',abrir);$('#leg-botao').setAttribute('aria-expanded',abrir)}
$('#leg-botao').addEventListener('click',()=>legendaAberta(!$('#legenda').classList.contains('aberta')));
if(DESKTOP())legendaAberta(true);   // no computador começa aberta; no celular, recolhida
/* No celular, a legenda aberta cobre o mapa: o primeiro toque fora dela só a fecha */
document.addEventListener('pointerdown',e=>{
  if(DESKTOP()||!$('#legenda').classList.contains('aberta')||e.target.closest('#legenda'))return;
  legendaAberta(false);
  if(e.target.closest('#map')){
    const parar=ev=>{ev.stopPropagation();ev.preventDefault()};
    document.addEventListener('click',parar,{capture:true,once:true});
    setTimeout(()=>document.removeEventListener('click',parar,{capture:true}),600);
  }
},true);
document.querySelectorAll('[data-camada]').forEach(b=>b.addEventListener('click',()=>{
  const k=b.dataset.camada;estado[k]=!estado[k];b.setAttribute('aria-pressed',estado[k]);
  estilizarBairros();desenharLocais();
}));

/* Seletor de eleição */
const pedidos={};
function carregarEleicao(ch){
  if(D.eleicoes[ch])return Promise.resolve();
  return pedidos[ch]||(pedidos[ch]=fetch(`eleicoes/${ch}.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()})
    .then(e=>{D.eleicoes[ch]=e}).catch(err=>{delete pedidos[ch];throw err}));
}
$('#eleicao').addEventListener('change',e=>{
  const nova=e.target.value,sel=e.target;
  if(!D.eleicoes[nova])$('#painel-corpo').innerHTML=`<p class="carregando">Carregando ${esc(D.indice[nova].titulo)}…</p>`;
  carregarEleicao(nova).then(()=>{
    if(sel.value!==nova)return;
    estado.modo='eleicao';estado.eleicao=nova;estado.colorir='vencedor';estado.candidato=null;estado.verTodos=false;estado.verEleitos=false;
    if(estado.nivel==='local'&&!agregados(nova).locais[estado.local]){estado.nivel=estado.bairro?'bairro':'cidade';estado.local=null}
    if(estado.nivel==='bairro'&&!estado.bairro)estado.nivel='cidade';
    atualizar();
  }).catch(()=>{
    sel.value=estado.eleicao;
    $('#painel-corpo').innerHTML='<div class="bloco"><p class="vazio">Não foi possível carregar esta eleição. Verifique a conexão e escolha de novo.</p></div>';
  });
});

/* ══════════════════════════════════════════════════════════
   Folha deslizante (celular)
══════════════════════════════════════════════════════════ */
let estadoFolha='baixo';
function alturaFolha(){
  if(DESKTOP())return 0;
  const h=$('.app').clientHeight;
  return estadoFolha==='baixo'?Math.min(170,h*.3):estadoFolha==='meio'?h*.52:h-8;
}
function folha(s){
  if(DESKTOP())return;
  if(s==='meio'&&estadoFolha==='cima')return;
  estadoFolha=s;$('#painel').style.setProperty('--folha-visivel',alturaFolha()+'px');
}
(function arrastar(){
  const p=$('#painel');let y0=null,h0=0;
  const ini=e=>{if(DESKTOP())return;y0=e.clientY;h0=alturaFolha();p.classList.add('arrastando');e.target.setPointerCapture?.(e.pointerId)};
  const mov=e=>{if(y0===null)return;const h=Math.max(120,Math.min($('.app').clientHeight-8,h0+(y0-e.clientY)));p.style.setProperty('--folha-visivel',h+'px')};
  const fim=e=>{if(y0===null)return;const dy=y0-e.clientY;p.classList.remove('arrastando');y0=null;
    const ordem=['baixo','meio','cima'],i=ordem.indexOf(estadoFolha);
    if(Math.abs(dy)<8){folha(ordem[(i+1)%3]);return}
    folha(dy>0?ordem[Math.min(2,i+(dy>200?2:1))]:ordem[Math.max(0,i-(dy<-200?2:1))]);};
  for(const el of [$('#alca')]){el.addEventListener('pointerdown',ini);el.addEventListener('pointermove',mov);el.addEventListener('pointerup',fim);el.addEventListener('pointercancel',fim)}
  const cab=$('#painel-cab');
  cab.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;ini(e)});
  cab.addEventListener('pointermove',mov);cab.addEventListener('pointerup',fim);cab.addEventListener('pointercancel',fim);
})();
addEventListener('resize',()=>folha(estadoFolha));
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if($('#legenda').classList.contains('aberta')){legendaAberta(false);return}
  if(estado.nivel!=='cidade')voltar();
});
/* Tocar numa área vazia do mapa sobe um nível */
map.on('click',()=>{if(estado.nivel!=='cidade')voltar()});
$('#chip-inicio').addEventListener('click',voltarAoInicio);

/* ══════════════════════════════════════════════════════════
   Início
══════════════════════════════════════════════════════════ */
folha('baixo');
fetch('dados.json').then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).then(d=>{
  D=d;D.eleicoes={};
  return carregarEleicao(estado.eleicao);
}).then(()=>{
  montarMapa();atualizar();atualizarRotulos();
  map.fitBounds(L.latLngBounds([[-9.475,-40.56],[-9.39,-40.455]]),DESKTOP()?{paddingBottomRight:[260,0]}:{paddingTopLeft:[10,50],paddingBottomRight:[10,alturaFolha()]});
}).catch(()=>{
  $('#painel-corpo').innerHTML='<div class="bloco"><p class="vazio">Não foi possível carregar os resultados. Recarregue a página para tentar de novo.</p></div>';
});
