"""HTTP(S) action with per-request SOCKS5 transport and structured vRO output.

Python standard library only. Never changes process-wide proxy settings.
SOCKS CONNECT: RFC 1928; username/password negotiation: RFC 1929.
"""
import base64
import http.client
import ipaddress
import json
import re
import socket
import ssl
import struct
import time
import uuid
from urllib.parse import urlsplit


class RequestError(Exception):
    def __init__(self, code, kind, message):
        super().__init__(message)
        self.code, self.kind = code, kind


def invalid(message):
    raise RequestError(2, 'input', message)


def string(inputs, key, default=''):
    value = inputs.get(key)
    if value is None:
        return default
    if not isinstance(value, str):
        invalid(key + ' must be a string')
    return value


def integer(inputs, key, default, minimum, maximum):
    value = inputs.get(key)
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum or int(value) != value:
        invalid(key + ' must be an integer between ' + str(minimum) + ' and ' + str(maximum))
    return int(value)


def boolean(inputs, key):
    value = inputs.get(key)
    if value is None:
        return False
    if not isinstance(value, bool):
        invalid(key + ' must be a boolean')
    return value


def parse_url(value, schemes):
    try:
        url = urlsplit(value)
        if not url.hostname or url.scheme not in schemes or url.username is not None or url.password is not None or url.fragment or re.search(r'[\s\x00-\x1f\x7f]', value):
            invalid('URL must use an allowed scheme, a host and no embedded credentials, whitespace or fragment')
        if url.port is not None and not 1 <= url.port <= 65535:
            invalid('URL port is out of range')
        url.hostname.encode('idna')
        return url
    except ValueError:
        invalid('URL is malformed')


def recv_exact(sock, count):
    parts = []
    while count:
        data = sock.recv(count)
        if not data:
            raise RequestError(97, 'proxy', 'SOCKS proxy closed the connection during negotiation')
        parts.append(data)
        count -= len(data)
    return b''.join(parts)


def connect(host, port, timeout, proxy, proxy_user, proxy_password):
    if proxy is None:
        return socket.create_connection((host, port), timeout)
    try:
        sock = socket.create_connection((proxy.hostname, proxy.port or 1080), timeout)
    except socket.gaierror as error:
        raise RequestError(5, 'proxy_dns', 'Could not resolve the SOCKS proxy') from error
    try:
        # Offer only the selected method: authenticated requests cannot downgrade.
        method = 2 if proxy_user else 0
        sock.sendall(bytes([5, 1, method]))
        reply = recv_exact(sock, 2)
        if reply != bytes([5, method]):
            raise RequestError(67 if method == 2 or reply[1] == 255 else 97, 'proxy_auth', 'SOCKS proxy did not accept the requested authentication method')
        if method == 2:
            user, password = proxy_user.encode('utf-8'), proxy_password.encode('utf-8')
            sock.sendall(bytes([1, len(user)]) + user + bytes([len(password)]) + password)
            if recv_exact(sock, 2) != b'\x01\x00':
                raise RequestError(67, 'proxy_auth', 'SOCKS authentication failed')
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if proxy.scheme == 'socks5h':
                encoded = host.encode('idna')
                if not 1 <= len(encoded) <= 255:
                    invalid('Target DNS name is too long for SOCKS5')
                destination = bytes([3, len(encoded)]) + encoded
            else:
                info = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)[0]
                address = ipaddress.ip_address(info[4][0])
                destination = bytes([1 if address.version == 4 else 4]) + address.packed
        else:
            destination = bytes([1 if address.version == 4 else 4]) + address.packed
        sock.sendall(b'\x05\x01\x00' + destination + struct.pack('!H', port))
        reply = recv_exact(sock, 4)
        if reply[0] != 5 or reply[2] != 0:
            raise RequestError(97, 'proxy', 'Invalid SOCKS reply')
        if reply[1] != 0:
            raise RequestError(97, 'proxy', 'SOCKS CONNECT failed (reply ' + str(reply[1]) + ')')
        length = {1: 4, 4: 16}.get(reply[3])
        if reply[3] == 3:
            length = recv_exact(sock, 1)[0]
        if not length:
            raise RequestError(97, 'proxy', 'Invalid SOCKS bind address')
        recv_exact(sock, length + 2)
        return sock
    except BaseException:
        sock.close()
        raise


