import http.server
import socketserver
import threading
import urllib.request
import time
import sys

PORT = 8000
Handler = http.server.SimpleHTTPRequestHandler

httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
thread = threading.Thread(target=httpd.serve_forever)
thread.daemon = True
thread.start()
print(f"Started temporary HTTP server on http://127.0.0.1:{PORT}/")
# give server a moment
time.sleep(0.5)
try:
    resp = urllib.request.urlopen(f'http://127.0.0.1:{PORT}/')
    print('HTTP status:', getattr(resp, 'status', 'unknown'))
    data = resp.read(512)
    print('First bytes length:', len(data))
    print('Sample (truncated):')
    print(data.decode('utf-8', errors='replace')[:400])
except Exception as e:
    print('Error fetching index:', e)
    sys.exit(1)
finally:
    httpd.shutdown()
    print('Server shutdown')
