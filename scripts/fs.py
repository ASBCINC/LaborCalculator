"""Tiny Firestore REST helper shared by the GitHub Actions scripts.

Auth: if the FIREBASE_SA secret (service-account JSON) is set, every call uses an
OAuth token for that account (works after the database is locked to signed-in users).
Otherwise it falls back to the public web API key (only works while rules are open).
"""
import json, os, time, urllib.request, urllib.parse, urllib.error

PROJECT = 'asbc-calculator'
ROOT = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
WEB_KEY = os.environ.get('FIREBASE_API_KEY', 'AIzaSyCSf560VkBf2esIH5rC-_Vcx349o7iIC-0')
_token = None

def _auth():
    global _token
    sa = os.environ.get('FIREBASE_SA', '').strip()
    if not sa:
        return {}, {'key': WEB_KEY}
    if _token is None:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        cred = service_account.Credentials.from_service_account_info(
            json.loads(sa), scopes=['https://www.googleapis.com/auth/datastore'])
        cred.refresh(Request())
        _token = cred.token
    return {'Authorization': f'Bearer {_token}'}, {}

def call(path, method='GET', body=None, params=None):
    headers, extra = _auth()
    q = urllib.parse.urlencode({**(params or {}), **extra}, doseq=True)
    url = f'{ROOT}/{path}' + (f'?{q}' if q else '')
    data = json.dumps(body).encode() if body is not None else None
    if data: headers['Content-Type'] = 'application/json'
    for attempt in (1, 2):
        req = urllib.request.Request(url, method=method, headers=headers, data=data)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:400]
            # 429 = quota/rate limit; 5xx = brief Google-side error: wait and try once more
            if attempt == 1 and e.code in (429, 500, 502, 503, 504):
                time.sleep(5); continue
            raise FirestoreError(e.code, method, path, detail) from None
        except urllib.error.URLError as e:
            if attempt == 1:
                time.sleep(5); continue
            raise FirestoreError(0, method, path, str(e.reason)) from None

class FirestoreError(Exception):
    """A Firestore REST call failed after a retry. .code is the HTTP status (429 = daily quota / rate limit)."""
    def __init__(self, code, method, path, detail):
        self.code, self.method, self.path, self.detail = code, method, path, detail
        super().__init__(f'Firestore {method} {path.split("?")[0]} failed: HTTP {code} {detail}')

def list_docs(collection):
    docs, tok = [], None
    while True:
        p = {'pageSize': 300}
        if tok: p['pageToken'] = tok
        res = call(collection, params=p)
        docs += res.get('documents', [])
        tok = res.get('nextPageToken')
        if not tok: return docs

def doc_id(d): return d['name'].rsplit('/', 1)[-1]

def plain(v):
    """Firestore typed value -> plain JSON (ints stay ints, decimals stay floats)."""
    if 'mapValue' in v: return {k: plain(x) for k, x in v['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in v: return [plain(x) for x in v['arrayValue'].get('values', [])]
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    for k in ('stringValue', 'timestampValue', 'referenceValue'):
        if k in v: return v[k]
    return v

def fields(d): return {k: plain(x) for k, x in d.get('fields', {}).items()}

def typed(v):
    if v is None or v == '': return {'nullValue': None}
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, float): return {'doubleValue': v}
    return {'stringValue': str(v)}
