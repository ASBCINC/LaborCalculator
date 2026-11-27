"""v11.10.0 Teams reminders that used to need the work computer (the Claude "D-Tools pull" ran them in a browser).

Runs from the hourly "Sync D-Tools opportunities" workflow; each part decides for itself whether it is due (Pacific time)
and remembers what it sent, so extra or late runs never send twice:
  - prep:  weekdays from 7 AM, sales-rep heads-up 2 days before an install's first day (same as asbcPrepReminders)
  - nudge: weekdays 5-9 PM, techs on today's jobs with no job report yet (same as asbcRecapNudge)
  - stale: weekdays 8 AM-6 PM, one Teams alert a day to the admin when the D-Tools calendar hasn't synced
           (26 h, 74 h on Mondays), naming the problem a scheduled run recorded (config/syncStatus) if any.
Messages go through the relay's /notify with an OAuth token for the FIREBASE_SA service account (the relay checks it with Google).
"""
import json, os, re, sys, unicodedata, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import fs

RELAY = 'https://yellow-cloud-830a.a-ward-612.workers.dev/notify'
PT = ZoneInfo('America/Los_Angeles')
APP = 'https://asbcinc.github.io/LaborCalculator/'

def token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    c = service_account.Credentials.from_service_account_info(json.loads(os.environ['FIREBASE_SA']),
        scopes=['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/userinfo.email'])
    c.refresh(Request())
    fs._token = c.token   # fs.py uses the same token
    return c.token

