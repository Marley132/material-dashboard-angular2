/* ══════════════════════════════════════════════════════════
   Comparar candidatos entre eleições (mesmo de cargos diferentes)
   A comparação é feita por local de votação (o código do local se mantém entre eleições)
   e somada por bairro e cidade. Urnas são comparadas pelo mesmo número de seção no mesmo local:
   de 2022 a 2026 quase todas se mantêm; em 2020 houve reorganização, então cada urna mostra se o
   eleitorado mudou muito.
══════════════════════════════════════════════════════════ */
const CMP={a:{el:'2024_VEREADOR',n:'13140'},b:{el:'2026_DEPUTADO_FEDERAL',n:'1361'},metrica:'razao'};
const COR_A='#22b8cf',COR_B='#f2b33d',SOBE='#3fbf7f',DESCE='#f0645c';
const METRICAS={razao:'Retenção (B ÷ A)',dif:'Diferença de votos',pp:'Diferença em % dos válidos'};
const modoComparar=()=>estado.modo==='comparar';
const cmpPronto=()=>!!(CMP.a.n&&CMP.b.n&&D.eleicoes[CMP.a.el]&&D.eleicoes[CMP.b.el]);
const cmpCand=s=>D.eleicoes[CMP[s].el].cands[CMP[s].n];
let cmpEscalas={bairros:1,locais:1};

function cmpVotos(s,nivel,id){
  const R=agregados(CMP[s].el),T=nivel==='cidade'?R.cidade:R[nivel][id];
  if(!T)return {v:0,val:0,existe:false};
  return {v:T.v[CMP[s].n]||0,val:validos(T),existe:true};
}
function cmpPar(nivel,id){
  const a=cmpVotos('a',nivel,id),b=cmpVotos('b',nivel,id);
  const pa=a.val?a.v/a.val*100:0,pb=b.val?b.v/b.val*100:0;
  return {a,b,pa,pb,razao:a.v?b.v/a.v:(b.v?Infinity:null),dif:b.v-a.v,pp:pb-pa};
}
function cmpUnidades(nivel){
  const ids=[...new Set([...Object.keys(agregados(CMP.a.el)[nivel]),...Object.keys(agregados(CMP.b.el)[nivel])])];
  return nivel==='bairros'?ids.filter(ativa):ids;   // só bairros ou só regiões, conforme a vista
}
function cmpCalcularEscalas(){
  for(const nivel of ['bairros','locais']){
    const xs=cmpUnidades(nivel).map(id=>{const p=cmpPar(nivel,id);return Math.abs(CMP.metrica==='dif'?p.dif:p.pp)});
    cmpEscalas[nivel]=Math.max(...xs,1e-6);
  }
}
/* -1 (caiu muito) … 0 (igual) … +1 (cresceu muito); null = nenhum dos dois teve votos */
function cmpIntensidade(p,nivel){
  if(CMP.metrica==='razao'){
    if(p.razao===null)return null;
    // com poucos votos a razão oscila muito (de 2 para 6 já é ×3): a cor é atenuada abaixo de 30 votos
    const peso=Math.min(1,Math.max(p.a.v,p.b.v)/30);
    if(p.razao===Infinity)return peso;
    if(p.razao===0)return -peso;
    return Math.max(-1,Math.min(1,Math.log2(p.razao)/2))*peso;   // ×4 ou ÷4 satura a cor
  }
  if(!p.a.v&&!p.b.v)return null;
  return Math.max(-1,Math.min(1,(CMP.metrica==='dif'?p.dif:p.pp)/cmpEscalas[nivel]));
}
const cmpCor=t=>t===null?'#6b7486':t>=0?SOBE:DESCE;
function cmpFmtRazao(p){
  if(p.razao===null)return '—';
  if(p.razao===Infinity)return 'só B';
  return pct(p.razao*100,0);
}
function cmpValor(p){
  if(CMP.metrica==='razao')return cmpFmtRazao(p);
  if(CMP.metrica==='dif')return (p.dif>0?'+':'')+fmt(p.dif);
  return (p.pp>0?'+':'')+p.pp.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' p.p.';
}

