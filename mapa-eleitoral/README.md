# Mapa Eleitoral de Juazeiro (BA)

Página única com os resultados eleitorais de Juazeiro por bairro, local de votação e urna
(2020 a 2026), com comparação entre candidatos de eleições diferentes.

- **Versão principal (publicada):** https://claude.ai/artifact/URTgBE3LH8xzQWeb1nPUyu
- **Laboratório (testes de funções novas):** https://claude.ai/artifact/1SCM18sEZ3J6wGS65s3CsS — gerado com `montar.py <pasta> lab`, que inclui `app/lab.js`; usa os mesmos dados e não altera a principal.

## Pastas

| Pasta | Conteúdo |
|---|---|
| `app/` | Fontes da página: `corpo.html`, `estilo.css`, `app.js` (mapa, painel, navegação), `comparar.js` (comparação entre candidatos), `basemap.js` (desenho das ruas no navegador), `leaflet.css` |
| `scripts/` | `ov.py` baixa ruas, rios e bairros do Overture Maps; `build_base.py` gera `basemap.json`; `build_dados.py` gera `dados.json` e `eleicoes/*.json` a partir dos CSVs do TSE; `montar.py` junta tudo num HTML |
| `publicado/` | Exatamente o que está publicado: o HTML e os arquivos de dados |

## Fontes de dados

- **TSE, dados abertos** (`cdn.tse.jus.br/estatistica/sead/odsele/`): `votacao_secao`, `detalhe_votacao_secao`,
  `eleitorado_locais_votacao` e `consulta_cand` de 2020, 2022, 2024 e 2026, filtrados para Juazeiro (código TSE 36692).
  Os CSVs brutos não ficam no repositório (cerca de 70 MB filtrados); `build_dados.py` lista os nomes que espera em `tse/`.
- **Overture Maps** (derivado do OpenStreetMap): ruas, água e contornos de bairros.

## Como os bairros são calculados

Os 151 contornos de bairros do OpenStreetMap se sobrepõem. `build_dados.py` monta uma divisão sem sobreposição
(do menor para o maior) e conta cada local de votação no bairro onde o prédio fica. Locais sem contorno viram povoados
com o nome do cadastro do TSE. Locais sem coordenada num ano usam a do mesmo código de local em outro ano.
