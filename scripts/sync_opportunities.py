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
    # Paging: the first sync only ever saw the first 200 (page 2 came back identical), so
    # page 2+ tries the common parameter names and keeps whichever one returns NEW records.
    def fetch(params):
        res = http(f'{BASE}/Opportunities/GetOpportunities?' + urllib.parse.urlencode(params), headers=headers)
        if isinstance(res, list): return res, 0, 'list'
        tot = next((res[k] for k in ('totalOpportunities', 'totalCount', 'total', 'totalRecords', 'count') if isinstance(res.get(k), int)), 0)
        return res.get('opportunities') or res.get('items') or res.get('data') or [], tot, ','.join(sorted(res.keys()))
    SIZE = 200
    first, total, keys = fetch({'page': 1, 'pageSize': SIZE})
    byid = {o['id']: o for o in first}
    style = None
    for page in range(2, 60):
        if total and len(byid) >= total: break
        if len(first) < SIZE and not style: break  # everything fit on one page
        tries = [style] if style else ['page', 'pageNumber', 'pageIndex', 'skip']
        got_new = False
        for st in tries:
            p = {'pageSize': SIZE, 'take': SIZE}
            if st == 'pageIndex': p['pageIndex'] = page - 1
            elif st == 'skip': p['skip'] = (page - 1) * SIZE
            else: p[st] = page
            batch, _, _ = fetch(p)
            new_ids = [o for o in batch if o['id'] not in byid]
            if new_ids:
                for o in batch: byid[o['id']] = o
                style, got_new = st, True
                break
        if not got_new: break
    opps = list(byid.values())
    msg = f'D-Tools returned {len(opps)} opportunities (reported total {total or "n/a"}; paging: {style or "none worked"}; response fields: {keys})'
    print(('::warning::' if (total and len(opps) < total) or (len(opps) % SIZE == 0 and not style) else '::notice::') + msg)

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

    # v8.14.0: quotes whose D-Tools opportunity is Won move to status "won" (only from draft / no status).
    won_ids = {o['id'] for o in opps if str(o.get('systemState', '')).lower() == 'won' or 'won' in str(o.get('stage', '')).lower()}
    marked = 0
    if won_ids:
        for d in fs.list_docs('quotes'):
            f = fs.fields(d)
            opp = (f.get('project') or {}).get('dtoolsOpportunityId')
            if opp in won_ids and (f.get('status') in (None, '', 'draft')) and not f.get('isTemplate'):
                fs.call('quotes/' + urllib.parse.quote(fs.doc_id(d)), method='PATCH', body={'fields': {'status': fs.typed('won')}},
                        params={'updateMask.fieldPaths': 'status'})
                marked += 1
    print(f'::notice::Quotes marked Won from D-Tools: {marked} (won opportunities seen: {len(won_ids)})')

    # v8.15.0: D-Tools project -> Jobs. For quotes that are Won/Scheduled and linked to an opportunity, read the
    # D-Tools project (same id). Techs listed as project resources are ADDED to the job (never removed); project
    # start/end dates fill the job dates only if none are set; D-Tools stage Scheduled/In Progress + techs => "scheduled".
    try:
        users = fs.fields(fs.call('config/users')).get('users') or {}
    except Exception:
        users = {}
    tech_by_name = {_fold_name(u.get('name', '')): e for e, u in users.items() if (u or {}).get('role') == 'tech'}
    linked = 0
    def get_project(pid):
        for key in ('id', 'projectId'):
            try:
                r = http(f'{BASE}/Projects/GetProject?' + urllib.parse.urlencode({key: pid}), headers=headers)
                if isinstance(r, dict) and (r.get('id') or r.get('resources') is not None or r.get('project')):
                    return r.get('project') if isinstance(r.get('project'), dict) else r
            except Exception:
                continue
        return None
    def day(v):
        return str(v)[:10] if v else None
    if tech_by_name:
        for d in fs.list_docs('quotes'):
            f = fs.fields(d)
            st = f.get('status') or 'draft'
            pid = (f.get('project') or {}).get('dtoolsOpportunityId')
            if not pid or f.get('isTemplate') or st not in ('won', 'scheduled'):
                continue
            proj = get_project(pid)
            if not proj:
                continue
            res = [_fold_name((r or {}).get('name') or ((r or {}).get('firstName', '') + ' ' + (r or {}).get('lastName', ''))) for r in (proj.get('resources') or [])]
            found = [tech_by_name[n] for n in res if n in tech_by_name]
            sched = f.get('schedule') or {}
            techs = list(sched.get('techs') or [])
            new_techs = [t for t in found if t not in techs]
            dates = list(sched.get('dates') or [])
            new_dates = []
            if not dates:
                a_, b_ = day(proj.get('startDate')), day(proj.get('endDate'))
                if a_:
                    d0 = datetime.date.fromisoformat(a_); d1 = datetime.date.fromisoformat(b_) if b_ else d0
                    while d0 <= d1 and len(new_dates) < 14:
                        new_dates.append(d0.isoformat()); d0 += datetime.timedelta(days=1)
            stage = str(proj.get('stage') or '').lower()
            new_status = 'scheduled' if (st == 'won' and (techs or new_techs) and ('scheduled' in stage or 'progress' in stage)) else st
            if not new_techs and not new_dates and new_status == st:
                continue
            body = {'status': fs.typed(new_status), 'schedule': {'mapValue': {'fields': {
                'techs': {'arrayValue': {'values': [fs.typed(t) for t in techs + new_techs]}},
                'dates': {'arrayValue': {'values': [fs.typed(x) for x in (dates or new_dates)]}},
                'fromDtools': fs.typed(True), 'dtoolsStage': fs.typed(proj.get('stage') or ''),
                'updatedAt': fs.typed(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')),
                'updatedBy': fs.typed('D-Tools sync')}}}}
            fs.call('quotes/' + urllib.parse.quote(fs.doc_id(d)), method='PATCH', body={'fields': body},
                    params={'updateMask.fieldPaths': ['status', 'schedule']})
            linked += 1
    print(f'::notice::Jobs updated from D-Tools projects: {linked}')

    # v8.20.0: job-report notifications. Recently submitted job reports go into ONE small doc,
    # reports/<REPORT_ID>-jobs, which Anthony's hourly Claude task reads to email the rep + Anthony once per submission.
    rid = os.environ.get('REPORT_ID', '').strip()
    if rid:
        try:
            ulist = fs.fields(fs.call('config/users')).get('users') or {}
        except Exception:
            ulist = {}
        email_of = {(u or {}).get('name'): e for e, u in ulist.items()}
        name_of = lambda e: (ulist.get(e) or {}).get('name', e)
        # only reports submitted after this feature went live (no emails about older test jobs)
        cutoff = max(datetime.datetime.utcnow() - datetime.timedelta(days=4), datetime.datetime(2026, 11, 17, 17, 10))
        pending = []
        def signoff_summary(q):  # v8.20.0 customer sign-off, without the signature image
            so, sk = q.get('signoff') or {}, (q.get('job') or {}).get('signoffSkip') or {}
            if so.get('status') == 'signed':
                a = so.get('answers') or {}
                return {'status': 'signed', 'name': so.get('name'), 'signedAt': so.get('signedAt'), 'concerns': bool(so.get('concerns')),
                        'satisfiedLookAndFeel': a.get('look'), 'satisfiedSoundVideo': a.get('av'), 'confidentOperating': a.get('confident'),
                        'anyIssues': a.get('issues'), 'issuesText': (so.get('issuesText') or '')[:300], 'comments': (so.get('comments') or '')[:300]}
            if sk.get('status'):
                return {'status': sk['status'], 'reason': (sk.get('reason') or '')[:200]}
            return {'status': 'none'}
        for d in fs.list_docs('quotes'):
            f = fs.fields(d); j = f.get('job') or {}
            if f.get('status') not in ('submitted', 'closed') or not j.get('submittedAt'):
                continue
            try:
                when = datetime.datetime.fromisoformat(str(j['submittedAt']).replace('Z', '+00:00')).replace(tzinfo=None)
            except Exception:
                continue
            if when < cutoff:
                continue
            proj = f.get('project') or {}; qid = fs.doc_id(d); rec = j.get('recap') or {}
            pending.append({
                'key': qid + '@' + str(j['submittedAt']), 'job': f.get('label') or proj.get('customerName'),
                'client': proj.get('dtoolsClientName') or '', 'dtools': proj.get('dtoolsOppNumber') or '', 'dtoolsId': proj.get('dtoolsOpportunityId') or '', 'dates': (f.get('schedule') or {}).get('dates') or [],
                'rep': proj.get('salesManagerName') or '', 'repEmail': email_of.get(proj.get('salesManagerName')) or '',
                'jobStatus': j.get('jobStatus') or '', 'submittedAt': j['submittedAt'], 'submittedBy': name_of(j.get('submittedBy') or ''),
                'techs': [name_of(t) for t in ((f.get('schedule') or {}).get('techs') or [])],
                'timeOnSiteHours': round(sum(float(r.get('hours') or 0) for r in (j.get('log') or [])), 2),
                'extraWork': [{'desc': (x.get('desc') or '')[:160], 'hours': x.get('hours')} for x in (j.get('extras') or []) if x.get('desc') or x.get('hours')],
                'work': (rec.get('work') or '')[:500], 'issues': (rec.get('issues') or '')[:300],
                'followups': (rec.get('followups') or '')[:300], 'clientFeedback': (rec.get('client') or '')[:300],
                'signoff': signoff_summary(f),
                'link': 'https://asbcinc.github.io/LaborCalculator/jobs.html?quote=' + urllib.parse.quote(qid),
            })
        # Written as field `jobs` on the weekly report doc (only that field), so one URL serves both readers.
        fs.call('reports/' + rid, method='PATCH', params={'updateMask.fieldPaths': 'jobs'}, body={'fields': {
            'jobs': {'stringValue': json.dumps({'generatedAt': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'submissions': pending}, ensure_ascii=False)}}})
        print(f'::notice::Job-report notifications listed: {len(pending)}')

    owners = sorted({f['owner'] for f in keep.values() if f['owner']})
    unmatched = sorted({f['owner'] for f in keep.values() if f['owner'] not in REPS})
    print('owners:', ', '.join(owners) if owners else '(none)')
    if unmatched:
        print('UNMATCHED owners (not in rep list):', ', '.join(unmatched))

if __name__ == '__main__':
    main()
