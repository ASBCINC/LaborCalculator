"""v10.4.0 Publish firestore.rules to project asbc-calculator (run by .github/workflows/deploy-infra.yml).
Uses the FIREBASE_SA service account. It needs the "Firebase Rules Admin" role (Google Cloud console > IAM)."""
import json, os, sys
import google.auth.transport.requests
from google.oauth2 import service_account

PROJECT = 'asbc-calculator'
API = 'https://firebaserules.googleapis.com/v1/projects/' + PROJECT
creds = service_account.Credentials.from_service_account_info(json.loads(os.environ['FIREBASE_SA']), scopes=['https://www.googleapis.com/auth/cloud-platform'])
s = google.auth.transport.requests.AuthorizedSession(creds)
src = open('firestore.rules', encoding='utf-8').read()
r = s.post(API + '/rulesets', json={'source': {'files': [{'name': 'firestore.rules', 'content': src}]}})
if r.status_code == 403:
    sys.exit('403: give the FIREBASE_SA service account the "Firebase Rules Admin" role in Google Cloud IAM, then re-run this workflow.')
if not r.ok:
    sys.exit('Rules did not compile or were refused: %s %s' % (r.status_code, r.text[:1500]))
name = r.json()['name']
rel = API + '/releases/cloud.firestore'
r = s.patch(rel, json={'release': {'name': 'projects/%s/releases/cloud.firestore' % PROJECT, 'rulesetName': name}})
if not r.ok:
    sys.exit('Release update failed: %s %s' % (r.status_code, r.text[:800]))
print('Firestore rules published:', name)
