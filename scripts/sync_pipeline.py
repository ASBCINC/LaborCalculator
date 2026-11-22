#!/usr/bin/env python3
"""v8.28.0: admin pipeline data for pipeline.html.

Runs in the "Sync D-Tools opportunities" workflow right after sync_opportunities.py.
Reads D-Tools (projects where Anthony Ward is PM, their payments and change orders, and the open
opportunities he is a resource on) and writes ONE Firestore doc, pipeline/data, field `json`.
The Firestore rules let only admins read pipeline/**; only this service account writes it.

Each project / opportunity carries its own activity feed, built here from what changed since the
last run: stage changes, contract value changes, change orders created or changing state, payments
received, newly assigned work, and installer job reports (from jobs.json, written by the sync step
before this one). Detail calls (GetProject, GetChangeOrders, GetOpportunity) only happen for records
whose modifiedDate changed, so a quiet run costs one D-Tools list call per type and one Firestore read.
"""
import json, os, sys, time, datetime, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import fs

PM = 'Anthony Ward'
API_KEY = os.environ['DTS_API_KEY']
BASE = 'https://dtcloudapi.d-tools.cloud/api/v1'
AUTH_BASIC = 'Basic RFRDbG91ZEFQSVVzZXI6MyNRdVkrMkR1QCV3Kk15JTU8Yi1aZzlV'  # public header from the D-Tools API docs
HEADERS = {'X-API-Key': API_KEY, 'Authorization': AUTH_BASIC, 'Accept': 'application/json'}
FEED_MAX, OPP_DETAIL_CAP = 30, 150
NOW = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
calls = 0

def api(path, params):
    global calls
    calls += 1
    time.sleep(0.55)  # D-Tools allows 120 calls/minute, shared by every integration
    url = f'{BASE}/{path}?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode()
        return json.loads(body) if body else {}

def utc(s):
    """D-Tools dates come without a zone and are UTC."""
    if not s: return None
    s = str(s)
    return s if s.endswith('Z') or '+' in s[10:] else s.split('.')[0] + 'Z'

def money(v):
    try: return round(float(v or 0), 2)
    except Exception: return 0.0

def push(rec, kind, text, link=None):
    ev = {'at': NOW, 'kind': kind, 'text': text[:240]}
    if link: ev['link'] = link
    rec.setdefault('feed', []).append(ev)
    rec['feed'] = rec['feed'][-FEED_MAX:]

def load_prev():
    try:
        d = fs.call('pipeline/data')
        return json.loads(fs.plain(d['fields']['json'])) if d.get('fields', {}).get('json') else {}
    except fs.FirestoreError as e:
        if e.code == 404: return {}
        raise

