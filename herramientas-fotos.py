#!/usr/bin/env python3
"""Fotos del carrusel desde Wikimedia Commons, en tres pasos.

    python3 herramientas-fotos.py buscar [SLUG...]        # baja y procesa candidatas
    python3 herramientas-fotos.py instalar ID:VISTA...    # agrega las aprobadas, con su vista
    python3 herramientas-fotos.py descartar ID "motivo"
    python3 herramientas-fotos.py reorganizar PLAN.tsv    # vistas, repetidas y orden de lo instalado
    python3 herramientas-fotos.py portada SLUG carrusel N VISTA
    python3 herramientas-fotos.py portada SLUG IMAGEN VISTA "crédito" "fila de fichas-fuentes.tsv" [sin-recorte]
                                                          # cambia la portada (foto 1, miniatura y crédito)

Cada auto tiene a lo sumo UNA foto por vista (VISTAS, abajo): frente, perfiles, cola,
baúl abierto, tablero, instrumentos, consola, asientos. Dos fotos casi iguales no suman
(pedido del usuario, 2026-10-05). La vista se decide MIRANDO la foto, no por el nombre
del archivo: `instalar` la pide explícita. Lado del perfil = lado del AUTO: si la trompa
apunta a la izquierda de la imagen, se ve el lado izquierdo.

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

# Una foto por vista, en este orden en el carrusel (la portada queda siempre primera).
VISTAS = [('tres-cuartos-delantero', 'Tres cuartos delantero'), ('frente', 'Frente'),
          ('perfil-izquierdo', 'Perfil izquierdo'), ('perfil-derecho', 'Perfil derecho'),
          ('tres-cuartos-trasero', 'Tres cuartos trasero'), ('trasera', 'Atrás'),
          ('baul-abierto', 'Baúl abierto'), ('tablero', 'Tablero'), ('instrumentos', 'Instrumentos'),
          ('consola-central', 'Consola central'), ('asientos-delanteros', 'Asientos delanteros'),
          ('asientos-traseros', 'Plazas traseras')]
CLAVES = [v for v, _ in VISTAS]
INTERIORES = {'tablero', 'instrumentos', 'consola-central', 'asientos-delanteros', 'asientos-traseros'}
MAX_TOTAL = len(VISTAS)
POR_CORRIDA = 14     # candidatas por auto y por corrida: después se elige una por vista

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


def vistas_actuales(html):
    """VISTAS_POR_FOTO: por auto, la vista de cada foto en orden (la 0 es la portada)."""
    m = re.search(r'const VISTAS_POR_FOTO\s*=\s*(\{.*?\});', html, re.S)
    return json.loads(m.group(1)) if m else {}


def categorias(modelo):
    """Categorías de Commons cuyo nombre trae todos los tokens del modelo, y sus archivos."""
    try:
        d = api(gsrsearch=modelo, gsrnamespace='14', gsrlimit='10', prop='info')
    except Exception:
        return []
    cats = [p['title'] for p in (d.get('query', {}).get('pages') or {}).values() if coincide(p['title'][9:], modelo)]
    archivos = []
    for c in cats[:3]:
        p = {'action': 'query', 'format': 'json', 'generator': 'categorymembers', 'gcmtitle': c, 'gcmtype': 'file',
             'gcmlimit': '200', 'prop': 'imageinfo', 'iiprop': 'extmetadata|url|size',
             'iiextmetadatafilter': 'LicenseShortName|Artist'}
        req = urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p), headers={'User-Agent': UA})
        try: archivos += list((json.load(urllib.request.urlopen(req, timeout=45)).get('query', {}).get('pages') or {}).values())
        except Exception: pass
        time.sleep(0.35)
    return archivos


def buscar(solo=()):
    html = leer_index()
    _, fpa = mapa(html, 'FOTOS_POR_AUTO')
    vpf = vistas_actuales(html)
    vistos = ya_vistos()
    # Sin autos pedidos, corrida completa desde cero. Con autos pedidos, se suman a las
    # candidatas que ya había (así se puede buscar por tandas sin perder lo anterior).
    if not solo: shutil.rmtree(CAND, ignore_errors=True)
    os.makedirs(CAND, exist_ok=True)
    ruta = os.path.join(CAND, 'candidatas.tsv')
    previas = [c for c in filas_tsv(ruta) if c[1] not in solo] if solo else []
    elegidas = []
    for slug, nombre in autos(html):
        if solo and slug not in solo: continue
        n_auto = 0
        faltan = [v for v in CLAVES if v not in vpf.get(slug, [])]
        if not faltan or fpa.get(slug, 1) >= MAX_TOTAL: continue
        modelo = ALIAS.get(nombre, nombre)
        hallados = {}
        paginas = []
        for q in (modelo, modelo + ' interior', modelo + ' rear', modelo + ' dashboard'):
            try: paginas += list((api(gsrsearch=q).get('query', {}).get('pages') or {}).values())
            except Exception as e: print(f'# {nombre}: Commons no respondió ({e})', file=sys.stderr)
            time.sleep(0.35)
        de_categoria = categorias(modelo)
        for p in paginas + de_categoria:
            t = p['title'][5:]
            if t in vistos or t in hallados: continue
            if not re.search(r'\.(jpe?g|png)$', t, re.I) or DETALLE.search(t): continue
            # Por búsqueda, el modelo tiene que estar en el nombre del archivo; por categoría
            # alcanza con la categoría (muchos archivos se llaman IMG_1234.jpg). La versión
            # se verifica igual al mirar la foto.
            if p not in de_categoria and not coincide(t, modelo): continue
            ii = (p.get('imageinfo') or [{}])[0]
            if ii.get('width', 0) < 1100: continue
            em = ii.get('extmetadata', {})
            lic = em.get('LicenseShortName', {}).get('value', '')
            if not lic or 'fair use' in lic.lower(): continue
            autor = re.sub(r'<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip()
            autor = re.sub(r'\s+', ' ', autor)[:60]
            if not autor: continue      # sin autor no se puede atribuir
            hallados[t] = (vista(t), lic, autor, ii['width'] * ii['height'])
        for t, (v, lic, autor, area) in sorted(hallados.items(), key=lambda kv: -kv[1][3])[:POR_CORRIDA]:
            elegidas.append((f'{slug}~{n_auto:02d}', slug, v, t, lic, autor)); n_auto += 1
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
        # Dos versiones: recortada por Vision sobre blanco (exteriores) y sin recorte
        # (interiores: Vision deja el volante flotando). La vista decide cuál se instala.
        if procesar(crudo, os.path.join(CAND, cid + '.jpg'), False) | procesar(crudo, os.path.join(CAND, cid + '.int.jpg'), True):
            listas.append((cid, slug, v, t, lic, autor))
        os.remove(crudo)
    with open(ruta, 'w', encoding='utf-8') as f:
        for fila in previas + listas: f.write('\t'.join(fila) + '\n')
    print(f'{len(listas)} candidatas en {CAND}/ — mirá cada una antes de instalar o descartar:')
    for cid, slug, v, t, lic, autor in listas:
        print(f'  {cid}  {t}  ({lic}, {autor})')


def candidatas():
    ruta = os.path.join(CAND, 'candidatas.tsv')
    if not os.path.exists(ruta): sys.exit('no hay candidatas: correr primero "buscar"')
    return {c[0]: c for c in filas_tsv(ruta)}


def estado(html):
    """Por auto, la lista de fotos instaladas: [{archivo, vista, cred, fila}] (la 0 es la portada)."""
    _, fpa = mapa(html, 'FOTOS_POR_AUTO')
    _, cred = mapa(html, 'CREDITOS_POR_FOTO')
    vpf = vistas_actuales(html)
    man = {c[0]: c for c in filas_tsv(MANIFIESTO)}
    out = {}
    for slug, _ in autos(html):
        n = fpa.get(slug, 1)
        vs = vpf.get(slug) or []
        out[slug] = [{'archivo': f'{slug}-{k + 1}.jpg', 'vista': vs[k] if k < len(vs) else 'sin-vista',
                      'cred': (cred.get(slug) or [''] * n)[k] if k < len(cred.get(slug) or []) else '',
                      'fila': man.get(f'{slug}-{k + 1}.jpg')} for k in range(n)]
    return out


def escribir(html, cambios, nuevas_descartadas=()):
    """Reescribe, para los autos de `cambios`, los archivos de fotos/, FOTOS_POR_AUTO,
    CREDITOS_POR_FOTO, VISTAS_POR_FOTO y fotos-fuentes.tsv, todo junto. Cada foto se
    ubica por el orden de VISTAS (la portada queda primera). Valida antes de escribir."""
    _, fpa = mapa(html, 'FOTOS_POR_AUTO')
    _, cred = mapa(html, 'CREDITOS_POR_FOTO')
    vpf = vistas_actuales(html)
    man = filas_tsv(MANIFIESTO)
    cab = [l for l in open(MANIFIESTO, encoding='utf-8') if l.startswith('#')]
    renombres = []
    for slug, fotos in cambios.items():
        portada, resto = fotos[0], fotos[1:]
        for f in fotos:
            if f['vista'] not in CLAVES: sys.exit(f'{slug}: vista desconocida {f["vista"]!r}')
        if len({f['vista'] for f in fotos}) != len(fotos): sys.exit(f'{slug}: dos fotos con la misma vista')
        if len(fotos) > MAX_TOTAL: sys.exit(f'{slug}: más de {MAX_TOTAL} fotos')
        resto.sort(key=lambda f: CLAVES.index(f['vista']))
        orden = [portada] + resto
        for k, f in enumerate(orden):
            destino = f'{slug}-{k + 1}.jpg'
            renombres.append((f.get('origen') or os.path.join(FOTOS, f['archivo']), destino, f))
        fpa[slug] = len(orden)
        if len(orden) > 1: cred[slug] = [''] + [f['cred'] for f in resto]
        else: cred.pop(slug, None)
        vpf[slug] = [f['vista'] for f in orden]
    tocados = set(cambios)
    # Copiar primero a temporales: renombrar en el lugar pisaría fotos que todavía no se movieron.
    tmp = os.path.join(FOTOS, '.reorganizar'); os.makedirs(tmp, exist_ok=True)
    for i, (origen, destino, f) in enumerate(renombres): shutil.copyfile(origen, os.path.join(tmp, f'{i}.jpg'))
    for slug in tocados:
        for a in os.listdir(FOTOS):
            if re.fullmatch(re.escape(slug) + r'-\d+\.jpg', a): os.remove(os.path.join(FOTOS, a))
    for i, (origen, destino, f) in enumerate(renombres): shutil.move(os.path.join(tmp, f'{i}.jpg'), os.path.join(FOTOS, destino))
    os.rmdir(tmp)
    # Manifiesto: fuera las filas de los autos tocados, adentro las nuevas en orden.
    filas = [c for c in man if c[0].rsplit('-', 1)[0] not in tocados]
    for origen, destino, f in renombres:
        if f['fila'] and not destino.endswith('-1.jpg'): filas.append([destino, f['vista']] + f['fila'][2:])
    filas.sort(key=lambda c: (c[0].rsplit('-', 1)[0], int(c[0].rsplit('-', 1)[1][:-4])))
    with open(MANIFIESTO, 'w', encoding='utf-8') as fh:
        fh.writelines(cab); fh.writelines('\t'.join(c) + '\n' for c in filas)
    for nombre, valor in (('FOTOS_POR_AUTO', fpa), ('CREDITOS_POR_FOTO', cred)):
        m, _ = mapa(html, nombre)
        html = html[:m.start(2)] + json.dumps(valor, ensure_ascii=False, separators=(',', ':')) + html[m.end(2):]
    js = 'const VISTAS_POR_FOTO = ' + json.dumps(vpf, ensure_ascii=False, separators=(',', ':')) + ';'
    m = re.search(r'const VISTAS_POR_FOTO\s*=\s*\{.*?\};', html, re.S)
    if m: html = html[:m.start()] + js + html[m.end():]
    else:
        m, _ = mapa(html, 'FOTOS_POR_AUTO')
        fin = html.index('\n', m.end())
        html = html[:fin + 1] + '// Vista de cada foto, en orden (la 0 es la portada). La escribe herramientas-fotos.py.\n' + js + '\n' + html[fin + 1:]
    open(INDEX, 'w', encoding='utf-8').write(html)
    if nuevas_descartadas:
        with open(DESCARTADAS, 'a', encoding='utf-8') as fh:
            for fila in nuevas_descartadas: fh.write('\t'.join(fila) + '\n')


def instalar(ids):
    cands = candidatas()
    html = leer_index()
    est = estado(html)
    cambios = {}
    for arg in ids:
        cid, _, v = arg.partition(':')
        sin_recorte = v.endswith('!'); v = v.rstrip('!')
        if cid not in cands: sys.exit(f'{cid}: no es una candidata de esta corrida')
        if v not in CLAVES: sys.exit(f'{cid}: falta la vista o no existe ({v!r}); usar ID:VISTA con una de {", ".join(CLAVES)}')
        _, slug, _, t, lic, autor = cands[cid]
        fotos = cambios.setdefault(slug, [dict(f) for f in est[slug]])
        if any(f['vista'] == v for f in fotos): sys.exit(f'{cid}: {slug} ya tiene una foto de {v}')
        pagina = 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(t.replace(' ', '_'), safe="(),'!_-.~")
        origen = os.path.join(CAND, cid + ('.int.jpg' if v in INTERIORES or sin_recorte else '.jpg'))
        if not os.path.exists(origen): sys.exit(f'{cid}: falta {origen}')
        fotos.append({'archivo': None, 'origen': origen, 'vista': v, 'cred': f'Foto: {autor} · {lic} · Wikimedia Commons',
                      'fila': ['', v, t, lic, autor, pagina]})
    escribir(html, cambios)
    for slug, fotos in cambios.items(): print(f'{slug}: {len(fotos)} fotos')


def reorganizar(plan):
    """PLAN.tsv: archivo <TAB> vista <TAB> queda|quita <TAB> motivo. Una fila por foto de
    cada auto que se toque. Las que se quitan van a fotos-descartadas.tsv con su motivo."""
    html = leer_index()
    est = estado(html)
    por_auto, descartes = {}, []
    for c in filas_tsv(plan):
        archivo, v, accion = c[0], c[1], c[2]
        motivo = c[3] if len(c) > 3 else ''
        slug = archivo.rsplit('-', 1)[0]
        f = next((x for x in est[slug] if x['archivo'] == archivo), None)
        if not f: sys.exit(f'{archivo}: no está instalada')
        por_auto.setdefault(slug, {})[archivo] = (v, accion, motivo)
    cambios = {}
    for slug, decis in por_auto.items():
        if set(decis) != {f['archivo'] for f in est[slug]}: sys.exit(f'{slug}: el plan tiene que traer TODAS sus fotos')
        fotos = []
        for f in est[slug]:
            v, accion, motivo = decis[f['archivo']]
            if accion == 'quita':
                if f['archivo'].endswith('-1.jpg'): sys.exit(f'{f["archivo"]}: la portada no se quita desde acá')
                if f['fila']: descartes.append([f['fila'][2], slug, motivo or 'repetida', date.today().isoformat()])
                continue
            if accion != 'queda': sys.exit(f'{f["archivo"]}: acción {accion!r} (queda o quita)')
            fotos.append(dict(f, vista=v))
        cambios[slug] = fotos
    escribir(html, cambios, descartes)
    print(f'{len(cambios)} autos reorganizados; {len(descartes)} fotos quitadas')


def portada(slug, args):
    """Cambia la portada: fotos/<slug>-1.jpg, la miniatura base64 del <th>, su data-credito,
    VISTAS_POR_FOTO[slug][0] y la fila de la portada en fichas-fuentes.tsv, todo junto.
    Con "carrusel N" sube la foto N del carrusel (sale del carrusel); si no, procesa IMAGEN."""
    import base64, tempfile
    html = leer_index()
    nombre = dict(autos(html))[slug]
    est = estado(html)[slug]
    if args[0] == 'carrusel':
        n, v = int(args[1]), args[2]
        f = est[n - 1]
        if not f['fila']: sys.exit(f'{slug}-{n}.jpg no tiene fila en fotos-fuentes.tsv')
        origen = os.path.join(FOTOS, f['archivo'])
        credito = f['cred']
        fila = [nombre] + f['fila'][2:]                          # archivo de Commons, licencia, autor, página
        resto = [x for k, x in enumerate(est[1:], start=2) if k != n]
    else:
        img, v, credito, fila_txt = args[0], args[1], args[2], args[3]
        origen = os.path.join(CAND, 'portada-' + slug + '.jpg'); os.makedirs(CAND, exist_ok=True)
        if not procesar(img, origen, len(args) > 4 and args[4] == 'sin-recorte'): sys.exit('no se pudo procesar ' + img)
        fila = fila_txt.split('\t')
        if fila[0] != nombre: sys.exit(f'la fila tiene que empezar con el nombre exacto: {nombre!r}')
        resto = est[1:]
    if v not in CLAVES: sys.exit(f'vista desconocida {v!r}')
    if any(x['vista'] == v for x in resto): sys.exit(f'{slug}: el carrusel ya tiene una foto de {v}; sacala antes con reorganizar')
    tmp = tempfile.mkdtemp()
    shutil.copyfile(origen, os.path.join(tmp, 'p.jpg'))
    miniatura = os.path.join(tmp, 'm.jpg')
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-z', '190', '300',
                    os.path.join(tmp, 'p.jpg'), '--out', miniatura], check=True, capture_output=True)
    b64 = base64.b64encode(open(miniatura, 'rb').read()).decode()
    m = re.search(r'<img class="car-photo" data-slug="%s"[^>]*>' % re.escape(slug), html)
    if not m: sys.exit('no encontré la miniatura de ' + slug)
    tag = re.sub(r' data-credito="[^"]*"', '', m.group(0))
    tag = re.sub(r'src="data:image/[a-z]+;base64,[^"]+"', 'src="data:image/jpeg;base64,' + b64 + '"', tag)
    if credito: tag = tag.replace(' alt=""', ' alt="" data-credito="' + credito.replace('"', '&quot;') + '"', 1)
    html = html[:m.start()] + tag + html[m.end():]
    open(INDEX, 'w', encoding='utf-8').write(html)
    # La portada nueva entra como foto 1; el carrusel se reescribe sin la que subió.
    nueva = {'archivo': None, 'origen': os.path.join(tmp, 'p.jpg'), 'vista': v, 'cred': '', 'fila': None}
    escribir(html, {slug: [nueva] + [dict(x) for x in resto]})
    # fichas-fuentes.tsv: fuera la fila de la portada vieja, adentro la nueva.
    lineas = open(PORTADAS, encoding='utf-8').read().split('\n')
    es_portada = lambda c: len(c) > 1 and c[0] == nombre and re.search(r'\.(jpe?g|png|webp)$|^tapa de |^página |^foto del auto', c[1], re.I)
    quedan = [l for l in lineas if not es_portada(l.split('\t'))]
    while quedan and not quedan[-1].strip(): quedan.pop()
    if '# PORTADAS CAMBIADAS DESPUÉS (herramientas-fotos.py portada)' not in quedan:
        quedan += ['', '# PORTADAS CAMBIADAS DESPUÉS (herramientas-fotos.py portada)']
    quedan.append('\t'.join(fila))
    open(PORTADAS, 'w', encoding='utf-8').write('\n'.join(quedan) + '\n')
    print(f'{slug}: portada nueva ({v}); {len(lineas) - len(quedan) + 1 + (0 if len(lineas) else 0)} fila(s) de portada vieja quitadas')


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
    if a[:1] == ['buscar']: buscar(set(a[1:]))
    elif a[:1] == ['instalar'] and len(a) > 1: instalar(a[1:])
    elif a[:1] == ['reorganizar'] and len(a) == 2: reorganizar(a[1])
    elif a[:1] == ['portada'] and len(a) >= 4: portada(a[1], a[2:])
    elif a[:1] == ['descartar'] and len(a) == 3: descartar(a[1], a[2])
    else: sys.exit(__doc__)
