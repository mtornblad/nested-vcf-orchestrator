# REST requests through SOCKS5

`se.advania.rest.request` is a reusable vRO action for HTTP and HTTPS calls.
It supports direct connections, SOCKS5 with local target DNS, or SOCKS5h with
target DNS performed by the proxy. It returns a `Properties` result for the
workflow to inspect, including HTTP status, body, exit code and elapsed time.

The action lives in `src/lab/actions/rest` and is included in the ordinary vRO
package. It uses the Python 3.10 action runtime and standard library only;
no pip installation, curl binary or process-wide JVM proxy change is required.
The target Orchestrator must have the `python:3.10` action runtime available.
Existing imported REST actions are retained; workflows opt into this new
action explicitly through their canvas bindings.

## Inputs

| Input | Type | Default / behavior |
| --- | --- | --- |
| `url` | string | Required absolute HTTP(S) URL, without embedded credentials |
| `method` | string | `GET`; also POST, PUT, PATCH, DELETE, HEAD, OPTIONS |
| `headersJson` | string | JSON object of string header values, default `{}` |
| `body` | string | UTF-8 request body; default empty |
| `proxyUrl` | string | Empty for direct; `socks5://host:1080` or `socks5h://host:1080` |
| `proxyUsername` | string | Optional SOCKS username |
| `proxyPassword` | SecureString | Required together with proxyUsername |
| `username` | string | HTTP Basic username |
| `password` | SecureString | HTTP Basic password |
| `bearerToken` | SecureString | Alternative to Basic/custom Authorization header |
| `timeoutSeconds` | number | 30; integer 1–120, socket-operation timeout |
| `maxResponseBytes` | number | 4 MiB; integer 1 byte–16 MiB |
| `insecure` | boolean | false; true disables HTTPS certificate verification |
| `caCertificate` | string | Optional trusted CA certificate(s) in PEM format |
| `expectedStatusCodes` | string | `200-299`; comma-separated codes/ranges, e.g. `200-299,404` |
| `logLevel` | string | `summary`; alternatives `none`, `body` |
| `throwOnError` | boolean | false; true raises a sanitized error after logging |

Unbound optional inputs may be null and use defaults. Authentication methods
are mutually exclusive. Header names/values are checked and duplicate headers
rejected; transport headers such as Host and Content-Length are managed by the
action. Nonempty bodies default to `application/json; charset=utf-8`; supply a
Content-Type header for other content. Redirects and retries are not automatic.
Each call uses and closes its own socket.

`timeoutSeconds` is not a total wall-clock deadline: DNS and multiple socket
operations can extend the call. The action runtime has a separate 300-second
execution limit. A runtime termination cannot return a structured result.

## Workflow binding

Add **request** from module **se.advania.rest** as an action element in the
workflow canvas. Bind inputs and bind its result to a `Properties` variable
such as `restResult`. A following scriptable task can use:

```javascript
var status = restResult.get("statusCode");
var code = restResult.get("exitCode");
if (!restResult.get("ok")) {
    throw "REST request failed: HTTP=" + status + ", exitCode=" + code;
}
var data = restResult.get("isJson")
    ? JSON.parse(restResult.get("jsonBody"))
    : restResult.get("responseBody");
```

For a lab endpoint, bind values such as:

```text
url                  https://mtvcf-installer.dclab.se/v1/releases
method               GET
proxyUrl             socks5h://proxy-reachable-from-vro.example:1080
bearerToken          <bind the runtime token>
expectedStatusCodes  200
logLevel             summary
```

The proxy must be reachable **from the Python action runtime**, not just from
your laptop. An `ssh -D 1080` tunnel bound to your laptop's loopback is not
automatically available to vRO. Use an approved reachable proxy/tunnel endpoint
and select `socks5h` when only the proxy can resolve the private lab DNS names.
SOCKS username/password negotiation itself is unencrypted; an SSH tunnel can
protect that hop. HTTPS still verifies the destination certificate unless
`insecure` is explicitly enabled. Prefer `caCertificate` for a private CA.

## Result contract

| Field | Meaning |
| --- | --- |
| `requestId` | Correlates the returned result and log entry |
| `ok`, `exitCode` | Accepted HTTP response / action outcome |
| `statusCode`, `reason` | HTTP status; status is 0 when no response was received |
| `errorType`, `errorMessage` | Sanitized failure category/message |
| `responseHeaders` | JSON object; lowercase names map to arrays preserving repeated values |
| `responseBody` | Decoded text (replacement characters for undecodable bytes) |
| `responseBase64` | Exact returned bytes encoded as base64, also suitable for binary responses |
| `isJson`, `jsonBody` | Whether the complete body parsed as JSON, plus formatted JSON text |
| `bodyTruncated`, `responseBytes` | Whether the limit was exceeded and how many bytes were returned |
| `elapsedMs` | Elapsed action time in milliseconds |

A response exceeding the limit returns the first `maxResponseBytes` bytes with
exit code 63. Its JSON is not parsed. HTTP error responses still return their
body and headers. Returned content is deliberately not redacted; it may contain
tokens or cookies needed by the caller. Do not log the whole result blindly.

| Exit code | Meaning |
| --- | --- |
| 0 | HTTP status accepted |
| 2 | Invalid input |
| 5 / 6 | Proxy / target DNS resolution failed |
| 7 | TCP connection failed |
| 22 | HTTP status outside expectedStatusCodes |
| 28 | Socket-operation timeout |
| 35 / 60 | TLS setup/handshake / certificate verification failed |
| 56 | HTTP transport failed |
| 63 | Response exceeded size limit |
| 67 | SOCKS authentication or method selection failed |
| 97 | SOCKS protocol or CONNECT failure |

These are curl-like **action result codes**, not an operating-system process
exit status. The HTTP status is always a separate field.

## Logging and packaging

Summary logging includes correlation ID, method, host/port, status, error
category, byte count and elapsed time. It omits URL path/query, request headers,
credentials and response content. `body` adds a JSON preview capped at 2048
characters, recursively masking fields named for passwords, tokens, secrets,
keys, authorization, cookies or credentials. Other fields may still contain
sensitive values: use summary mode for authentication calls. Text/binary bodies
are not printed even in body mode.

`scripts/stage_rest_action.py` builds the native XML metadata and Python bundle
during Maven `prepare-package`, alongside the TypeScript and imported native
content. Version is read from `pom.xml`; action ID and module stay stable.
The layout follows Build Tools' [polyglot action packaging](https://github.com/vmware/build-tools-for-vmware-aria/blob/main/typescript/polyglotpkg/src/vro.ts).

```bash
make validate test-native
make package
make push PROFILE=lab
```

The offline tests use local HTTP, HTTPS and SOCKS5 servers, including proxy DNS,
authentication, certificate validation, timeouts, size limits and log behavior.
OpenSSL is required only to create temporary test certificates. No external
lab request is sent by these tests. A server import and a request through your
actual proxy remain the integration test.

Protocol references: [SOCKS5](https://www.rfc-editor.org/rfc/rfc1928),
[username/password negotiation](https://www.rfc-editor.org/rfc/rfc1929),
[Python HTTP client](https://docs.python.org/3.10/library/http.client.html).

[Component overview](../README.md) · [Imported workflows](custom-resources.md)
