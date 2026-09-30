#!/usr/bin/env python3
"""Fotos del carrusel desde Wikimedia Commons, en tres pasos.

    python3 herramientas-fotos.py buscar            # baja y procesa candidatas
    python3 herramientas-fotos.py instalar ID...    # agrega las aprobadas
    python3 herramientas-fotos.py descartar ID "motivo"

Entre `buscar` e `instalar` hay que MIRAR cada candidata (.fotos-candidatas/ID.jpg).
No hay forma de saltear ese paso: en el lote del 2026-09-22 hubo que descartar 8
de 117 (volantes recortados flotando en blanco, un techo de vidrio con reflejo, un
prototipo camuflado) y ninguno se delataba por tamaño ni por nombre de archivo.

`instalar` es lo único que toca index.html, fotos/ y fotos-fuentes.tsv, y los toca
juntos: FOTOS_POR_AUTO, CREDITOS_POR_FOTO y el manifiesto no pueden desalinearse
porque los escribe el mismo paso. tests/e2e/fotos.spec.js verifica que así sea.

Una candidata cuyo nombre no dice "interior" pero lo es se instala como ID:interior:
para esas `buscar` deja también ID.int.jpg, sin el recorte de Vision, y es la que
se instala. Mirar ESA versión antes de decidir, no la recortada.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

RAIZ = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(RAIZ, 'index.html')
FOTOS = os.path.join(RAIZ, 'fotos')
MANIFIESTO = os.path.join(RAIZ, 'fotos-fuentes.tsv')
DESCARTADAS = os.path.join(RAIZ, 'fotos-descartadas.tsv')
PORTADAS = os.path.join(RAIZ, 'fichas-fuentes.tsv')
CAND = os.path.join(RAIZ, '.fotos-candidatas')      # está en .gitignore
SWIFT = os.path.join(RAIZ, 'herramientas-recortar-fotos.swift')
UA = 'autoschinos-comparativo/1.0 (https://github.com/mgorganchian/autoschinos)'

MAX_TOTAL = 7        # portada + 6
MAX_INTERIOR = 2
POR_CORRIDA = 4      # candidatas por auto y por corrida, para que revisar sea viable

# Nombre con el que Commons conoce al auto cuando difiere del argentino.
# Verificados a mano: Skywell BE11 = Skyworth EV6; Omoda C5 = Omoda 5 (NO el Omoda E5).
ALIAS = {'Skywell BE11': 'Skyworth EV6', 'Omoda C5': 'Omoda 5', 'Ora 03': 'GWM Ora 03',
         'Tank 300': 'GWM Tank 300', 'Maxus eTerron': 'Maxus eTerron 9'}
INTERIOR = re.compile(r'interior|dashboard|cockpit|innenraum|cabin|interieur', re.I)
# Detalles que no sirven como foto del auto.
DETALLE = re.compile(r'\bengine\b|motor bay|badge|emblem|logo|wheel detail|taillight|headlamp|'
                     r'charging port|\bplate\b|steering wheel|camouflage|prototype|spy', re.I)


def vista(nombre):
    t = nombre.lower()
    if INTERIOR.search(t): return 'interior'
    if re.search(r'\brear\b|back view', t): return 'trasera'
    if re.search(r'\bside\b|profile', t): return 'lateral'
    if 'front' in t: return 'frente'
    return 'otra'


def leer_index():
    return open(INDEX, encoding='utf-8').read()


def mapa(html, nombre):
    m = re.search(r'(const %s\s*=\s*)(\{.*?\})(;)' % nombre, html, re.S)
    if not m: sys.exit(f'no encontré {nombre} en index.html')
    return m, json.loads(m.group(2))


def autos(html):
    ini = html.index('const CARS = ['); fin = html.index('];', ini)
    nombres = re.findall(r'name:"([^"]+)"', html[ini:fin])
    slugs = re.findall(r'<img class="car-photo" data-slug="([^"]+)"', html)
    if len(nombres) != len(slugs): sys.exit('CARS y los <th> no tienen la misma cantidad de autos')
    return list(zip(slugs, nombres))


def filas_tsv(ruta):
    if not os.path.exists(ruta): return []
    return [l.rstrip('\n').split('\t') for l in open(ruta, encoding='utf-8')
            if l.strip() and not l.startswith('#')]


def ya_vistos():
    """Archivos de Commons que ya están en uso o ya se descartaron."""
    usados = {c[2] for c in filas_tsv(MANIFIESTO) if len(c) > 2}
    usados |= {c[0] for c in filas_tsv(DESCARTADAS)}
    # Las portadas que vienen de Commons figuran en fichas-fuentes.tsv como
    # "auto <TAB> archivo <TAB> licencia <TAB> autor <TAB> página de Commons".
    usados |= {c[1] for c in filas_tsv(PORTADAS) if len(c) > 4 and 'commons.wikimedia.org' in c[4]}
    return usados


def api(**kw):
    p = {'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': '6',
         'gsrlimit': '40', 'prop': 'imageinfo', 'iiprop': 'extmetadata|url|size',
         'iiextmetadatafilter': 'LicenseShortName|Artist'}
    p.update(kw)
    req = urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p),
                                 headers={'User-Agent': UA})
    return json.load(urllib.request.urlopen(req, timeout=45))


def coincide(archivo, modelo):
    # Todos los tokens del modelo tienen que estar en el NOMBRE DEL ARCHIVO, no en la
    # ruta ni en la descripción: una vez "01" matcheó por ser el mes de /2026/01/.
    return all(re.search(r'(?<![a-z0-9])' + re.escape(w) + r'(?![a-z0-9])', archivo, re.I)
               for w in re.split(r'[\s&]+', modelo) if w)


def procesar(crudo, salida, es_interior):
    if es_interior:
        # Los interiores NO pasan por Vision: el recorte por sujeto les saca el
        # tablero y deja el volante flotando en blanco.
        r = subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62', '-Z', '900',
                            crudo, '--out', salida], capture_output=True)
    else:
        binario = os.path.join(CAND, 'recortar')
        if not os.path.exists(binario):
            subprocess.run(['swiftc', '-O', SWIFT, '-o', binario], check=True, capture_output=True)
        r = subprocess.run([binario, crudo, salida, '900', '570', '0.62', '0.06'], capture_output=True)
    return r.returncode == 0 and os.path.getsize(salida) > 0 if os.path.exists(salida) else False


def buscar():
    html = leer_index()
    _, fpa = mapa(html, 'FOTOS_POR_AUTO')
    man = filas_tsv(MANIFIESTO)
    interiores = {}
    for c in man:
        if c[1] == 'interior':
            s = c[0].rsplit('-', 1)[0]; interiores[s] = interiores.get(s, 0) + 1
    vistos = ya_vistos()
    shutil.rmtree(CAND, ignore_errors=True); os.makedirs(CAND)
    # Primero los autos sin ningún interior: es el hueco más grande del carrusel.
    orden = sorted(autos(html), key=lambda a: (interiores.get(a[0], 0) > 0, fpa.get(a[0], 1)))
    elegidas = []
    for slug, nombre in orden:
        tiene, ints = fpa.get(slug, 1), interiores.get(slug, 0)
        lugar = MAX_TOTAL - tiene
        if lugar <= 0: continue
        modelo = ALIAS.get(nombre, nombre)
        hallados = {}
        for q in (modelo + ' interior', modelo):
            try: d = api(gsrsearch=q)
            except Exception as e:
                print(f'# {nombre}: Commons no respondió ({e})', file=sys.stderr); continue
            for p in (d.get('query', {}).get('pages') or {}).values():
                t = p['title'][5:]
                if t in vistos or t in hallados: continue
                if not re.search(r'\.(jpe?g|png)$', t, re.I) or DETALLE.search(t): continue
                if not coincide(t, modelo): continue
                ii = p['imageinfo'][0]
                if ii['width'] < 1100: continue
                em = ii.get('extmetadata', {})
                lic = em.get('LicenseShortName', {}).get('value', '')
                if not lic or 'fair use' in lic.lower(): continue
                autor = re.sub(r'<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip()
                autor = re.sub(r'\s+', ' ', autor)[:60]
                if not autor: continue      # sin autor no se puede atribuir
                hallados[t] = (vista(t), lic, autor, ii['width'] * ii['height'])
            time.sleep(0.35)
        ints_nuevos = 0
        # interiores primero, después lo más grande
        for t, (v, lic, autor, area) in sorted(hallados.items(), key=lambda kv: (kv[1][0] != 'interior', -kv[1][3])):
            if lugar <= 0 or len([e for e in elegidas if e[1] == slug]) >= POR_CORRIDA: break
            if v == 'interior':
                if ints + ints_nuevos >= MAX_INTERIOR: continue
                ints_nuevos += 1
            elegidas.append((f'{slug}~{len(elegidas):03d}', slug, v, t, lic, autor))
            lugar -= 1
    listas = []
    for cid, slug, v, t, lic, autor in elegidas:
        crudo = os.path.join(CAND, cid + '.orig')
        url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(t) + '?width=1600'
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as r, \
                 open(crudo, 'wb') as f:
                f.write(r.read())
        except Exception as e:
            print(f'# {cid}: no se pudo bajar ({e})', file=sys.stderr); continue
        if procesar(crudo, os.path.join(CAND, cid + '.jpg'), v == 'interior'):
            listas.append((cid, slug, v, t, lic, autor))
            # Muchas fotos de cabina no dicen "interior" en el nombre y Vision las
            # destruye: deja el volante flotando en blanco. Se guarda también la
            # versión sin recorte, que es la que usa "instalar ID:interior".
            if v != 'interior':
                procesar(crudo, os.path.join(CAND, cid + '.int.jpg'), True)
        os.remove(crudo)
    with open(os.path.join(CAND, 'candidatas.tsv'), 'w', encoding='utf-8') as f:
        for fila in listas: f.write('\t'.join(fila) + '\n')
    print(f'{len(listas)} candidatas en {CAND}/ — mirá cada .jpg antes de instalar o descartar:')
    for cid, slug, v, t, lic, autor in listas:
        print(f'  {cid}  {v:<9} {t}  ({lic}, {autor})')


def candidatas():
    ruta = os.path.join(CAND, 'candidatas.tsv')
    if not os.path.exists(ruta): sys.exit('no hay candidatas: correr primero "buscar"')
    return {c[0]: c for c in filas_tsv(ruta)}


def instalar(ids):
    cands = candidatas()
    html = leer_index()
    m_fpa, fpa = mapa(html, 'FOTOS_POR_AUTO')
    _, cred = mapa(html, 'CREDITOS_POR_FOTO')
    nuevas = []
    for arg in ids:
        cid, _, forzada = arg.partition(':')
        if cid not in cands: sys.exit(f'{cid}: no es una candidata de esta corrida')
        _, slug, v, t, lic, autor = cands[cid]
        v = forzada or v
        n = fpa.get(slug, 1) + 1
        if n > MAX_TOTAL: sys.exit(f'{cid}: {slug} ya tiene {MAX_TOTAL} fotos')
        destino = f'{slug}-{n}.jpg'
        if os.path.exists(os.path.join(FOTOS, destino)): sys.exit(f'{destino} ya existe y FOTOS_POR_AUTO no lo cuenta')
        fpa[slug] = n
        lista = cred.get(slug) or [''] * (n - 1)
        lista += [''] * (n - 1 - len(lista))
        cred[slug] = lista[:n - 1] + [f'Foto: {autor} · {lic} · Wikimedia Commons']
        pagina = 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(t.replace(' ', '_'), safe="(),'!_-.~")
        nuevas.append((cid, destino, [destino, v, t, lic, autor, pagina]))
    # Todo validado: recién ahora se escribe, y todo junto.
    for cid, destino, fila in nuevas:
        sin_recorte = os.path.join(CAND, cid + '.int.jpg')
        origen = sin_recorte if fila[1] == 'interior' and os.path.exists(sin_recorte) else os.path.join(CAND, cid + '.jpg')
        shutil.copyfile(origen, os.path.join(FOTOS, destino))
    html = html[:m_fpa.start(2)] + json.dumps(fpa, ensure_ascii=False, separators=(',', ':')) + html[m_fpa.end(2):]
    m_cred, _ = mapa(html, 'CREDITOS_POR_FOTO')
    html = html[:m_cred.start(2)] + json.dumps(cred, ensure_ascii=False, separators=(',', ':')) + html[m_cred.end(2):]
    open(INDEX, 'w', encoding='utf-8').write(html)
    with open(MANIFIESTO, 'a', encoding='utf-8') as f:
        for _, _, fila in nuevas: f.write('\t'.join(fila) + '\n')
    for cid, destino, fila in nuevas:
        print(f'instalada {destino}  ({fila[1]}, {fila[4]}, {fila[3]})')


def descartar(cid, motivo):
    cands = candidatas()
    if cid not in cands: sys.exit(f'{cid}: no es una candidata de esta corrida')
    nuevo = not os.path.exists(DESCARTADAS)
    with open(DESCARTADAS, 'a', encoding='utf-8') as f:
        if nuevo:
            f.write('# Fotos de Commons que se miraron y NO sirven. "buscar" no las vuelve a proponer.\n'
                    '# archivo en Commons <TAB> auto <TAB> motivo <TAB> fecha\n')
        f.write('\t'.join([cands[cid][3], cands[cid][1], motivo.replace('\t', ' '), date.today().isoformat()]) + '\n')
    print(f'descartada {cid}: {motivo}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['buscar']: buscar()
    elif a[:1] == ['instalar'] and len(a) > 1: instalar(a[1:])
    elif a[:1] == ['descartar'] and len(a) == 3: descartar(a[1], a[2])
    else: sys.exit(__doc__)