/* ── Mapa ── */
function estiloComparar(id){
  const sel=estado.bairro===id,algumSel=!!estado.bairro;
  if(!estado.camadaBairros)return {stroke:false,fill:false};
  const p=cmpPar('bairros',id);
  if(!p.a.existe&&!p.b.existe)return {color:'#6b7486',weight:sel?2.5:.8,opacity:sel?1:.6,dashArray:'3 4',fill:true,fillColor:'#0b0e13',fillOpacity:sel?.25:.02};
  const t=cmpIntensidade(p,'bairros'),cor=cmpCor(t),op=t===null?.04:.1+.6*Math.abs(t);
  return {color:sel?'#ffffff':cor,weight:sel?3:1,opacity:sel?1:.8,dashArray:null,fill:true,fillColor:cor,fillOpacity:algumSel&&!sel?op*.45:op};
}
function desenharLocaisComparar(){
  const ids=cmpUnidades('locais'),pares=ids.map(id=>[id,cmpPar('locais',id)]);
  const mx=Math.max(...pares.map(([,p])=>Math.max(p.a.v,p.b.v)),1);
  for(const [lid,p] of pares){
    const l=infoLocal(lid);if(!l||!l.p)continue;
    const v=Math.max(p.a.v,p.b.v),t=cmpIntensidade(p,'locais'),sel=estado.local===lid,fora=estado.bairro&&areaDe(l)!==estado.bairro;
    const c=L.circleMarker([l.p[1],l.p[0]],{pane:'locais',radius:v>0?Math.max(4,Math.sqrt(v/mx)*17):3.5,
      color:sel?'#fff':'#0b0e13',weight:sel?3:1.4,fillColor:cmpCor(t),fillOpacity:fora?.35:.95,opacity:fora?.5:1});
    c.on('click',e=>{L.DomEvent.stopPropagation(e);irLocal(lid)});
    if(PASSAR_MOUSE)c.bindTooltip(()=>cmpDica(l.n,p),{className:'dica-mapa',direction:'top',offset:[0,-6]});
    c.addTo(map);camadas.locais[lid]=c;
  }
}
function cmpDica(nome,p){
  return `<b>${esc(nome)}</b><br><span style="color:${COR_A}">●</span> ${esc(cmpCand('a').u)}: <b>${fmt(p.a.v)}</b>
    <br><span style="color:${COR_B}">●</span> ${esc(cmpCand('b').u)}: <b>${fmt(p.b.v)}</b><br><span class="x">${METRICAS[CMP.metrica]}: </span><b>${cmpValor(p)}</b>`;
}
function infoLocal(lid){
  if(modoComparar()&&cmpPronto())
    return D.anos[D.eleicoes[CMP.b.el].ano].locais[lid]||D.anos[D.eleicoes[CMP.a.el].ano].locais[lid];
  return agregados(estado.eleicao).L[lid];
}

