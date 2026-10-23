"""Static dev server for the port.

python -m http.server resets connections under the page's burst of asset requests
(listen backlog 5) and lets browsers reuse stale ES modules; this fixes both.

Usage: python3 tools/serve.py [port]   (serves the web/ folder, default port 8737)
"""
import functools
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8737
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(Handler, directory=root)
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"Contra: http://127.0.0.1:{port}")
        httpd.serve_forever()