def notify(tok, body):
    req = urllib.request.Request(RELAY, method='POST', data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok, 'User-Agent': 'asbc-daily-alerts'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status
    except urllib.error.HTTPError as e:
        print('  relay', e.code, e.read().decode('utf-8', 'replace')[:200]); return e.code
    except Exception as e:
        print('  relay error', e); return 0

def fold(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return re.sub(r'\s+', ' ', ''.join(ch for ch in s if not unicodedata.combining(ch)).lower()).strip()

def get(path):
    try: return fs.fields(fs.call(path))
    except fs.FirestoreError as e:
        if e.code == 404: return None
        raise

def setf(path, data):
    fs.call(path, 'PATCH', {'fields': {k: fs.typed(v) for k, v in data.items()}}, params={'updateMask.fieldPaths': list(data)})

def checklist(names):
    t, out = ' '.join(names or []).lower(), []
    if re.search(r'oled|beovision|tv|contour|harmony|theatre|lg ', t): out.append('TV location confirmed: wall blocking or stand, power and network at the TV')
    if re.search(r'beolab|speaker|shape|celestial|in-wall|in-ceiling', t): out.append('Speaker locations clear; power at each active speaker')
    if re.search(r'shape', t): out.append('Shape wall ready (paint dry, layout agreed), outlet near the amplifier tile')
    if re.search(r'eero|unifi|ubiquiti|switch|router|network|access point|poe', t): out.append('Internet live; access to modem/router and Wi-Fi name and password')
    if re.search(r'rack|core|amp|encore|wattbox|strong', t): out.append('Equipment location with power and ventilation')
    if re.search(r'motoriz|lift|mount', t): out.append('Mounting surface approved by the client (no surprises behind the wall)')
    out += ['Client (or someone with authority) home for the full window; gate/parking/access details',
            'Clear path for delivery and removal of packaging', 'Any payment due before install has been collected']
    return out

def scheduled():
    out = []
    for d in fs.list_docs('quotes'):
        q = fs.fields(d)
        if q.get('status') == 'scheduled' and not q.get('isTemplate') and not q.get('jobDeleted'): out.append((fs.doc_id(d), q))
    return out

def pipeline():
    p = get('pipeline/data') or {}
    try: return json.loads(p.get('json') or '{}').get('projects') or {}
    except Exception: return {}

def prep(tok, today, wd):
    add = lambda n: (datetime.fromisoformat(today) + timedelta(days=n)).date().isoformat()
    targets = [add(2)] + ([add(3)] if wd == 4 else []) + ([add(4)] if wd == 3 else [])  # Python weekday: Mon=0 … Fri=4
    by = {fold(p.get('name')): p for p in pipeline().values()}
    for qid, q in scheduled():
        sc, pr = q.get('schedule') or {}, q.get('project') or {}
        first = min([d for d in sc.get('dates') or [] if d >= today] or [''])
        if not first or first not in targets or q.get('prepSent') == first or not pr.get('salesManagerName'): continue
        pp = by.get(fold(pr.get('dtoolsProjectName') or q.get('label'))) or {}
        parts = pp.get('parts') or {}
        unstaged = [x.get('name', '') + (' ×' + str(x['qty']) if (x.get('qty') or 0) > 1 else '') for x in parts.get('notStaged') or []]
        st = notify(tok, {'kind': 'prep', 'quote': qid, 'checklist': checklist(parts.get('names') or []), 'unstaged': unstaged})
        if st == 200: setf('quotes/' + qid, {'prepSent': first})
        print('  prep', pr.get('dtoolsProjectName') or q.get('label'), st)

def nudge(tok, today):
    for qid, q in scheduled():
        sc = q.get('schedule') or {}
        if today not in (sc.get('dates') or []) or not sc.get('techs') or (q.get('job') or {}).get('submittedAt') or q.get('nudged') == today: continue
        st = notify(tok, {'kind': 'nudge', 'quote': qid})
        if st == 200: setf('quotes/' + qid, {'nudged': today})
        print('  nudge', (q.get('project') or {}).get('dtoolsProjectName') or q.get('label'), st)

def stale(tok, now, today, wd):
    ev = get('config/dtoolsEvents') or {}
    at = ev.get('at')
    age = (now - datetime.fromisoformat(at.replace('Z', '+00:00'))).total_seconds() / 3600 if at else 9999
    limit = 74 if wd == 0 else 26
    print(f'  calendar sync age {age:.1f} h (limit {limit})')
    if age <= limit: return
    alert = get('config/syncAlert') or {}
    if alert.get('sent') == today: return
    prob = (get('config/syncStatus') or {}).get('problem') or ''
    when = datetime.fromisoformat(at.replace('Z', '+00:00')).astimezone(PT).strftime('%a %b %-d, %-I:%M %p') if at else 'ever'
    text = (f'The install calendar in ASBC Tools was last synced from D-Tools {when}.' if at else 'The install calendar has never synced from D-Tools.') + \
        (f' The last scheduled run reported: {prob}.' if prob else ' The work computer may be off, or D-Tools / ASBC Tools may be signed out.') + \
        ' Open D-Tools and click the ASBC sync bookmark to catch up (it also pushes any waiting stage changes).'
    st = notify(tok, {'kind': 'admin', 'title': "D-Tools calendar hasn't synced", 'text': text, 'url': APP + 'calendar.html', 'button': 'Open Calendar'})
    if st == 200: setf('config/syncAlert', {'sent': today, 'at': now.isoformat()})
    print('  stale alert', st)

def main():
    if not os.environ.get('FIREBASE_SA'): print('FIREBASE_SA not set: skipped'); return
    now = datetime.now(timezone.utc); lt = now.astimezone(PT); today, wd, hr = lt.date().isoformat(), lt.weekday(), lt.hour
    only = (sys.argv[1:] or [''])[0]   # optional: prep | nudge | stale (manual runs)
    if wd > 4 and not only: print('weekend: nothing to do'); return
    tok = token()
    if only == 'prep' or (not only and 7 <= hr < 12): print('prep reminders'); prep(tok, today, wd)
    if only == 'nudge' or (not only and 17 <= hr < 21): print('recap nudges'); nudge(tok, today)
    if only == 'stale' or (not only and 8 <= hr < 18): print('calendar sync check'); stale(tok, now, today, wd)

if __name__ == '__main__':
    main()
