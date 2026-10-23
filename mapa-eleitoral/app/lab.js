/* ══════════════════════════════════════════════════════════
   Laboratório: funções novas em teste. Este arquivo só entra na versão "lab"
   (scripts/montar.py <pasta> lab) e não altera a versão principal.

   Vista por regiões e "mancha" (mapa de calor): o TSE não informa onde o eleitor mora,
   só onde vota. Em vez de pintar o contorno do bairro como se todos os votos viessem de
   dentro dele, cada colégio espalha sua votação ao redor, enfraquecendo com a distância.
══════════════════════════════════════════════════════════ */
// alcance de cada colégio em metros, conforme o zoom: de perto ~550 m (a cor some por volta de 1,5 km);
// de longe a mancha precisa ser mais larga para aparecer na cidade inteira
const calorSigma=z=>z<=11?1600:z===12?1000:z===13?750:550;
const CALOR_PASSO=4;            // px por célula calculada (o canvas é suavizado ao ampliar)

/* Seletor "Ver por" no topo da legenda */
(function(){
  const box=document.createElement('div');box.className='vistas';
  box.innerHTML=`<label>Ver por</label>
    <div class="ordem vistas-op" role="group" aria-label="Ver por">
      <button data-vista="bairros">Bairros</button><button data-vista="regioes">Regiões</button><button data-vista="calor">Mancha</button>
    </div>`;
  const alvo=$('#leg-conteudo');alvo.insertBefore(box,alvo.firstChild);
  box.addEventListener('click',e=>{const b=e.target.closest('[data-vista]');if(b)trocarVista(b.dataset.vista)});
})();

function trocarVista(v){
  const antes=usaRegioes();
  estado.vista=v;
  if(antes!==usaRegioes()){
    if(estado.nivel==='local'){const l=infoLocal(estado.local);estado.bairro=areaDe(l)}
    else if(estado.nivel==='bairro'){
      // bairro -> região que o contém; região -> não há um bairro único, volta para a cidade
      estado.bairro=usaRegioes()?REGIAO_DE[estado.bairro]||null:null;
      if(!estado.bairro)estado.nivel='cidade';
    }
  }
  atualizar();atualizarRotulos();
}

