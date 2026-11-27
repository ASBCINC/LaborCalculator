#!/usr/bin/env python3
"""v11.1.0 Sign-in status for User Roles: who has signed up and verified their email.

Reads the Firebase Authentication user list with the service account (FIREBASE_SA) and writes
config/authStatus {json: {email: {verified, created, lastLogin}}, at}. Only those three facts are copied.
Run by the hourly "Sync D-Tools opportunities" workflow; reads only, never changes a sign-in.
"""
import json, os, sys, time, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import fs

PROJECT = 'asbc-calculator'

def token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    cred = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['FIREBASE_SA']), scopes=['https://www.googleapis.com/auth/cloud-platform'])
    cred.refresh(Request())
    return cred.token

def iso(ms):
    try: return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(int(ms) / 1000))
    except Exception: return ''

def main():
    if not os.environ.get('FIREBASE_SA'):
        print('::warning::FIREBASE_SA not set; skipping sign-in status'); return
    tok, out, page = token(), {}, None
    for _ in range(20):
        q = {'maxResults': 500}
        if page: q['nextPageToken'] = page
        req = urllib.request.Request(f'https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchGet?' + urllib.parse.urlencode(q),
                                     headers={'Authorization': 'Bearer ' + tok})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read().decode())
        for u in d.get('users') or []:
            e = str(u.get('email') or '').lower()
            if e: out[e] = {'verified': bool(u.get('emailVerified')), 'created': iso(u.get('createdAt')), 'lastLogin': iso(u.get('lastLoginAt') or u.get('lastRefreshAt'))}
        page = d.get('nextPageToken')
        if not page: break
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    fs.call('config/authStatus', method='PATCH', body={'fields': {'json': fs.typed(json.dumps(out)), 'at': {'timestampValue': now}}})
    print(f'::notice::sign-in status: {len(out)} accounts, {sum(1 for v in out.values() if v["verified"])} verified')

if __name__ == '__main__':
    main()
