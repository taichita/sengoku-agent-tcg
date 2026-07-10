import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

http.server.test(HandlerClass=NoCacheHandler, port=port)
