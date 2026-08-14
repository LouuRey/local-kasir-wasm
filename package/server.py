"""Static server for Kasir Lokal with the headers required by SQLite OPFS."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path

class WasmHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    port = 8000
    directory = Path(__file__).parent
    print(f"Kasir Lokal siap di http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), partial(WasmHandler, directory=str(directory))).serve_forever()
