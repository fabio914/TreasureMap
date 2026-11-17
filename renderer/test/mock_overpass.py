"""Static file server plus a fake Overpass endpoint for end-to-end tests.

POST /interpreter answers every query with the elements of one fixture, so the
interactive app can be exercised without the real Overpass API.

Usage: python3 test/mock_overpass.py [port] [fixture-name]   (run from renderer/)
Then open http://127.0.0.1:<port>/?overpass=http://127.0.0.1:<port>/interpreter
"""
import http.server, json, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
FIXTURE = sys.argv[2] if len(sys.argv) > 2 else "oak"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "test", "fixtures", FIXTURE + ".json"), encoding="utf-8") as f:
    BODY = json.dumps({"elements": json.load(f)["elements"]}).encode()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