def status_codes(value):
    result = set()
    for item in (value or '200-299').split(','):
        match = re.fullmatch(r'\s*([1-5][0-9]{2})(?:-([1-5][0-9]{2}))?\s*', item)
        if not match:
            invalid('expectedStatusCodes must contain HTTP status codes or ranges, e.g. 200-299,404')
        start, end = int(match[1]), int(match[2] or match[1])
        if start > end:
            invalid('expectedStatusCodes range is reversed')
        result.update(range(start, end + 1))
    return result


def headers_for(inputs):
    try:
        values = json.loads(string(inputs, 'headersJson') or '{}', object_pairs_hook=lambda pairs: pairs)
    except ValueError:
        invalid('headersJson must be a JSON object of string values')
    # The pairs hook preserves duplicate keys so they cannot silently override.
    if not (string(inputs, 'headersJson') or '{}').lstrip().startswith('{') or not isinstance(values, list):
        invalid('headersJson must be a JSON object')
    headers, seen = {}, set()
    for key, value in values:
        if not isinstance(key, str) or not isinstance(value, str) or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", key) or re.search(r'[\x00-\x1f\x7f]', value):
            invalid('Headers must have valid names and single-line string values')
        lower = key.lower()
        if lower in seen or lower in {'host','connection','content-length','transfer-encoding','proxy-authorization','proxy-connection','accept-encoding'}:
            invalid('Duplicate or transport-controlled header')
        try:
            value.encode('latin-1')
        except UnicodeEncodeError:
            invalid('HTTP header values must be Latin-1 encodable')
        headers[key] = value
        seen.add(lower)
    user, password, token = (string(inputs, name) for name in ('username','password','bearerToken'))
    if (user or password) and token or (user or password or token) and 'authorization' in seen:
        invalid('Choose only one HTTP authentication method')
    if password and not user or ':' in user:
        invalid('Basic authentication requires a username without a colon')
    if user:
        headers['Authorization'] = 'Basic ' + base64.b64encode((user + ':' + password).encode('utf-8')).decode('ascii')
    if token:
        if re.search(r'[\s\x00-\x1f\x7f]', token):
            invalid('Bearer token contains whitespace or control characters')
        headers['Authorization'] = 'Bearer ' + token
    headers['Accept-Encoding'] = 'identity'
    headers['Connection'] = 'close'
    return headers


