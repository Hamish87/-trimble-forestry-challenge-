#!/usr/bin/env python3
"""Static dev server for this repository with no-store caching (so edited scripts reload at once).
Usage: python3 scripts/dev-server.py [port] [directory]  — defaults: 3002, repository root."""
import sys, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3002
    directory = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(directory)
    print(f"serving {directory} on http://localhost:{port}/ (no-store)")
    ThreadingHTTPServer(('', port), Handler).serve_forever()
