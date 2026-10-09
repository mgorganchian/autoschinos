#!/usr/bin/env python3
"""Genera una página estática por auto (autos/<slug>.html), sitemap.xml y robots.txt.

    python3 herramientas-paginas.py           # escribe las páginas
    python3 herramientas-paginas.py --check   # sale con error si alguna está desactualizada

Por qué existe (2026-10-06): la página de cada auto del comparador se arma en el navegador
(?auto=slug), así que Google no la indexa y al compartirla se ve siempre la misma vista
previa. Estas páginas salen de los mismos datos de index.html (CARS, DATA, COLORES_AR,
CREDITOS de las portadas) y no agregan ninguno: si index.html cambia, se regeneran.
Nunca editarlas a mano. tests/e2e/paginas.spec.js falla si quedaron desactualizadas.
"""
import html as H
import json
from datetime import date, datetime, timezone
import os
import re
import sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
SITIO = 'https://autoschinos-ar.vercel.app'
DIR = os.path.join(RAIZ, 'autos')

TIPO = {'ev': '100% eléctrico', 'phev': 'híbrido enchufable', 'hev': 'híbrido', 'mhev': 'mild-hybrid',
        'ice': 'naftero o diésel', 'tbd': 'propulsión a confirmar'}
ESTADO = {'venta': 'A la venta', 'preventa': 'En preventa', 'nolanzado': 'No lanzado todavía',
          'discontinuado': 'Discontinuado'}
SENTINELA = {'YES': 'Sí', 'NO': 'No', 'OPT': 'Opcional', 'ND': 'Sin dato'}


def leer():
    s = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    a = s.index('const DATA = ['); data = json.loads(s[a + 13:s.find('];', a) + 1])
    cs = s.index('const CARS = ['); bloque = s[cs:s.index('];', cs)]
    cars = [dict(re.findall(r'(\w+):"([^"]*)"', o)) for o in re.findall(r'\{name:"[^}]*\}', bloque)]
    tags = re.findall(r'<img class="car-photo" data-slug="[^"]+"[^>]*>', s)
    slugs = [re.search(r'data-slug="([^"]+)"', t).group(1) for t in tags]
    creditos = [H.unescape((re.search(r'data-credito="([^"]*)"', t) or [None, ''])[1]) for t in tags]
    colores = json.loads(re.search(r'const COLORES_AR = (\{.*?\});\n', s).group(1))
    videos = json.loads(re.search(r'const VIDEOS = (\{.*?\});\n', s).group(1))
    assert len(cars) == len(slugs) == len(data[0][1][0]) - 1
    return data, cars, slugs, creditos, colores, videos


def celda(v):
    """(texto visible, aclaración o None) de una celda con la convención NR/NOTE/EXT/DET."""
    if v in SENTINELA: return SENTINELA[v], None
    m = re.match(r'^(NR|NOTE|EXT|DET):(.*?)(?:\|(.*))?$', v, re.S)
    if not m: return v, None
    pre, val, nota = m.groups()
    if pre == 'NR': return 'Sin dato', nota
    if pre == 'EXT': return val, ('No sale de la ficha oficial argentina. ' + (nota or '')).strip()
    return val, nota


def precio_usd(v):
    if not v.startswith('USD '): return None
    m = re.match(r'USD ([\d.]+)', v)
    return m.group(1).replace('.', '') if m else None


