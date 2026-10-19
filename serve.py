"""Tiny development server: serves this folder on http://localhost:8000 and tells the browser
never to cache, so a normal refresh always shows the latest code."""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as server:
    print(f"Keyfall running at http://localhost:{PORT}  (Ctrl+C to stop)")
    server.serve_forever()
