/* Mapa de fundo desenhado na própria página a partir de dados do OpenStreetMap (via Overture Maps).
   A página publicada não pode carregar imagens de mapa de outros sites. */
const BASE_COR={terra:'#141820',agua:'#173247',aguaLinha:'#1f4a66',canal:'#1a3d52',casco:'#0d1014',
  via:['#5c6678','#56606f','#4a5260','#3e4552','#323843','#2c323c','#2c323c','#2c323c','#262b33']};
const VIA_LARG=[[2.2,1.6],[2,1.4],[1.6,1.1],[1.3,.9],[1,.7],[.9,.6],[.8,.5],[.8,.5],[.6,.4]]; // [z16, z13] em px
const VIA_ZMIN=[8,8,10,12,13,14,14,14,15];
let BASE=null;
function decodificar(lst,q){
  return lst.map(arr=>{const pts=new Float64Array(arr.length);let x=0,y=0;
    for(let i=0;i<arr.length;i+=2){x+=arr[i];y+=arr[i+1];pts[i]=x/q;pts[i+1]=y/q}return pts});
}
const basePronta=fetch('basemap.json').then(r=>r.json()).then(b=>{
  const q=b.q;
  BASE={
    vias:b.roads.map(r=>({c:r[0],bb:r[1],g:decodificar(r[2],q)})),
    aguaP:b.waterPoly.map(r=>({bb:r[0],g:decodificar(r[1],q)})),
    aguaL:b.waterLine.map(r=>({c:r[0],bb:r[1],g:decodificar(r[2],q)})),
    bairros:b.bairros,cidades:b.cidades
  };
  BASE.vias.sort((a,b)=>b.c-a.c); // vias maiores por cima
  return BASE;
}).catch(()=>null);

function merc(lon,lat,z){
  const s=256*Math.pow(2,z),r=lat*Math.PI/180;
  return [(lon+180)/360*s,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*s];
}
function limitesTile(c){
  const n=Math.pow(2,c.z),lon=x=>x/n*360-180,
        lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
  return [lon(c.x),lat(c.y+1),lon(c.x+1),lat(c.y)];
}
const MapaBase=L.GridLayer.extend({
  createTile(c,done){
    const dpr=Math.min(window.devicePixelRatio||1,3),cv=document.createElement('canvas');
    cv.width=cv.height=256*dpr;
    basePronta.then(B=>{try{this.desenhar(cv,c,dpr,B)}finally{done(null,cv)}});
    return cv;
  },
  desenhar(cv,c,dpr,B){
    const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);
    ctx.fillStyle=BASE_COR.terra;ctx.fillRect(0,0,256,256);
    if(!B)return;
    const [w,s,e,n]=limitesTile(c),m=(e-w)*.05,ox=c.x*256,oy=c.y*256;
    const toca=bb=>bb[0]<e+m&&bb[2]>w-m&&bb[1]<n+m&&bb[3]>s-m;
    const caminho=(g,fechar)=>{for(const pts of g){
      for(let i=0;i<pts.length;i+=2){const [X,Y]=merc(pts[i],pts[i+1],c.z);
        i?ctx.lineTo(X-ox,Y-oy):ctx.moveTo(X-ox,Y-oy)}
      if(fechar)ctx.closePath()}};
    ctx.lineJoin=ctx.lineCap='round';
    ctx.fillStyle=BASE_COR.agua;
    for(const f of B.aguaP)if(toca(f.bb)){ctx.beginPath();caminho(f.g,true);ctx.fill('evenodd')}
    for(const f of B.aguaL)if(c.z>=(f.c?12:11)&&toca(f.bb)){
      ctx.strokeStyle=f.c?BASE_COR.canal:BASE_COR.aguaLinha;ctx.lineWidth=c.z>=14?1.6:1;
      ctx.beginPath();caminho(f.g,false);ctx.stroke()}
    const t=Math.max(0,Math.min(1,(c.z-13)/3)),k=Math.pow(1.6,Math.max(0,c.z-16));
    for(const f of B.vias){
      if(c.z<VIA_ZMIN[f.c]||!toca(f.bb))continue;
      const [a,b]=VIA_LARG[f.c];
      ctx.strokeStyle=BASE_COR.via[f.c];ctx.lineWidth=(b+(a-b)*t)*k*(c.z<12?.8:1);
      ctx.beginPath();caminho(f.g,false);ctx.stroke();
    }
  }
});
new MapaBase({minZoom:8,maxZoom:18,attribution:'Mapa © OpenStreetMap (Overture Maps) · Resultados: TSE'}).addTo(map);

/* Nomes das cidades (só no zoom afastado) */
const rotulosCidades=L.layerGroup();
basePronta.then(B=>{
  if(!B)return;
  B.cidades.forEach(([nome,p])=>L.marker([p[1],p[0]],{pane:'rotulos',interactive:false,keyboard:false,
    icon:L.divIcon({className:'rotulo rotulo-cidade',html:`<span>${nome}</span>`,iconSize:null})}).addTo(rotulosCidades));
  const atual=()=>{if(map.getZoom()<=13)map.addLayer(rotulosCidades);else map.removeLayer(rotulosCidades)};
  map.on('zoomend',atual);atual();
});