/* ── Mapa de calor ── */
const hexRgb=h=>{if(!h||h.startsWith('var'))h='#f2b33d';const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255]};
let calorPrep=null;
function prepararCalor(){
  const pts=[];
  if(modoComparar()){
    if(!cmpPronto())return null;
    for(const lid of cmpUnidades('locais')){
      const l=infoLocal(lid);if(!l||!l.p)continue;const p=cmpPar('locais',lid);
      pts.push({x:l.p[0],y:l.p[1],v:[p.a.v,p.a.val,p.b.v,p.b.val],peso:Math.max(p.a.val,p.b.val)});
    }
    return {tipo:'comparar',pts};
  }
  const R=agregados(estado.eleicao),m=modoCor();
  if(m.tipo==='vencedor'){
    const K=ordenar(R.cidade.v).filter(([n])=>!R.E.cands[n].leg).slice(0,6).map(([n])=>n);
    for(const [lid,T] of Object.entries(R.locais)){const l=R.L[lid];if(!l||!l.p)continue;
      pts.push({x:l.p[0],y:l.p[1],v:[...K.map(n=>T.v[n]||0),validos(T)],peso:validos(T)})}
    return {tipo:'vencedor',K,cores:K.map(n=>hexRgb(corCand(n))),pts};
  }
  if(m.tipo==='candidato'){
    let max=0;
    for(const [lid,T] of Object.entries(R.locais)){const l=R.L[lid];if(!l||!l.p)continue;
      const val=validos(T);max=Math.max(max,val?(T.v[m.n]||0)/val:0);
      pts.push({x:l.p[0],y:l.p[1],v:[T.v[m.n]||0,val],peso:val})}
    // a mancha dilui o colégio mais forte; satura em metade dele para a cor não sumir
    return {tipo:'candidato',cor:hexRgb(m.cor),max:Math.max(max*.5,1e-4),pts};
  }
  let min=1,max=0;
  for(const [lid,T] of Object.entries(R.locais)){const l=R.L[lid];if(!l||!l.p)continue;
    const t=T.c/T.a;min=Math.min(min,t);max=Math.max(max,t);pts.push({x:l.p[0],y:l.p[1],v:[T.c,T.a],peso:T.a})}
  return {tipo:'comparecimento',cor:[34,184,207],min,max,pts};
}
function corCelula(P,s,dens){
  // s = somas ponderadas do vetor do colégio; dens = 0..1 (some longe dos colégios)
  if(P.tipo==='vencedor'){
    const n=P.K.length,tot=s[n];if(!tot)return null;
    let i1=0,i2=-1;for(let i=1;i<n;i++){if(s[i]>s[i1]){i2=i1;i1=i}else if(i2<0||s[i]>s[i2])i2=i}
    const margem=(s[i1]-(i2>=0?s[i2]:0))/tot;
    return [...P.cores[i1],dens*(.22+.6*Math.min(1,margem/.35))];
  }
  if(P.tipo==='candidato'){const t=s[1]?s[0]/s[1]/P.max:0;return [...P.cor,dens*(.06+.74*Math.min(1,t))]}
  if(P.tipo==='comparecimento'){const t=s[1]?(s[0]/s[1]-P.min)/Math.max(P.max-P.min,1e-6):0;return [...P.cor,dens*(.08+.7*Math.max(0,Math.min(1,t)))]}
  // comparar: mesma escala de cor da comparação por colégio
  const pa=s[1]?s[0]/s[1]*100:0,pb=s[3]?s[2]/s[3]*100:0;
  const p={a:{v:s[0]},b:{v:s[2]},pa,pb,razao:s[0]?s[2]/s[0]:(s[2]?Infinity:null),dif:s[2]-s[0],pp:pb-pa};
  const t=cmpIntensidade(p,'locais');if(t===null)return null;
  return [...hexRgb(t>=0?SOBE:DESCE),dens*(.1+.6*Math.abs(t))];
}
function desenharCalor(cv,c){
  const P=calorPrep;if(!P)return;
  const N=256/CALOR_PASSO,img=new ImageData(N,N),z2=256*Math.pow(2,c.z);
  const lonDe=px=>px/z2*360-180,latDe=py=>Math.atan(Math.sinh(Math.PI*(1-2*py/z2)))*180/Math.PI;
  const w0=lonDe(c.x*256),e0=lonDe(c.x*256+256),n0=latDe(c.y*256),s0=latDe(c.y*256+256);
  const sg=calorSigma(c.z),kx=111320*Math.cos((n0+s0)/2*Math.PI/180),ky=110540,R3=3*sg,dois=2*sg*sg;
  const perto=P.pts.filter(p=>(p.x-e0)*kx<R3&&(w0-p.x)*kx<R3&&(p.y-n0)*ky<R3&&(s0-p.y)*ky<R3);
  if(!perto.length)return;
  const dim=perto[0].v.length,s=new Float64Array(dim);
  for(let j=0;j<N;j++){
    const lat=latDe(c.y*256+(j+.5)*CALOR_PASSO);
    for(let i=0;i<N;i++){
      const lon=lonDe(c.x*256+(i+.5)*CALOR_PASSO);
      s.fill(0);let densidade=0;
      for(const p of perto){
        const dx=(lon-p.x)*kx,dy=(lat-p.y)*ky,d2=dx*dx+dy*dy;if(d2>R3*R3)continue;
        const w=Math.exp(-d2/dois);densidade+=w*p.peso;
        for(let k=0;k<dim;k++)s[k]+=w*p.v[k];
      }
      if(densidade<1)continue;
      const cor=corCelula(P,s,1-Math.exp(-densidade/350));if(!cor)continue;
      const o=(j*N+i)*4;img.data[o]=cor[0];img.data[o+1]=cor[1];img.data[o+2]=cor[2];img.data[o+3]=Math.round(255*Math.min(.85,cor[3]));
    }
  }
  const tmp=document.createElement('canvas');tmp.width=tmp.height=N;tmp.getContext('2d').putImageData(img,0,0);
  const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(tmp,0,0,256,256);
  // recorta pelo limite do município: a mancha não deve atravessar o rio e pintar Petrolina
  ctx.globalCompositeOperation='destination-in';ctx.beginPath();
  const merc=(lat,lon)=>{const r=lat*Math.PI/180;return [(lon+180)/360*z2-c.x*256,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*z2-c.y*256]};
  for(const pol of D.municipio)for(const anel of pol){decodificar(anel).forEach(([la,lo],i)=>{const [x,y]=merc(la,lo);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath()}
  ctx.fillStyle='#000';ctx.fill('evenodd');ctx.globalCompositeOperation='source-over';
}
map.createPane('calor').style.zIndex=405;
map.getPane('calor').style.pointerEvents='none';
const CamadaCalor=L.GridLayer.extend({
  createTile(c){const cv=document.createElement('canvas');cv.width=cv.height=256;desenharCalor(cv,c);return cv}
});
const camadaCalor=new CamadaCalor({pane:'calor',minZoom:8,maxZoom:18,updateWhenZooming:false});

/* Chamado ao fim de cada atualização da página */
function atualizarLab(){
  document.querySelectorAll('[data-vista]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.vista===estado.vista));
  if(estado.vista==='calor'){
    calorPrep=prepararCalor();
    if(!map.hasLayer(camadaCalor))camadaCalor.addTo(map);else camadaCalor.redraw();
    const d=$('#leg-dica');
    d.textContent='Mancha: cada colégio espalha seus votos ao redor (cerca de 1 km). Mostra a tendência da área, sem fingir que os eleitores moram no bairro do colégio. '+d.textContent;
  }else if(map.hasLayer(camadaCalor))map.removeLayer(camadaCalor);
}