def main():
    prev = load_prev()
    first = not prev
    seed = json.load(open(os.path.join(os.path.dirname(__file__), 'dtools_links.json')))
    tenant = seed.get('tenant')
    link_of = lambda num: f'https://d-tools.cloud/?payload=null&tenantId={tenant}&RedirectToEntity=Project&RedirectToId={num}' if num else 'https://d-tools.cloud/'

    # ---------- projects (Anthony is the PM) ----------
    res = api('Projects/GetProjects', {'projectManagers': PM, 'includeArchived': 'false', 'page': 1, 'pageSize': 100})
    lite = res.get('projects') or []
    pprev = prev.get('projects') or {}
    projects = {}
    for p in lite:
        pid, old = p['id'], pprev.get(p['id']) or {}
        rec = dict(old)
        s = (seed['projects'].get(p.get('name')) or {})
        rec.update({'id': pid, 'name': p.get('name'), 'number': p.get('number'), 'client': p.get('clientName'),
                    'stage': p.get('stage'), 'stageGroup': p.get('stageGroup'), 'priority': p.get('priority'),
                    'price': money(p.get('price')), 'modified': utc(p.get('modifiedDate')), 'created': utc(p.get('createdDate')),
                    'num': rec.get('num') or s.get('num')})
        rec['url'] = link_of(rec.get('num'))
        if not old:
            rec['stageAt'] = s.get('stageAt') or utc(p.get('modifiedDate'))
            if not first: push(rec, 'new', f"Project assigned to you ({p.get('stage')})", rec['url'])
        else:
            if old.get('stage') != p.get('stage'):
                rec['stageAt'] = NOW
                push(rec, 'stage', f"Stage: {old.get('stage') or '—'} → {p.get('stage')}")
            if old.get('price') is not None and abs(money(old.get('price')) - rec['price']) >= 0.01:
                push(rec, 'value', f"Contract value ${old['price']:,.2f} → ${rec['price']:,.2f}")
        if not old or old.get('modified') != rec['modified'] or not old.get('detailAt'):
            try:
                d = api('Projects/GetProject', {'id': pid})
                rec.update({'rep': d.get('salesperson'), 'start': utc(d.get('startDate')), 'end': utc(d.get('endDate')),
                            'won': utc(d.get('opportunityWonDate'))})
                pays = [{'name': x.get('name') or 'Payment', 'amount': money(x.get('totalAmount') or x.get('amount')),
                         'paid': money(x.get('paidAmount')), 'status': x.get('status') or '', 'due': utc(x.get('dueDate')),
                         'paidDate': utc(x.get('paidDate'))} for x in (d.get('payments') or [])]
                oldpaid = {x['name']: x.get('paid', 0) for x in (old.get('payments') or [])}
                if old:
                    for x in pays:
                        gain = x['paid'] - oldpaid.get(x['name'], 0)
                        if gain >= 0.01: push(rec, 'payment', f"Payment received: {x['name']} ${gain:,.2f}")
                rec['payments'] = pays
                rec['paid'] = round(sum(x['paid'] for x in pays), 2)
                cos = api('ChangeOrders/GetChangeOrders', {'projectId': pid})
                cos = cos if isinstance(cos, list) else (cos.get('changeOrders') or [])
                cos = [{'id': c.get('id'), 'number': f"CO-{c.get('number')}" if c.get('number') is not None else (c.get('number2') or 'CO'),
                        'name': c.get('name') or '', 'state': c.get('state') or c.get('systemState') or '', 'price': money(c.get('price'))} for c in cos]
                oldco = {c['id']: c.get('state') for c in (old.get('cos') or [])}
                if old:
                    for c in cos:
                        if c['id'] not in oldco: push(rec, 'co', f"Change order {c['number']} created: {c['name']} (${c['price']:,.2f}, {c['state']})")
                        elif oldco[c['id']] != c['state']: push(rec, 'co', f"Change order {c['number']} {c['name']}: {oldco[c['id']]} → {c['state']}")
                rec['cos'] = cos
                rec['detailAt'] = NOW
            except Exception as e:
                print(f'::warning::project detail {p.get("name")}: {e}')
        projects[pid] = rec

    # ---------- opportunities Anthony is a resource on ----------
    oprev, checked = prev.get('opps') or {}, dict(prev.get('oppChecked') or {})
    opps_all, page = [], 1
    while page < 40:
        r = api('Opportunities/GetOpportunities', {'includeArchived': 'false', 'page': page, 'pageSize': 200})
        batch = r if isinstance(r, list) else (r.get('opportunities') or [])
        new = [o for o in batch if o['id'] not in {x['id'] for x in opps_all}]
        opps_all += new
        if len(batch) < 200 or not new: break
        page += 1
    open_opps = [o for o in opps_all if not o.get('isArchived') and (o.get('systemState') or 'Open') in ('Open', 'On Hold', 'New')]
    opps, detail_calls = {}, 0
    for o in open_opps:
        oid, old, mod = o['id'], oprev.get(o['id']), utc(o.get('modifiedDate'))
        if checked.get(oid) == mod:
            if not old: continue
            mine = True; d = None
        else:
            if detail_calls >= OPP_DETAIL_CAP: 
                if old: opps[oid] = old
                continue
            detail_calls += 1
            try: d = api('Opportunities/GetOpportunity', {'id': oid})
            except Exception as e:
                print(f'::warning::opportunity {o.get("name")}: {e}'); continue
            names = {(x.get('name') or f"{x.get('firstName') or ''} {x.get('lastName') or ''}").strip().lower() for x in (d.get('resources') or [])}
            mine = PM.lower() in names
            checked[oid] = mod
            if not mine: continue
        rec = dict(old or {})
        src = d or o
        rec.update({'id': oid, 'name': o.get('name'), 'number': o.get('number'), 'client': o.get('clientName'),
                    'stage': o.get('stage'), 'stageGroup': o.get('stageGroup'), 'owner': o.get('owner'),
                    'total': money(o.get('total') or o.get('price')), 'probability': src.get('probability'),
                    'estClose': utc(src.get('estimatedCloseDate')), 'modified': mod})
        if not old:
            rec['stageAt'] = mod
            if not first: push(rec, 'new', f"Opportunity added with you as a resource ({o.get('stage')})")
        elif old.get('stage') != o.get('stage'):
            rec['stageAt'] = NOW
            push(rec, 'stage', f"Stage: {old.get('stage') or '—'} → {o.get('stage')}")
        opps[oid] = rec
    live = {o['id'] for o in open_opps}
    checked = {k: v for k, v in checked.items() if k in live}

    # ---------- installer job reports -> that project's feed ----------
    try:
        subs = json.load(open('jobs.json', encoding='utf-8')).get('submissions') or []
    except Exception:
        subs = []
    for sub in subs:
        rec = projects.get(sub.get('dtoolsId')) or opps.get(sub.get('dtoolsId'))
        if not rec: continue
        keys = rec.setdefault('jobKeys', [])
        if sub['key'] in keys: continue
        keys.append(sub['key']); rec['jobKeys'] = keys[-40:]
        work = (sub.get('work') or '').replace('\n', ' ').strip()
        push(rec, 'job', f"Job report ({sub.get('jobStatus') or 'no status'}) by {sub.get('submittedBy') or 'tech'}: {work[:140]}", sub.get('link'))

    data = {'projects': projects, 'opps': opps, 'oppChecked': checked}
    if json.dumps(data, sort_keys=True) == json.dumps({k: prev.get(k) for k in data}, sort_keys=True):
        print(f'::notice::Pipeline unchanged ({len(projects)} projects, {len(opps)} opportunities, {calls} D-Tools calls)'); return
    data['generatedAt'] = NOW
    fs.call('pipeline/data', method='PATCH', body={'fields': {'json': fs.typed(json.dumps(data, ensure_ascii=False)), 'updatedAt': {'timestampValue': NOW}}})
    print(f'::notice::Pipeline updated: {len(projects)} projects, {len(opps)} opportunities, {calls} D-Tools calls')

if __name__ == '__main__':
    try:
        main()
    except fs.FirestoreError as e:
        print(f'::warning::Pipeline sync skipped: {e}'); sys.exit(0 if e.code == 429 else 1)
