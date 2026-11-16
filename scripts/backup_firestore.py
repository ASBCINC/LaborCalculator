#!/usr/bin/env python3
"""Nightly backup of the calculator's Firestore data (run by nightly-backup.yml).

  python3 scripts/backup_firestore.py <backup_dir>

Writes config.json, quotes.json, opportunities.json into <backup_dir> (a checkout of the
PRIVATE LaborCalculator-backups repo; git history there is the day-by-day backup), plus
summary.json (counts only). Also refreshes this repo's labor-catalog.json from the live
catalog so the offline fallback never resurrects deleted items.
"""
import json, os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
import fs

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
def dump(name, obj):
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False, sort_keys=True)

data = {}
for col in ('config', 'quotes', 'opportunities'):
    data[col] = {fs.doc_id(d): fs.fields(d) for d in fs.list_docs(col)}
    dump(f'{col}.json', data[col])

items = (data['config'].get('catalog') or {}).get('items') or []
summary = {'at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
           'quotes': len(data['quotes']), 'opportunities': len(data['opportunities']),
           'catalogItems': len(items)}
dump('summary.json', summary)
print(f"::notice::Backup OK: {summary['quotes']} quotes, {summary['opportunities']} opportunities, {summary['catalogItems']} catalog items")

# Refresh the bundled offline catalog (same row shape the app's itemsFromRows() reads).
if len(items) >= 10:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(repo_root, 'labor-catalog.json')
    new = json.dumps(items, indent=2, ensure_ascii=False) + '\n'
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    if json.loads(old or '[]') != items:
        open(path, 'w', encoding='utf-8', newline='\n').write(new)
        print(f'::notice::labor-catalog.json refreshed ({len(items)} items)')
