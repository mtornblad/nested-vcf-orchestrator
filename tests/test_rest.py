"""Exercise actual HTTP/TLS and SOCKS5 sockets without an external service."""
import base64
from contextlib import contextmanager, redirect_stdout
import http.server
import importlib.util
import io
import json
from pathlib import Path
import select
import socket
import socketserver
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


rest = module('rest_handler', ROOT / 'src/lab/actions/rest/handler.py')
stager = module('rest_stager', ROOT / 'scripts/stage_rest_action.py')


class HTTP(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/slow':
            time.sleep(1.3)
        status = 404 if self.path == '/missing' else 302 if self.path == '/redirect' else 200
        if self.path == '/binary':
            payload = b'\xff\x00\x01' * 100
        else:
            payload = json.dumps({'path':self.path, 'authorization':self.headers.get('Authorization'),
                                 'nested':{'password':'do-not-log', 'token':'also-secret'},
                                 'body':self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8')}).encode()
        self.send_response(status)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('X-Value', 'first')
        self.send_header('X-Value', 'second')
        if status == 302:
            self.send_header('Location', 'http://must-not-be-followed.invalid/')
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    do_POST = do_GET


class TCPServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


class SOCKS(socketserver.BaseRequestHandler):
    def handle(self):
        incoming, outgoing = self.request, None
        incoming.settimeout(3)
        read = lambda n: rest.recv_exact(incoming, n)
        try:
            version, count = read(2)
            methods = read(count)
            self.server.seen.append({'version':version, 'methods':list(methods)})
            method = self.server.method
            incoming.sendall(bytes([5, method]))
            if method == 255 or method not in methods:
                return
            if method == 2:
                version = read(1)[0]
                user = read(read(1)[0]).decode()
                password = read(read(1)[0]).decode()
                self.server.seen[-1]['auth'] = (version,user,password)
                incoming.sendall(bytes([1, self.server.auth_status]))
                if self.server.auth_status:
                    return
            version, cmd, reserved, kind = read(4)
            address = read(read(1)[0]).decode() if kind == 3 else socket.inet_ntop(socket.AF_INET if kind == 1 else socket.AF_INET6, read(4 if kind == 1 else 16))
            port = struct.unpack('!H', read(2))[0]
            self.server.seen[-1].update(kind=kind, host=address, port=port, cmd=cmd, reserved=reserved)
            if self.server.reply:
                incoming.sendall(bytes([5,self.server.reply,0,1]) + b'\x00' * 6)
                return
            outgoing = socket.create_connection(('127.0.0.1', port), 3)
            incoming.sendall(b'\x05\x00\x00\x01' + b'\x00' * 6)
            while True:
                ready, _, _ = select.select([incoming,outgoing], [], [], 3)
                if not ready:
                    return
                for current in ready:
                    data = current.recv(65536)
                    if not data:
                        return
                    (outgoing if current is incoming else incoming).sendall(data)
        except (OSError, rest.RequestError):
            pass
        finally:
            if outgoing:
                outgoing.close()


@contextmanager
def running(server):
    thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval':0.02}, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


@contextmanager
def proxy(method=0, auth_status=0, reply=0):
    server = TCPServer(('127.0.0.1',0), SOCKS)
    server.method, server.auth_status, server.reply, server.seen = method, auth_status, reply, []
    with running(server):
        yield server


class RestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0), HTTP)
        cls.context = running(cls.server)
        cls.context.__enter__()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None,None,None)

    def request(self, path='/', **inputs):
        return rest.handler(None, {'url':self.url+path, 'logLevel':'none', **inputs})

    def test_direct_json_and_query_and_repeated_headers(self):
        result = self.request('/?q=one')
        self.assertTrue(result['ok'])
        self.assertEqual(0,result['exitCode'])
        self.assertEqual('/?q=one',json.loads(result['jsonBody'])['path'])
        self.assertEqual(['first','second'],json.loads(result['responseHeaders'])['x-value'])

    def test_http_failure_and_expected_status_override(self):
        result = self.request('/missing')
        self.assertEqual((22,404), (result['exitCode'],result['statusCode']))
        self.assertTrue(self.request('/missing',expectedStatusCodes='200-299,404')['ok'])

    def test_socks5h_resolves_at_proxy(self):
        with proxy() as p:
            result = self.request(url='http://private-lab.invalid:'+str(self.server.server_port)+'/?x=1', proxyUrl='socks5h://127.0.0.1:'+str(p.server_address[1]))
            self.assertTrue(result['ok'], result)
            self.assertEqual((3,'private-lab.invalid'), (p.seen[0]['kind'],p.seen[0]['host']))

    def test_socks5_resolves_locally(self):
        with proxy() as p:
            result = self.request(url='http://localhost:'+str(self.server.server_port), proxyUrl='socks5://127.0.0.1:'+str(p.server_address[1]))
            self.assertTrue(result['ok'],result)
            self.assertIn(p.seen[0]['kind'],(1,4))

    def test_proxy_authentication_and_no_downgrade(self):
        for method, status, expected in ((2,0,0),(2,1,67),(0,0,67)):
            with self.subTest(method=method,status=status), proxy(method, status) as p:
                result = self.request(proxyUrl='socks5h://127.0.0.1:'+str(p.server_address[1]),proxyUsername='user',proxyPassword='synthetic-secret')
                self.assertEqual(expected,result['exitCode'])
                self.assertEqual([2],p.seen[0]['methods'])
                if method == 2:
                    self.assertEqual((1,'user','synthetic-secret'),p.seen[0]['auth'])

    def test_proxy_connect_failure(self):
        with proxy(reply=5) as p:
            self.assertEqual(97,self.request(proxyUrl='socks5h://127.0.0.1:'+str(p.server_address[1]))['exitCode'])

    def test_utf8_post_and_basic_auth(self):
        result = self.request(method='POST',body='{"name":"räksmörgås"}',username='lab',password='test')
        payload = json.loads(result['jsonBody'])
        self.assertEqual('{"name":"räksmörgås"}',payload['body'])
        self.assertEqual('Basic '+base64.b64encode(b'lab:test').decode(),payload['authorization'])

    def test_binary_response_and_limit(self):
        result = self.request('/binary', maxResponseBytes=7)
        self.assertEqual((63,7,True), (result['exitCode'],result['responseBytes'],result['bodyTruncated']))
        self.assertEqual((b'\xff\x00\x01'*3)[:7],base64.b64decode(result['responseBase64']))
        self.assertFalse(result['isJson'])

    def test_redirect_is_not_followed(self):
        self.assertEqual((302,22), tuple(self.request('/redirect')[key] for key in ('statusCode','exitCode')))

    def test_summary_omits_secrets_and_query(self):
        output = io.StringIO()
        with redirect_stdout(output):
            result = self.request('/?key=do-not-log', bearerToken='also-secret',logLevel='summary')
        self.assertTrue(result['ok'])
        for secret in ('do-not-log','also-secret','Authorization','responseBody'):
            self.assertNotIn(secret,output.getvalue())
        self.assertIn('statusCode',output.getvalue())

    def test_json_body_logging_redacts_sensitive_keys(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.request(logLevel='body')
        self.assertIn('<redacted>',output.getvalue())
        self.assertNotIn('do-not-log',output.getvalue())

    def test_invalid_requests_do_not_connect(self):
        with patch.object(rest.socket,'create_connection') as connect:
            for bad in ({'url':'http://user:pass@localhost/'}, {'headersJson':'{"X":"a\\r\\nb"}'}, {'headersJson':'{"X":"a","x":"b"}'},
                        {'username':'lab','bearerToken':'token'}, {'proxyPassword':'missing-user'}, {'timeoutSeconds':0}, {'method':'CONNECT'}):
                with self.subTest(bad=bad):
                    self.assertEqual(2,self.request(**bad)['exitCode'])
            connect.assert_not_called()

    def test_timeout_and_throw(self):
        self.assertEqual(28,self.request('/slow',timeoutSeconds=1)['exitCode'])
        with self.assertRaisesRegex(RuntimeError,'exitCode=22'):
            self.request('/missing',throwOnError=True)

    def test_https_through_socks_with_ca_and_insecure(self):
        with tempfile.TemporaryDirectory() as directory:
            cert, key = Path(directory)/'cert.pem', Path(directory)/'key.pem'
            subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=private-lab.invalid','-addext','subjectAltName=DNS:private-lab.invalid','-keyout',str(key),'-out',str(cert)], check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
            server = http.server.ThreadingHTTPServer(('127.0.0.1',0), HTTP)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(cert,key)
            server.socket = ctx.wrap_socket(server.socket,server_side=True)
            with running(server), proxy() as p:
                arguments = {'url':'https://private-lab.invalid:'+str(server.server_port), 'proxyUrl':'socks5h://127.0.0.1:'+str(p.server_address[1])}
                self.assertEqual(60,self.request(**arguments)['exitCode'])
                self.assertTrue(self.request(**arguments,caCertificate=cert.read_text())['ok'])
                self.assertTrue(self.request(**arguments,insecure=True)['ok'])

    def test_native_package_metadata_and_python_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            path = stager.stage(Path(directory))
            action = ET.parse(path/'request.xml').getroot()
            self.assertEqual('Properties',action.get('result-type'))
            self.assertEqual('python:3.10',action.findtext('runtime'))
            self.assertEqual('SecureString',action.find("param[@n='proxyPassword']").get('t'))
            info = ET.parse(path/'request.element_info.xml').getroot()
            self.assertEqual('se.advania.rest',info.find("entry[@key='categoryPath']").text)
            with zipfile.ZipFile(path/'request.bundle.zip') as bundle:
                self.assertEqual(['handler.py'],bundle.namelist())
                self.assertEqual((ROOT/'src/lab/actions/rest/handler.py').read_bytes(),bundle.read('handler.py'))


if __name__ == '__main__':
    unittest.main()
