"""Monta a página única (HTML + CSS + JS embutidos) a partir de app/.

Uso: python3 montar.py <pasta-de-trabalho> [principal|lab]
A pasta de trabalho contém app/ (fontes), mapa/ (saída) e pub/ (dados publicados e preview).
"""
import sys
S=sys.argv[1]; variante=sys.argv[2] if len(sys.argv)>2 else 'principal'
A=S+'/app/'
r=lambda f:open(f,encoding='utf-8').read()
app=f"const VARIANTE='{variante}';\n"+r(A+'app.js')+'\n'+r(A+'comparar.js')
base=r(A+'basemap.js').replace('decodificar(','decodificarBase(')
k="function decodificar(arr"
assert app.count(k)==1
app=app.replace(k,base+"\n\n"+k)
lab=variante=='lab'
for f in (['lab.js'] if lab else []):
    app+='\n'+r(A+f)
titulo='Laboratório Eleitoral de Juazeiro' if lab else 'Mapa Eleitoral de Juazeiro'
corpo=r(A+'corpo.html')
estilo=r(A+'estilo.css')
if lab:
    # selo visível para não confundir a versão de testes com a principal
    corpo=corpo.replace('<h1>Mapa Eleitoral</h1>','<h1>Mapa Eleitoral</h1><b class="selo-lab" title="Versão de testes">Lab</b>')
    estilo+='\n.selo-lab{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0b0e13;background:#b07cff;border-radius:4px;padding:2px 6px;align-self:center}\n@media(max-width:560px){.seletor select{max-width:52vw}}\n'
html=f'''<meta charset="utf-8">
<title>{titulo}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Resultados eleitorais de Juazeiro-BA por bairro, local de votação e urna.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>
/* Leaflet 1.9.4 */
{r(A+'leaflet.css')}
</style>
<style>
{estilo}
</style>
{corpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
{app}
</script>
'''
saida={'principal':S+'/mapa/mapa-eleitoral-juazeiro.html','lab':S+'/lab/laboratorio-eleitoral-juazeiro.html'}[variante]
open(saida,'w',encoding='utf-8').write(html)
prev=html.replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js','leaflet.js').replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
open(S+'/pub/'+('preview-lab.html' if lab else 'preview.html'),'w',encoding='utf-8').write(prev)
print('ok',saida,len(html))
