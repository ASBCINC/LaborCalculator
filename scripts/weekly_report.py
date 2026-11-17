#!/usr/bin/env python3
"""Weekly labor report for Anthony's Friday pipeline sheet (run by weekly-report.yml).

Reads Firestore (service account) and writes ONE summary doc: reports/<REPORT_ID> with field `json`.
REPORT_ID is a long random secret (repo secret), so the doc can be fetched by the Friday Claude task
by URL without opening the rest of the database. Contents: job recaps from the last 7 days, labor
quote accuracy (last 90 days, by rep and by catalog item), and this month's leaderboard.
"""
import json, os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
import fs

REPORT_ID = os.environ['REPORT_ID'].strip()
now = datetime.datetime.now(datetime.timezone.utc)
def parse(t):
    try: return datetime.datetime.fromisoformat(str(t).replace('Z', '+00:00'))
    except Exception: return None
def within(t, days):
    d = parse(t); return bool(d and (now - d).days < days)

users = fs.fields(fs.call('config/users')).get('users') or {}
name_of = lambda e: (users.get(e) or {}).get('name', e)
store_of = {u.get('name'): u.get('store') for u in users.values()}
catalog = {i['id']: i for i in (fs.fields(fs.call('config/catalog')).get('items') or []) if isinstance(i, dict) and 'id' in i}
quotes = [dict(fs.fields(d), _id=fs.doc_id(d)) for d in fs.list_docs('quotes')]

def est_hours(it):
    c = it if it.get('isCustom') else catalog.get(it.get('id'), {})
    per = float(c.get('installHours') or 0) + float(c.get('programmingHours') or 0)
    ad = it.get('addon') or {}
    per += float(ad.get('installHours') or 0) + float(ad.get('programmingHours') or 0)
    return per * float(it.get('qty') or 0)
cut = lambda s, n=500: (s or '')[:n]

jobs = []
for q in quotes:
    j = q.get('job') or {}
    if q.get('status') not in ('submitted', 'closed'): continue
    if not (within(j.get('submittedAt'), 7) or within(j.get('reviewedAt'), 7)): continue
    items = q.get('items') or []
    lines = {l.get('i'): l for l in (j.get('lines') or [])}
    est = sum(est_hours(it) for i, it in enumerate(items) if lines.get(i, {}).get('actualHours') is not None and est_hours(it) > 0)
    act = sum(float(lines[i]['actualHours']) for i, it in enumerate(items) if lines.get(i, {}).get('actualHours') is not None and est_hours(it) > 0)
    proj = q.get('project') or {}
    jobs.append({
        'job': q.get('label') or proj.get('customerName'), 'client': proj.get('dtoolsClientName'), 'dtools': proj.get('dtoolsOppNumber'),
        'rep': proj.get('salesManagerName'), 'store': store_of.get(proj.get('salesManagerName')) or '',
        'status': q.get('status'), 'noQuote': bool(q.get('noQuote')),
        'techs': [name_of(t) for t in ((q.get('schedule') or {}).get('techs') or [])],
        'dates': (q.get('schedule') or {}).get('dates') or [],
        'timeOnSiteHours': round(sum(float(r.get('hours') or 0) for r in (j.get('log') or [])), 2),
        'estHours': round(est, 2) if est else None, 'actualHours': round(act, 2) if est else None,
        'variancePct': round((act - est) / est * 100) if est else None,
        'recap': {k: cut((j.get('recap') or {}).get(k)) for k in ('work', 'issues', 'followups', 'client')},
    })

reps, items = {}, {}
for q in quotes:
    a, j = q.get('actuals') or {}, q.get('job') or {}
    if q.get('status') != 'closed' or not a or not (a.get('totalEstHours') or 0) > 0: continue
    if not within(j.get('reviewedAt') or a.get('savedAt'), 90): continue
    rep = (q.get('project') or {}).get('salesManagerName') or '—'
    r = reps.setdefault(rep, {'rep': rep, 'store': store_of.get(rep) or '', 'jobs': 0, 'est': 0.0, 'act': 0.0})
    r['jobs'] += 1; r['est'] += float(a['totalEstHours']); r['act'] += float(a.get('totalActualHours') or 0)
    for l in a.get('lines') or []:
        it = items.setdefault(l.get('id'), {'item': l.get('name'), 'jobs': 0, 'est': 0.0, 'act': 0.0})
        it['jobs'] += 1; it['est'] += float(l.get('estHours') or 0); it['act'] += float(l.get('actualHours') or 0)
for d in list(reps.values()) + list(items.values()):
    d['variancePct'] = round((d['act'] - d['est']) / d['est'] * 100) if d['est'] else None
    d['est'], d['act'] = round(d['est'], 2), round(d['act'], 2)
tot_e = sum(r['est'] for r in reps.values()); tot_a = sum(r['act'] for r in reps.values())

mk = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-8))).strftime('%Y-%m')
try: month = fs.fields(fs.call('stats/' + mk)).get('reps') or {}
except Exception: month = {}
board = sorted(({'rep': n, 'store': store_of.get(n) or '', 'score': int(v.get('quotes', 0)) * 10 + int(v.get('accPts', 0)),
                 'quotes': int(v.get('quotes', 0)), 'approvedJobs': int(v.get('jobs', 0))}
                for n, v in month.items() if store_of.get(n) != 'none'), key=lambda x: -x['score'])

report = {
    'generatedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'month': mk,
    'jobsLast7Days': sorted(jobs, key=lambda x: (x['store'], x['job'] or '')),
    'accuracyLast90Days': {
        'overall': {'jobs': sum(r['jobs'] for r in reps.values()), 'est': round(tot_e, 2), 'act': round(tot_a, 2),
                    'variancePct': round((tot_a - tot_e) / tot_e * 100) if tot_e else None},
        'byRep': sorted(reps.values(), key=lambda r: abs(r['variancePct'] or 0), reverse=True),
        'itemsMostOff': sorted([i for i in items.values() if i['jobs'] >= 2], key=lambda i: abs(i['variancePct'] or 0), reverse=True)[:6],
    },
    'leaderboardThisMonth': board[:8],
    'notes': 'variancePct > 0 means jobs took longer than quoted. Estimates are catalog labor hours (before site conditions, PM and commissioning).',
}
fs.call('reports/' + REPORT_ID, method='PATCH', body={'fields': {
    'json': {'stringValue': json.dumps(report, ensure_ascii=False)},
    'generatedAt': {'timestampValue': report['generatedAt']}}})
print(f"::notice::Weekly report written: {len(jobs)} jobs this week, {report['accuracyLast90Days']['overall']['jobs']} approved jobs in 90 days")