def pagina(i, data, car, slug, credito, colores, videos):
    nombre = car['name']
    filas = {f[0]: f[i + 1] for cat in data for f in cat[1]}
    precio, _ = celda(filas['Precio de lista (versión tope de gama de la tabla)'])
    largo, _ = celda(filas['Longitud (mm)'])
    tipo = TIPO.get(car['type'], '')
    desc_partes = [f'{nombre}: {tipo}', car.get('body', ''), ESTADO.get(car['status'], '')]
    if precio != 'Sin dato': desc_partes.append(f'precio {precio}')
    desc = ', '.join(p for p in desc_partes if p) + '. Ficha técnica oficial, equipamiento, colores y comparación con otros autos chinos en Argentina.'
    titulo = f'{nombre}: precio, ficha técnica y equipamiento en Argentina'
    url = f'{SITIO}/autos/{slug}'
    foto = f'{SITIO}/fotos/{slug}-1.jpg'
    e = H.escape
    # Ficha completa, por categoría
    secciones = []
    for cat, fs in data:
        trs = []
        for f in fs:
            txt, nota = celda(f[i + 1])
            trs.append(f'<tr><th scope="row">{e(f[0])}</th><td>{e(txt)}' + (f'<small>{e(nota)}</small>' if nota else '') + '</td></tr>')
        secciones.append(f'<section><h2>{e(cat)}</h2><table>{"".join(trs)}</table></section>')
    col = colores.get(slug) or {}
    colores_html = ''
    if col.get('c'):
        colores_html = ('<section><h2>Colores en Argentina</h2><ul class="colores">' + ''.join(f'<li>{e(c)}</li>' for c in col['c']) +
                        f'</ul><p class="nota">{e(col.get("n", ""))} Fuente: <a href="{e(col["f"])}" rel="nofollow">{e(col.get("d", "oficial"))}</a>.</p></section>')
    videos_html = ''
    if videos.get(slug):
        fecha = lambda f: '/'.join(str(int(x)) for x in list(reversed(f.split('-')))[:2]) + '/' + f[:4]
        videos_html = ('<section><h2>Reseñas en video</h2><ul class="videos">' +
                       ''.join(f'<li><a href="https://www.youtube.com/watch?v={e(v["id"])}" rel="nofollow">{e(v["t"])}</a> '
                               f'<small>{e(v["canal"])}, {fecha(v["f"])}, {v["s"] // 60}:{v["s"] % 60:02d} min</small></li>' for v in videos[slug]) +
                       '</ul><p class="nota">Pruebas de periodistas, del mismo modelo y versión: son opiniones de terceros, no datos de la ficha.</p></section>')
    ld = {'@context': 'https://schema.org', '@type': 'Car', 'name': nombre, 'url': url, 'image': foto,
          'brand': {'@type': 'Brand', 'name': car['brand']}, 'bodyType': car.get('body', ''),
          'vehicleConfiguration': tipo}
    usd = precio_usd(filas['Precio de lista (versión tope de gama de la tabla)'])
    if usd and car['status'] == 'venta':
        ld['offers'] = {'@type': 'Offer', 'price': usd, 'priceCurrency': 'USD', 'availability': 'https://schema.org/InStock'}
    return f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{foto}"><meta property="og:image:width" content="900"><meta property="og:image:height" content="570">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>
