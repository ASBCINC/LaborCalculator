#!/usr/bin/env python3
"""Sync D-Tools Cloud opportunities into the LaborCalculator Firestore.

Runs on a GitHub Actions cron. Needs one secret: DTS_API_KEY.
Firestore access goes through scripts/fs.py (service account from FIREBASE_SA, else the web API key).
Only opportunities that changed are rewritten; config/sync records each run.
Docs: one Firestore doc per opportunity, id = D-Tools opportunity id,
fields: name, clientName, owner (normalized to rep name when it matches),
stage, stageGroup, total, price, modifiedDate, isArchived, updatedAt.
Docs that no longer exist in D-Tools (or are archived) are removed.
"""
import json, os, sys, datetime, urllib.request, urllib.parse, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import fs  # Firestore helper (service-account auth when FIREBASE_SA is set)

API_KEY = os.environ['DTS_API_KEY']
BASE = 'https://dtcloudapi.d-tools.cloud/api/v1'
# Public Basic Authorization header documented in the D-Tools Cloud API docs.
AUTH_BASIC = 'Basic RFRDbG91ZEFQSVVzZXI6MyNRdVkrMkR1QCV3Kk15JTU8Yi1aZzlV'
# Canonical rep names exactly as they appear in the app dropdown.
REPS = ['Tom Virasak', 'Timothy Parks', 'Brian Chan', 'Matthew Stachnik', 'Oum Sayarad',
        'Jonathan Model', 'Gabriel Clark', 'Josh Silva', 'Noel Salinas', 'Troy Ikeda',
        'Kwamé Yeboah', 'Miguel Sandoval', 'Nawel Girma', 'Stefn Sandberg', 'Enid Shor']
LOWER = {r.lower(): r for r in REPS}


def _fold_name(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return ' '.join(s.lower().split())


# Fold D-Tools owner names onto the app's rep list: accent- and case-insensitive,
# plus known spelling variants (accent-insensitive "Kwame Yeboah" is "Kwamé Yeboah",
# "Tim Parks" is "Timothy Parks").
_OWNER_FOLD = {_fold_name(r): r for r in REPS}
_OWNER_FOLD[_fold_name('tim parks')] = 'Timothy Parks'

def http(url, method='GET', headers=None, data=None):
    req = urllib.request.Request(url, method=method, headers=headers or {},
                                 data=data.encode() if data else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode()
        return json.loads(body) if body else {}

def firestore_value(v):
    if v is None or v == '': return {'nullValue': None}
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, float): return {'doubleValue': v}
    return {'stringValue': str(v)}

def fs_doc_id(name):
    return name.rsplit('/', 1)[-1]

def main():
    headers = {'X-API-Key': API_KEY, 'Authorization': AUTH_BASIC, 'Accept': 'application/json'}
    opps, page = [], 1
    while True:
        q = urllib.parse.urlencode({'page': page, 'pageSize': 200})
        res = http(f'{BASE}/Opportunities/GetOpportunities?{q}', headers=headers)
        batch = res.get('opportunities', [])
        opps.extend(batch)
        total = res.get('totalOpportunities', 0)
        if not batch or len(opps) >= total or page > 50:
            break
        page += 1

    keep = {}
    for o in opps:
        if o.get('isArchived'):
            continue
        owner = o.get('owner') or ''
        owner = _OWNER_FOLD.get(_fold_name(owner), owner.strip())
        keep[o['id']] = {
            'name': o.get('name'), 'number': o.get('number'), 'clientName': o.get('clientName'),
            'owner': owner, 'stage': o.get('stage'), 'stageGroup': o.get('stageGroup'),
            'priority': o.get('priority'), 'price': o.get('price'), 'total': o.get('total'),
            'estimatedCloseDate': o.get('estimatedCloseDate'),
            'modifiedDate': o.get('modifiedDate'), 'createdDate': o.get('createdDate'),
        }

    # Current Firestore docs: write only the ones that changed (fewer writes, same result).
    existing = {fs.doc_id(d): fs.fields(d) for d in fs.list_docs('opportunities')}
    now = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    norm = lambda v: None if v == '' else v
    changed = deleted = 0
    for oid, f in keep.items():
        cur = existing.get(oid)
        if cur is not None and all(norm(cur.get(k)) == norm(v) for k, v in f.items()):
            continue
        body = {'fields': {k: fs.typed(v) for k, v in f.items()}}
        body['fields']['updatedAt'] = {'timestampValue': now}
        fs.call('opportunities/' + urllib.parse.quote(oid), method='PATCH', body=body)
        changed += 1
    for oid in existing:
        if oid not in keep:
            try:
                fs.call('opportunities/' + urllib.parse.quote(oid), method='DELETE'); deleted += 1
            except Exception:
                pass
    # One small status doc the app reads for its "D-Tools synced X min ago" stamp.
    fs.call('config/sync', method='PATCH', body={'fields': {
        'lastRun': {'timestampValue': now}, 'total': fs.typed(len(keep)),
        'changed': fs.typed(changed), 'deleted': fs.typed(deleted)}})
    print(f'::notice::D-Tools sync: {len(keep)} open opportunities, {changed} changed, {deleted} removed')

    owners = sorted({f['owner'] for f in keep.values() if f['owner']})
    unmatched = sorted({f['owner'] for f in keep.values() if f['owner'] not in REPS})
    print('owners:', ', '.join(owners) if owners else '(none)')
    if unmatched:
        print('UNMATCHED owners (not in rep list):', ', '.join(unmatched))

if __name__ == '__main__':
    main()
