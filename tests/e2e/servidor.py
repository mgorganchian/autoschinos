#!/usr/bin/env python3
"""Servidor estático para la suite: como `python3 -m http.server`, pero con una cola de
conexiones grande. Con la cola por defecto (5), las 100+ miniaturas de fotos/mini que el
encabezado pide juntas hacían que el servidor cortara conexiones (ERR_CONNECTION_RESET) y
los tests que vigilan la consola fallaban sin que la página tuviera nada roto."""
import functools, http.server, sys

class Servidor(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True

class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

puerto, raiz = int(sys.argv[1]), sys.argv[2]
Servidor(('127.0.0.1', puerto), functools.partial(Silencioso, directory=raiz)).serve_forever()