:root{{--paper:#EEF1EE;--ink:#17211D;--ink2:#4B5A53;--line:#C9D4CE;--accent:#00843D}}
@media (prefers-color-scheme:dark){{:root{{--paper:#141B18;--ink:#E4EAE6;--ink2:#9DB3A8;--line:#2E3A35;--accent:#3FB57A}}}}
body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:880px;margin:0 auto;padding:16px}}
a{{color:var(--accent)}} h1{{font-size:2rem;line-height:1.1;margin:8px 0 4px;text-wrap:balance}}
.sub{{color:var(--ink2);margin:0 0 12px}} figure{{margin:0}} figure img{{width:100%;height:auto;background:#fff;border-radius:2px}}
figcaption{{font-size:.75rem;color:var(--ink2)}} .cta{{display:inline-block;margin:12px 0;padding:8px 14px;border-radius:4px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}}
h2{{font-size:1.15rem;margin:24px 0 6px;border-bottom:2px solid var(--ink)}} table{{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}}
th,td{{text-align:left;vertical-align:top;padding:5px 6px;border-bottom:1px solid var(--line)}} th{{font-weight:500;width:42%;color:var(--ink2)}}
td small{{display:block;font-size:.75rem;color:var(--ink2)}} .colores{{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}}
.colores li{{border:1px solid var(--line);border-radius:3px;padding:2px 8px}}
.videos{{padding-left:18px}} .videos li{{margin:4px 0}} .videos small{{display:block;color:var(--ink2)}} .nota,footer{{font-size:.8rem;color:var(--ink2)}}
</style></head>
<body><main>
<p class="sub"><a href="/">Autos chinos en Argentina</a> / {e(car['brand'])}</p>
<h1>{e(nombre)}</h1>
<p class="sub">{e(tipo.capitalize())}, {e(car.get('body', ''))}. {e(ESTADO.get(car['status'], ''))}. Precio de lista: {e(precio)}.</p>
<figure><img src="/fotos/{slug}-1.jpg" alt="{e(nombre)}" width="900" height="570">{f'<figcaption>{e(credito)}</figcaption>' if credito else ''}</figure>
<a class="cta" href="/?auto={slug}">Compararlo con otros autos</a>
{colores_html}
{videos_html}
{''.join(secciones)}
<footer><p>Datos de la ficha técnica oficial argentina; lo que sale de otra fuente está aclarado. "Sin dato" quiere decir que la fuente no lo informa, no que el auto no lo tenga.</p>
<p><a href="/">Volver al comparativo</a></p></footer>
</main></body></html>
'''


MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
fecha_larga = lambda f: f'{int(f[8:])} de {MESES[int(f[5:7]) - 1]} de {f[:4]}'
usd = lambda n: 'USD ' + f'{n:,}'.replace(',', '.')


def novedades(cars, slugs):
    """Novedades (2026-10-08): salen de datos que ya existen, nunca escritas a mano salvo
    novedades.json (hitos del sitio). Cambios de precio de HISTORIAL_PRECIOS (misma versión),
    promos vigentes de cada marca (concesionarios.json) y novedades.json."""
    s = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    hist = json.loads(re.search(r'const HISTORIAL_PRECIOS = (\{.*?\});\n', s).group(1))
    nombre = dict(zip(slugs, (c['name'] for c in cars)))
    items = []
    for sl, h in hist.items():
        for a, b in zip(h, h[1:]):
            if a[2] != b[2] or a[1] == b[1]: continue
            d = b[1] - a[1]
            items.append({'fecha': b[0], 'titulo': f"{'Bajó' if d < 0 else 'Subió'} el {nombre.get(sl, sl)}: {usd(a[1])} → {usd(b[1])}",
                          'texto': f"Precio de lista oficial de la versión {b[2]}, {'menos' if d < 0 else 'más'} {usd(abs(d))} que en la lista anterior.",
                          'link': f'/autos/{sl}'})
    hoy = date.today().isoformat()
    red = json.load(open(os.path.join(RAIZ, 'concesionarios.json'), encoding='utf-8'))
    por_slug = {sl: i for i, sl in enumerate(slugs)}
    for marca, m in sorted(red['marcas'].items()):
        ps = [p for p in m.get('promos', []) if p['tipo'] != 'precio' and (not p.get('vigencia') or p['vigencia'] >= hoy)]
        if not ps: continue
        autos = sorted({nombre[a] for p in ps for a in p['autos'] if a in por_slug}) or ['toda la gama']
        items.append({'fecha': m.get('promos_consultado', hoy), 'titulo': f'Promociones de {marca}: {len(ps)} vigente' + ('s' if len(ps) > 1 else ''),
                      'texto': 'Para ' + ', '.join(autos[:6]) + (' y más' if len(autos) > 6 else '') + '. ' + ' '.join(p['texto'] for p in ps[:2])[:300],
                      'link': next((f'/autos/{a}' for p in ps for a in p['autos'] if a in por_slug), '/')})
    items += json.load(open(os.path.join(RAIZ, 'novedades.json'), encoding='utf-8'))
    items.sort(key=lambda x: x['fecha'], reverse=True)
    e = H.escape
    pagina_html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novedades: precios, promociones y autos chinos nuevos en Argentina</title>
<meta name="description" content="Bajas y subas de precio de lista, promociones vigentes de cada marca y autos nuevos en el comparativo de autos chinos en Argentina.">
<link rel="canonical" href="{SITIO}/novedades">
<link rel="alternate" type="application/rss+xml" title="Novedades" href="/novedades.xml">
<style>
:root{{--paper:#EEF1EE;--ink:#17211D;--ink2:#4B5A53;--line:#C9D4CE;--accent:#00843D}}
@media (prefers-color-scheme:dark){{:root{{--paper:#141B18;--ink:#E4EAE6;--ink2:#9DB3A8;--line:#2E3A35;--accent:#3FB57A}}}}
body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:760px;margin:0 auto;padding:16px}} a{{color:var(--accent)}} h1{{font-size:2rem;line-height:1.1;margin:8px 0;text-wrap:balance}}
.sub{{color:var(--ink2);margin:0 0 16px}} ol{{list-style:none;margin:0;padding:0}}
li{{border-bottom:1px solid var(--line);padding:10px 0}} time{{font-size:.8rem;color:var(--ink2)}}
h2{{font-size:1.05rem;margin:2px 0}} p{{margin:2px 0}}
</style></head><body><main>
<p class="sub"><a href="/">Autos chinos en Argentina</a> / Novedades</p>
<h1>Novedades</h1>
<p class="sub">Cambios de precio de lista, promociones vigentes y lo nuevo del comparativo. También por <a href="/novedades.xml">RSS</a>.</p>
<ol>{''.join(f'<li><time datetime="{x["fecha"]}">{fecha_larga(x["fecha"])}</time><h2><a href="{e(x["link"])}">{e(x["titulo"])}</a></h2><p>{e(x["texto"])}</p></li>' for x in items)}</ol>
</main></body></html>
'''
    rfc = lambda f: datetime(int(f[:4]), int(f[5:7]), int(f[8:]), 12, tzinfo=timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
    rss = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n'
           f'<title>Autos chinos en Argentina: novedades</title><link>{SITIO}/novedades</link>'
           '<description>Cambios de precio de lista, promociones vigentes y autos nuevos.</description><language>es-ar</language>\n' +
           ''.join(f'<item><title>{e(x["titulo"])}</title><link>{SITIO}{e(x["link"])}</link>'
                   f'<guid isPermaLink="false">{e(x["fecha"] + " " + x["titulo"])}</guid><pubDate>{rfc(x["fecha"])}</pubDate>'
                   f'<description>{e(x["texto"])}</description></item>\n' for x in items[:60]) +
           '</channel></rss>\n')
    return pagina_html, rss


def generar():
    data, cars, slugs, creditos, colores, videos = leer()
    salida = {}
    for i, (car, slug, cred) in enumerate(zip(cars, slugs, creditos)):
        salida[os.path.join(DIR, slug + '.html')] = pagina(i, data, car, slug, cred, colores, videos)
    pag_nov, rss = novedades(cars, slugs)
    salida[os.path.join(RAIZ, 'novedades.html')] = pag_nov
    salida[os.path.join(RAIZ, 'novedades.xml')] = rss
    urls = [SITIO + '/', SITIO + '/novedades'] + [f'{SITIO}/autos/{s}' for s in slugs]
    salida[os.path.join(RAIZ, 'sitemap.xml')] = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                                 ''.join(f'  <url><loc>{u}</loc></url>\n' for u in urls) + '</urlset>\n')
    salida[os.path.join(RAIZ, 'robots.txt')] = f'User-agent: *\nAllow: /\nSitemap: {SITIO}/sitemap.xml\n'
    # En el pie del comparativo, un link a cada página: así Google las encuentra.
    idx = os.path.join(RAIZ, 'index.html'); s = open(idx, encoding='utf-8').read()
    lista = sorted(zip(cars, slugs), key=lambda cs: cs[0]['name'].lower())
    nav = ('<nav class="todos-autos" aria-label="Página de cada auto"><h2>La página de cada auto</h2><ul>' +
           ''.join(f'<li><a href="/autos/{sl}">{H.escape(c["name"])}</a></li>' for c, sl in lista) + '</ul></nav>')
    s = re.sub(r'(<!-- autos:inicio[^>]*-->\n).*?(<!-- autos:fin -->)', lambda m: m.group(1) + nav + '\n' + m.group(2), s, flags=re.S)
    salida[idx] = s
    return salida, slugs


if __name__ == '__main__':
    salida, slugs = generar()
    sobran = sorted(set(f for f in os.listdir(DIR) if f.endswith('.html')) - {s + '.html' for s in slugs}) if os.path.isdir(DIR) else []
    if '--check' in sys.argv:
        viejas = [os.path.relpath(r, RAIZ) for r, t in salida.items() if not os.path.exists(r) or open(r, encoding='utf-8').read() != t]
        if viejas or sobran:
            sys.exit('desactualizadas: ' + ', '.join(viejas + sobran) + '\ncorrer: python3 herramientas-paginas.py')
        print('páginas al día'); sys.exit(0)
    os.makedirs(DIR, exist_ok=True)
    for r, t in salida.items(): open(r, 'w', encoding='utf-8').write(t)
    for f in sobran: os.remove(os.path.join(DIR, f))
    print(f'{len(slugs)} páginas, sitemap.xml y robots.txt')