/* ── Painel ── */
function cmpSlot(s){
  const nome=s==='a'?'A · base':'B · comparação',cor=s==='a'?COR_A:COR_B,X=CMP[s];
  const opcoes=Object.entries(D.indice).map(([k,i])=>`<option value="${k}"${k===X.el?' selected':''}>${esc(i.titulo)}</option>`).join('');
  let corpo;
  if(X.n&&D.eleicoes[X.el]){
    const c=cmpCand(s),tot=agregados(X.el).cidade.v[X.n]||0;
    corpo=`<div class="slot-cand"><div><b>${esc(c.u)}</b><small>${esc(c.p)} · nº ${X.n}${c.s?' · '+esc(c.s):''}</small></div>
      <button class="slot-trocar" data-cmp-trocar="${s}">Trocar</button></div>`;
  }else{
    corpo=`<div class="busca"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="busca-${s}" data-cmp-busca="${s}" type="search" autocomplete="off" placeholder="Nome ou número do candidato" aria-label="Buscar candidato ${s.toUpperCase()}"></div>
      <ul class="sugestoes" id="sug-${s}" hidden></ul>`;
  }
  return `<div class="slot" style="--slot:${cor}">
    <p class="slot-tit"><i></i>${nome}</p>
    <select data-cmp-eleicao="${s}" aria-label="Eleição do candidato ${s.toUpperCase()}">${opcoes}</select>
    ${corpo}</div>`;
}
function cmpMetricas(){
  return `<div class="ordem metricas" role="group" aria-label="Métrica de comparação">${Object.entries(METRICAS).map(([k,t])=>
    `<button data-cmp-metrica="${k}" aria-pressed="${CMP.metrica===k}">${k==='razao'?'Retenção':k==='dif'?'Diferença':'% válidos'}</button>`).join('')}</div>`;
}
function cmpResumo(nivel,id){
  const p=cmpPar(nivel,id),A=cmpCand('a'),B=cmpCand('b');
  let frase;
  if(p.razao===null)frase='Nenhum dos dois teve votos aqui.';
  else if(p.razao===Infinity)frase=`${esc(B.u)} teve votos aqui e ${esc(A.u)} não.`;
  else frase=`${esc(B.u)} teve <b>${fmt(Math.round(p.razao*100))}</b> votos para cada <b>100</b> de ${esc(A.u)}.`;
  const tCor=cmpCor(cmpIntensidade(p,nivel==='cidade'?'bairros':nivel));
  return `<div class="duelo">
      <div style="--slot:${COR_A}"><span>${esc(A.u)} <small>${esc(D.indice[CMP.a.el].titulo)}</small></span><b>${fmt(p.a.v)}</b><em>${pct(p.pa,2)} dos válidos</em></div>
      <div style="--slot:${COR_B}"><span>${esc(B.u)} <small>${esc(D.indice[CMP.b.el].titulo)}</small></span><b>${fmt(p.b.v)}</b><em>${pct(p.pb,2)} dos válidos</em></div>
    </div>
    <div class="veredito" style="--t:${tCor}">
      <div><span>Retenção</span><b>${cmpFmtRazao(p)}</b></div>
      <div><span>Diferença</span><b>${p.dif>0?'+':''}${fmt(p.dif)}</b></div>
      <div><span>% válidos</span><b>${p.pp>0?'+':''}${p.pp.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} p.p.</b></div>
    </div>
    <p class="nota" style="margin:10px 2px 0">${frase}</p>`;
}
function pearson(xs,ys){
  const n=xs.length;if(n<3)return null;
  const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
  let sxy=0,sx=0,sy=0;for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy}
  return sx&&sy?sxy/Math.sqrt(sx*sy):null;
}
function cmpDispersao(ids){
  const pts=ids.map(id=>[id,cmpPar('locais',id)]).filter(([,p])=>p.a.v||p.b.v);
  if(pts.length<2)return '';
  const r=pearson(pts.map(([,p])=>p.a.v),pts.map(([,p])=>p.b.v));
  const mx=Math.max(...pts.map(([,p])=>Math.max(p.a.v,p.b.v)));
  const W=320,H=250,m={l:40,r:12,t:12,b:38},w=W-m.l-m.r,h=H-m.t-m.b;
  const X=v=>m.l+v/mx*w,Y=v=>m.t+h-v/mx*h;
  const passo=Math.pow(10,Math.floor(Math.log10(mx)));const tick=mx/passo>5?passo*2:mx/passo>2?passo:passo/2;
  let grade='';for(let v=0;v<=mx;v+=tick){grade+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${m.l-6}" y="${Y(v)+3}" text-anchor="end">${fmt(v)}</text><text x="${X(v)}" y="${H-m.b+14}" text-anchor="middle">${fmt(v)}</text>`}
  const leitura=r===null?'':r>=.7?'os votos vieram, em boa parte, dos mesmos colégios':r>=.4?'as bases se sobrepõem em parte':'as bases são bem diferentes';
  return `<div class="bloco"><p class="bloco-tit"><span>Colégio a colégio</span><small>${pts.length} locais</small></p>
    <svg class="dispersao" viewBox="0 0 ${W} ${H}" role="img" aria-label="Votos de A (eixo horizontal) contra votos de B (eixo vertical) em cada local de votação">
      ${grade}
      <line x1="${X(0)}" y1="${Y(0)}" x2="${X(mx)}" y2="${Y(mx)}" class="diag"/>
      <text x="${X(mx)-4}" y="${Y(mx)+14}" text-anchor="end" class="diag-t">mesma votação</text>
      ${pts.map(([id,p])=>`<circle data-local="${id}" cx="${X(p.a.v).toFixed(1)}" cy="${Y(p.b.v).toFixed(1)}" r="${estado.local===id?6:4.2}" fill="${cmpCor(cmpIntensidade(p,'locais'))}"${estado.local===id?' stroke="#fff" stroke-width="2"':''}><title>${esc(infoLocal(id)?.n||id)}: A ${fmt(p.a.v)} · B ${fmt(p.b.v)}</title></circle>`).join('')}
      <text x="${m.l+w/2}" y="${H-4}" text-anchor="middle" class="eixo" fill="${COR_A}">${esc(cmpCand('a').u)} (A)</text>
      <text transform="translate(11 ${m.t+h/2}) rotate(-90)" text-anchor="middle" class="eixo" fill="${COR_B}">${esc(cmpCand('b').u)} (B)</text>
    </svg>
    ${r!==null?`<p class="nota" style="margin:8px 2px 0">Correlação entre os dois: <b>${r.toLocaleString('pt-BR',{maximumFractionDigits:2})}</b> (de −1 a 1): ${leitura}. Pontos acima da linha: B teve mais votos que A naquele local. Toque num ponto para abrir o colégio.</p>`:''}
  </div>`;
}
function cmpLinhas(nivel,ids,{titulo,destino}){
  const pares=ids.map(id=>[id,cmpPar(nivel,id)]).filter(([,p])=>p.a.v||p.b.v);
  const chave=([,p])=>CMP.metrica==='razao'?(p.razao===Infinity?1e9:p.razao??-1):CMP.metrica==='dif'?p.dif:p.pp;
  const poucos=([,p])=>CMP.metrica==='razao'&&Math.max(p.a.v,p.b.v)<15;   // razão de números pequenos vai para o fim
  pares.sort((x,y)=>(poucos(x)-poucos(y))||(chave(y)-chave(x)));
  const mx=Math.max(...pares.map(([,p])=>Math.max(p.a.v,p.b.v)),1);
  const nome=id=>nivel==='bairros'?BAIRRO[id].nome:(infoLocal(id)?.n||id);
  const cresceu=pares.filter(([,p])=>p.b.v>p.a.v).length;
  return `<div class="bloco"><p class="bloco-tit"><span>${titulo}</span><small>B à frente em ${cresceu} de ${pares.length}</small></p>
    <div class="itens">${pares.map(([id,p])=>`<button class="item cmp-item" data-${destino}="${esc(id)}">
      <span class="t">${esc(nome(id))}</span><span class="v"><b style="color:${cmpCor(cmpIntensidade(p,nivel==='cidade'?'bairros':nivel))}">${cmpValor(p)}</b></span>
      <span class="duas"><i style="width:${p.a.v/mx*100}%;background:${COR_A}"></i><i style="width:${p.b.v/mx*100}%;background:${COR_B}"></i></span>
      <span class="nums"><span style="color:${COR_A}">A ${fmt(p.a.v)}</span><span style="color:${COR_B}">B ${fmt(p.b.v)}</span>${poucos([id,p])?'<span style="color:var(--fraco)">poucos votos</span>':''}</span>
    </button>`).join('')}</div></div>`;
}
function htmlCompararCidade(){
  let h=`<div class="bloco slots">${cmpSlot('a')}${cmpSlot('b')}</div>`;
  if(!cmpPronto())return h+`<div class="bloco"><p class="vazio">Escolha a eleição e o candidato de cada lado. Vale comparar cargos diferentes, como um vereador de 2024 com um deputado de 2026 do mesmo grupo político.</p></div>`;
  h+=`<div class="bloco"><p class="bloco-tit"><span>Juazeiro inteira</span>${cmpMetricas()}</p>${cmpResumo('cidade')}</div>`;
  h+=cmpDispersao(cmpUnidades('locais'));
  h+=cmpLinhas('bairros',cmpUnidades('bairros'),{titulo:usaRegioes()?'Por região':'Por bairro do colégio',destino:'bairro'});
  h+=`<div class="bloco"><p class="nota"><b>Como ler:</b> <b>retenção</b> é quantos votos B teve para cada 100 de A (acima de 100% = B foi melhor). <b>Diferença</b> mostra onde está o volume de votos ganho ou perdido. <b>% dos válidos</b> desconta o tamanho do eleitorado e do comparecimento de cada ano. A comparação é feita por local de votação, que mantém o mesmo código entre as eleições. Na ficha de cada colégio dá para comparar urna a urna, pelo número da seção; a urna avisa quando o eleitorado dela mudou muito entre as eleições.</p></div>`;
  return h;
}
function htmlCompararBairro(id){
  const p=cmpPar('bairros',id);
  if(!p.a.existe&&!p.b.existe)return `<div class="bloco"><p class="vazio">Nenhum colégio eleitoral fica dentro deste ${BAIRRO[id].tipo}.</p></div>`;
  const ids=[...new Set([...(agregados(CMP.a.el).bairros[id]?.locais||[]),...(agregados(CMP.b.el).bairros[id]?.locais||[])])];
  return `<div class="bloco"><p class="bloco-tit"><span>${ehRegiao(id)?'Na região':BAIRRO[id].tipo==='bairro'?'Nos colégios do bairro':'No '+BAIRRO[id].tipo}</span>${cmpMetricas()}</p>${cmpResumo('bairros',id)}</div>`
    +cmpLinhas('locais',ids,{titulo:'Locais de votação',destino:'local'});
}
function htmlCompararLocal(lid){
  const p=cmpPar('locais',lid);
  let aviso='';
  if(!p.a.existe)aviso=`Este local não existia em ${esc(D.indice[CMP.a.el].titulo)}.`;
  else if(!p.b.existe)aviso=`Este local não existe em ${esc(D.indice[CMP.b.el].titulo)}.`;
  return `${aviso?`<p class="nota" style="margin:12px 0 0">${aviso}</p>`:''}
    <div class="bloco"><p class="bloco-tit"><span>Neste local</span>${cmpMetricas()}</p>${cmpResumo('locais',lid)}</div>
    ${cmpUrnas(lid)}`;
}
/* Executa fn como se a eleição e o candidato ativos fossem os do lado s (htmlUrna lê do estado) */
function comLado(s,fn){
  const antes={eleicao:estado.eleicao,candidato:estado.candidato};
  try{estado.eleicao=CMP[s].el;estado.candidato=CMP[s].n;return fn()}
  finally{estado.eleicao=antes.eleicao;estado.candidato=antes.candidato}
}
function parUrna(sa,sb){
  const lado=(s,ss)=>ss?{v:ss[6][CMP[s].n]||0,val:soma(ss[6]),existe:true}:{v:0,val:0,existe:false};
  const a=lado('a',sa),b=lado('b',sb);
  const pa=a.val?a.v/a.val*100:0,pb=b.val?b.v/b.val*100:0;
  return {a,b,pa,pb,razao:a.v?b.v/a.v:(b.v?Infinity:null),dif:b.v-a.v,pp:pb-pa};
}
/* Urna a urna: mesma seção (zona + número) no mesmo local nas duas eleições */
function cmpUrnas(lid){
  const RA=agregados(CMP.a.el),RB=agregados(CMP.b.el);
  const sa=RA.secoesPorLocal[lid]||[],sb=RB.secoesPorLocal[lid]||[];
  const todas=[...new Set([...sa,...sb])].sort((x,y)=>+x.split('-')[1]-+y.split('-')[1]);
  if(!todas.length)return '';
  const tA=D.indice[CMP.a.el].titulo,tB=D.indice[CMP.b.el].titulo,anoA=D.indice[CMP.a.el].ano,anoB=D.indice[CMP.b.el].ano;
  const linhas=todas.map(sk=>{
    const A=sa.includes(sk)?RA.E.secoes[sk]:null,B=sb.includes(sk)?RB.E.secoes[sk]:null;
    return {sk,A,B,p:parUrna(A,B),mud:A&&B?(B[1]-A[1])/A[1]:null};
  });
  const comparaveis=linhas.filter(x=>x.A&&x.B);
  const frente=comparaveis.filter(x=>x.p.b.v>x.p.a.v).length;
  const instaveis=comparaveis.filter(x=>Math.abs(x.mud)>.2).length;
  const fmtPP=v=>(v>0?'+':'')+v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
  const corpo=linhas.map(({sk,A,B,p,mud})=>{
    const [z,sec]=sk.split('-'),n=sec.padStart(4,'0');
    let sub,alerta='';
    if(!A)sub=`Só em ${anoB}: a seção não existia em ${anoA} neste local`;
    else if(!B)sub=`Só em ${anoA}: a seção não existe em ${anoB} neste local`;
    else{
      sub=`Zona ${z} · aptos ${fmt(A[1])} → ${fmt(B[1])}`;
      if(Math.abs(mud)>.2)alerta=`<span class="alerta-urna" title="O eleitorado desta urna mudou muito entre as eleições">eleitorado ${mud>0?'+':''}${Math.round(mud*100)}%</span>`;
    }
    const t=A&&B?cmpIntensidade(p,'locais'):null,cor=cmpCor(t);
    // verde/vermelho só nos votos do candidato; nas demais linhas a diferença é neutra
    const linha=(rotulo,va,vb,fmtv=fmt,dif=true,cor=false)=>{
      const d=va!=null&&vb!=null&&dif?vb-va:null;
      return `<tr><th>${rotulo}</th><td>${va==null?'—':fmtv(va)}</td><td>${vb==null?'—':fmtv(vb)}</td><td class="${cor&&d>0?'dif-sobe':cor&&d<0?'dif-desce':''}">${d==null?'':(d>0?'+':'')+fmtv(d)}</td></tr>`;
    };
    const pc=v=>pct(v,1);
    const tabela=`<table class="cmp-tabela"><thead><tr><th></th><th style="color:${COR_A}">A · ${anoA}</th><th style="color:${COR_B}">B · ${anoB}</th><th>Diferença</th></tr></thead><tbody>
      ${linha('Votos do candidato',A?p.a.v:null,B?p.b.v:null,fmt,true,true)}
      ${linha('% dos válidos',A?p.pa:null,B?p.pb:null,v=>fmtPP(v).replace(/^\+/,'')+'%',false)}
      ${linha('Aptos',A?A[1]:null,B?B[1]:null)}
      ${linha('Votaram',A?A[2]:null,B?B[2]:null)}
      ${linha('Comparecimento',A?A[2]/A[1]*100:null,B?B[2]/B[1]*100:null,pc,false)}
      ${linha('Brancos',A?A[3]:null,B?B[3]:null)}
      ${linha('Nulos',A?A[4]:null,B?B[4]:null)}
    </tbody></table>`;
    // só o corpo do boletim (sem a caixa recolhível própria da urna)
    const corpoBU=h=>h.slice(h.indexOf('<div class="bu">'),h.lastIndexOf('</details>'));
    const bA=A?corpoBU(comLado('a',()=>htmlUrna(sk,A,RA.L[lid]))):'',bB=B?corpoBU(comLado('b',()=>htmlUrna(sk,B,RB.L[lid]))):'';
    return `<details class="urna cmp-urna"><summary>
        <span class="sec">Seção ${n}</span>
        <span class="res"><span style="color:${COR_A}">${A?fmt(p.a.v):'—'}</span> → <span style="color:${COR_B}">${B?fmt(p.b.v):'—'}</span>
          ${A&&B?`<b style="color:${cor}">${cmpValor(p)}</b>`:''}</span>
        <span class="sub">${sub} ${alerta}</span>
      </summary><div class="bu">
        ${tabela}
        ${bA?`<details class="bu-completo"><summary style="color:${COR_A}">Boletim completo · ${esc(tA)}</summary>${bA}</details>`:''}
        ${bB?`<details class="bu-completo"><summary style="color:${COR_B}">Boletim completo · ${esc(tB)}</summary>${bB}</details>`:''}
      </div></details>`;
  }).join('');
  return `<div class="bloco"><p class="bloco-tit"><span>Urna a urna</span><small>${comparaveis.length} comparáveis · B à frente em ${frente}</small></p>
    ${instaveis?`<p class="nota" style="margin:0 2px 10px">Em ${instaveis} urna(s) o eleitorado mudou mais de 20% entre as eleições; nelas, compare pelos percentuais, não pelo número de votos.</p>`:''}
    ${corpo}</div>`;
}
function abasModo(){
  return `<div class="abas" role="tablist">
    <button role="tab" data-modo="eleicao" aria-selected="${!modoComparar()}">Resultados</button>
    <button role="tab" data-modo="comparar" aria-selected="${modoComparar()}">Comparar candidatos</button></div>`;
}
function cabecalhoComparar(){
  const pronto=cmpPronto();
  const dupla=pronto?`${cmpCand('a').u} × ${cmpCand('b').u}`:'Comparar candidatos';
  const eleicoes=`${D.indice[CMP.a.el].titulo} × ${D.indice[CMP.b.el].titulo}`;
  if(estado.nivel==='cidade')return {sobre:'Comparação entre eleições',tit:dupla,sub:eleicoes};
  if(estado.nivel==='bairro'){const b=BAIRRO[estado.bairro];return {sobre:b.tipo==='bairro'?'Colégios no bairro':b.tipo==='região'?'Região':b.tipo==='distrito'?'Distrito':'Povoado',tit:b.nome,sub:dupla}}
  const l=infoLocal(estado.local);return {sobre:`Local de votação · Zona ${estado.local.split('-')[0]}`,tit:l.n,sub:dupla};
}
function legendaComparar(){
  const sel=$('#colorir');
  sel.disabled=false;
  sel.innerHTML=Object.entries(METRICAS).map(([k,t])=>`<option value="cmp:${k}">${t}</option>`).join('');
  sel.value='cmp:'+CMP.metrica;
  let esc0,esc1;
  if(CMP.metrica==='razao'){esc0='÷4 ou menos';esc1='×4 ou mais'}
  else if(CMP.metrica==='dif'){esc0='−'+fmt(Math.round(cmpEscalas.bairros));esc1='+'+fmt(Math.round(cmpEscalas.bairros))}
  else{const e=cmpEscalas.bairros.toLocaleString('pt-BR',{maximumFractionDigits:1});esc0='−'+e+' p.p.';esc1='+'+e+' p.p.'}
  $('#leg-itens').innerHTML=`<div class="leg-grad" style="background:linear-gradient(90deg,${DESCE},rgba(107,116,134,.25),${SOBE})"></div>
    <div class="leg-escala"><span>${esc0}</span><span>igual</span><span>${esc1}</span></div>`;
  $('#leg-dica').textContent=cmpPronto()?`Verde: ${cmpCand('b').u} (B) foi melhor que ${cmpCand('a').u} (A). Vermelho: pior.`:'Escolha os dois candidatos no painel.';
  $('#leg-amostras').innerHTML=`<i style="background:${DESCE}"></i><i style="background:${SOBE}"></i>`;
}

/* Interações do modo comparar */
function cmpEntrar(){
  estado.modo='comparar';
  $('#painel-corpo').innerHTML='<p class="carregando">Carregando eleições…</p>';
  Promise.all([carregarEleicao(CMP.a.el),carregarEleicao(CMP.b.el)]).then(atualizar)
    .catch(()=>{$('#painel-corpo').innerHTML='<div class="bloco"><p class="vazio">Não foi possível carregar as eleições. Verifique a conexão e tente de novo.</p></div>'});
}
$('#painel').addEventListener('click',e=>{
  const t=e.target.closest('[data-modo],[data-cmp-trocar],[data-cmp-metrica],[data-cmp-escolher],circle[data-local]');if(!t)return;
  if(t.dataset.modo){
    if(t.dataset.modo==='comparar'&&!modoComparar())cmpEntrar();
    else if(t.dataset.modo==='eleicao'&&modoComparar()){estado.modo='eleicao';atualizar()}
    return;
  }
  if(t.dataset.cmpTrocar){CMP[t.dataset.cmpTrocar].n=null;atualizar();setTimeout(()=>$('#busca-'+t.dataset.cmpTrocar)?.focus(),50);return}
  if(t.dataset.cmpMetrica){CMP.metrica=t.dataset.cmpMetrica;atualizar();return}
  if(t.dataset.cmpEscolher){const [s,n]=t.dataset.cmpEscolher.split(':');clearTimeout(timerBusca);$('#painel').classList.remove('buscando');CMP[s].n=n;atualizar();return}
  if(t.tagName==='circle')irLocal(t.dataset.local);
});
$('#painel').addEventListener('change',e=>{
  const s=e.target.dataset.cmpEleicao;if(!s)return;
  const el=e.target.value;
  carregarEleicao(el).then(()=>{CMP[s].el=el;CMP[s].n=null;atualizar();setTimeout(()=>$('#busca-'+s)?.focus(),50)});
});
function ligarBuscaComparar(){
  for(const s of ['a','b']){
    const inp=$('#busca-'+s),ul=$('#sug-'+s);if(!inp)continue;
    const R=agregados(CMP[s].el),E=R.E;
    const todos=Object.entries(E.cands).filter(([,c])=>!c.leg).map(([n,c])=>[n,c,R.cidade.v[n]||0]).sort((a,b)=>b[2]-a[2]);
    const mostrar=()=>{
      const t=semAcento(inp.value.trim());
      const r=(t?todos.filter(([n,c])=>n.startsWith(t)||semAcento(c.u).includes(t)||semAcento(c.n||'').includes(t)):todos).slice(0,12);
      ul.innerHTML=r.length?r.map(([n,c,q])=>`<li><button data-cmp-escolher="${s}:${n}"><span>${esc(c.u)} <small>${esc(c.p)} · ${n}</small></span><small>${fmt(q)} votos</small></button></li>`).join('')
        :'<li style="padding:10px;color:var(--suave)">Nenhum candidato encontrado</li>';
      ul.hidden=false;
      if(!DESKTOP())fixarBusca(inp);
    };
    inp.addEventListener('input',mostrar);
    inp.addEventListener('focus',()=>{
      mostrar();
      if(DESKTOP())return;
      clearTimeout(timerBusca);$('#painel').classList.add('buscando');folha('cima');
      setTimeout(()=>fixarBusca(inp),60);setTimeout(()=>fixarBusca(inp),350);
    });
    inp.addEventListener('blur',()=>{timerBusca=setTimeout(()=>{$('#painel').classList.remove('buscando')},300)});
  }
}