def redact(value):
    if isinstance(value, dict):
        return {k: '<redacted>' if re.search(r'password|token|secret|key|authorization|cookie|credential', k, re.I) else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def handler(context, inputs):
    started = time.monotonic()
    result = {'requestId':str(uuid.uuid4()), 'ok':False, 'exitCode':0, 'statusCode':0,
              'reason':'', 'errorType':'', 'errorMessage':'', 'responseHeaders':'{}',
              'responseBody':'', 'responseBase64':'', 'jsonBody':'', 'isJson':False,
              'bodyTruncated':False, 'responseBytes':0, 'elapsedMs':0}
    connection, sock, log_level, throw, target_host, target_port, method = None, None, 'summary', False, '', 0, ''
    phase, parsed_json = 'connect', None
    try:
        if not isinstance(inputs, dict):
            invalid('Action inputs must be a mapping')
        log_level = string(inputs, 'logLevel', 'summary') or 'summary'
        if log_level not in ('none','summary','body'):
            invalid('logLevel must be none, summary or body')
        throw = boolean(inputs, 'throwOnError')
        target = parse_url(string(inputs, 'url'), ('http','https'))
        target_host = target.hostname.encode('idna').decode('ascii')
        target_port = target.port or (443 if target.scheme == 'https' else 80)
        method = (string(inputs, 'method') or 'GET').upper()
        if method not in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'):
            invalid('Unsupported REST method')
        timeout = integer(inputs, 'timeoutSeconds', 30, 1, 120)
        limit = integer(inputs, 'maxResponseBytes', 4 * 1024 * 1024, 1, 16 * 1024 * 1024)
        accepted = status_codes(string(inputs, 'expectedStatusCodes'))
        headers = headers_for(inputs)
        body = string(inputs, 'body').encode('utf-8') or None
        if body and 'content-type' not in {k.lower() for k in headers}:
            headers['Content-Type'] = 'application/json; charset=utf-8'
        proxy_url = string(inputs, 'proxyUrl')
        proxy = parse_url(proxy_url, ('socks5','socks5h')) if proxy_url else None
        user, password = string(inputs, 'proxyUsername'), string(inputs, 'proxyPassword')
        if proxy and (proxy.path not in ('','/') or proxy.query):
            invalid('Proxy URL must not have a path or query')
        if (user or password) and not proxy or bool(user) != bool(password):
            invalid('SOCKS authentication requires proxyUrl, proxyUsername and proxyPassword')
        if user and not all(1 <= len(value.encode('utf-8')) <= 255 for value in (user,password)):
            invalid('SOCKS credentials must be 1-255 UTF-8 bytes each')
        insecure, ca = boolean(inputs, 'insecure'), string(inputs, 'caCertificate')
        if insecure and ca:
            invalid('Choose certificate verification with caCertificate or insecure, not both')
        tls = ssl.create_default_context(cadata=ca or None)
        if insecure:
            tls.check_hostname = False
            tls.verify_mode = ssl.CERT_NONE
        sock = connect(target_host, target_port, timeout, proxy, user, password)
        if target.scheme == 'https':
            sock = tls.wrap_socket(sock, server_hostname=target_host)
        connection = http.client.HTTPConnection(target_host, target_port, timeout=timeout)
        connection.sock = sock
        phase = 'transport'
        path = (target.path or '/') + ('?' + target.query if target.query else '')
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result.update(statusCode=response.status, reason=response.reason)
        response_headers = {}
        for key, value in response.getheaders():
            response_headers.setdefault(key.lower(), []).append(value)
        result['responseHeaders'] = json.dumps(response_headers)
        data = response.read(limit + 1)
        result['bodyTruncated'] = len(data) > limit
        data = data[:limit]
        result['responseBytes'] = len(data)
        result['responseBase64'] = base64.b64encode(data).decode('ascii')
        charset = response.headers.get_content_charset() or 'utf-8'
        try:
            result['responseBody'] = data.decode(charset, errors='replace')
        except LookupError:
            result['responseBody'] = data.decode('utf-8', errors='replace')
        if not result['bodyTruncated']:
            try:
                parsed_json = json.loads(result['responseBody'])
                result.update(isJson=True, jsonBody=json.dumps(parsed_json, indent=2, ensure_ascii=False))
            except ValueError:
                pass
        if result['bodyTruncated']:
            raise RequestError(63, 'response_limit', 'Response exceeds maxResponseBytes; returned body is truncated')
        if response.status not in accepted:
            raise RequestError(22, 'http', 'HTTP status is outside expectedStatusCodes')
        result['ok'] = True
    except RequestError as error:
        result.update(exitCode=error.code, errorType=error.kind, errorMessage=str(error))
    except ssl.SSLCertVerificationError:
        result.update(exitCode=60, errorType='tls_certificate', errorMessage='TLS certificate verification failed')
    except ssl.SSLError:
        result.update(exitCode=35, errorType='tls', errorMessage='TLS setup or handshake failed')
    except (TimeoutError, socket.timeout):
        result.update(exitCode=28, errorType='timeout', errorMessage='Socket operation timed out')
    except socket.gaierror:
        result.update(exitCode=6, errorType='dns', errorMessage='Could not resolve target hostname')
    except (ValueError, TypeError, UnicodeError):
        result.update(exitCode=2, errorType='input', errorMessage='Malformed URL, header, body or certificate input')
    except (OSError, http.client.HTTPException):
        result.update(exitCode=7 if phase == 'connect' else 56, errorType=phase, errorMessage='Connection failed' if phase == 'connect' else 'HTTP transfer failed')
    finally:
        if connection is not None:
            connection.close()
        elif sock is not None:
            sock.close()
        result['elapsedMs'] = int((time.monotonic() - started) * 1000)
    if log_level != 'none':
        summary = {key:result[key] for key in ('requestId','ok','exitCode','statusCode','errorType','responseBytes','bodyTruncated','elapsedMs')}
        summary.update(host=target_host, port=target_port, method=method)
        print('REST ' + json.dumps(summary), flush=True)
        if log_level == 'body' and result['isJson']:
            print('REST JSON preview ' + json.dumps(redact(parsed_json), ensure_ascii=True)[:2048], flush=True)
    if throw and not result['ok']:
        raise RuntimeError('REST request ' + result['requestId'] + ' failed: exitCode=' + str(result['exitCode']) + ', statusCode=' + str(result['statusCode']) + ', type=' + result['errorType'])
    return result
