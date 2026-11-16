#!/usr/bin/env python3
"""Release helper for the ASBC Labor Calculator (used by Claude; no build step).

  python3 scripts/release.py check            # local copy vs GitHub main, current version
  python3 scripts/release.py bump 8.9.16      # bump APP_VERSION, BUILD_DATE, sw.js cache name
  python3 scripts/release.py lint             # syntax-check inline JS + modal-before-script rule
  python3 scripts/release.py verify 8.9.16    # wait for the GitHub Pages deploy of that version
  python3 scripts/release.py rollback 8.9.15 8.9.17
        # emergency undo: restore app files exactly as they were in v8.9.15, published as new v8.9.17
        # (a new number so installed tablets pick it up); then commit + push in GitHub Desktop

Reads and writes files byte-for-byte so Windows CRLF line endings are preserved.
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "ASBCINC/LaborCalculator"
P = lambda *a: os.path.join(ROOT, *a)

def rd(f): return open(P(f), "rb").read().decode("utf-8")
def wr(f, s): open(P(f), "wb").write(s.encode("utf-8"))
def git(*a): return subprocess.run(["git", "-c", "core.autocrlf=true", "--no-optional-locks", *a],
                                   cwd=ROOT, capture_output=True, text=True).stdout.strip()
def api(path):
    with urllib.request.urlopen(f"https://api.github.com/repos/{REPO}/{path}", timeout=20) as r:
        return json.load(r)
def raw(f):
    with urllib.request.urlopen(f"https://raw.githubusercontent.com/{REPO}/main/{f}?t={time.time()}", timeout=20) as r:
        return r.read().decode("utf-8")
def version(src): return re.search(r"APP_VERSION = '([\d.]+)'", src).group(1)

def check():
    local = git("rev-parse", "HEAD"); remote = git("ls-remote", "origin", "refs/heads/main").split()[0]
    print("local version :", version(rd("index.html")))
    print("live version  :", version(raw("index.html")))
    print("in sync       :", "yes" if local == remote else "NO - click 'Fetch origin' then 'Pull' in GitHub Desktop")
    ch = git("status", "--short"); print("local changes :", ch or "none")

def bump(v):
    if not re.fullmatch(r"\d+\.\d+\.\d+", v): sys.exit("version must look like 8.9.16")
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-8))).strftime("%Y-%m-%d")
    s = rd("index.html")
    s, n1 = re.subn(r"const APP_VERSION = '[\d.]+';", f"const APP_VERSION = '{v}';", s, 1)
    s, n2 = re.subn(r"const BUILD_DATE = '[\d-]+';", f"const BUILD_DATE = '{today}';", s, 1)
    w = rd("sw.js")
    w, n3 = re.subn(r"asbc-calc-v[\d.]+", f"asbc-calc-v{v}", w, 1)
    w = re.sub(r"service worker \(v[\d.]+\)", f"service worker (v{v})", w, 1)
    if (n1, n2, n3) != (1, 1, 1): sys.exit(f"bump failed: APP_VERSION={n1} BUILD_DATE={n2} CACHE_NAME={n3}")
    wr("index.html", s); wr("sw.js", w); print(f"bumped to v{v} ({today})")

def lint():
    bad = 0
    for f in ("index.html", "log.html"):
        s = rd(f)
        for i, m in enumerate(re.finditer(r"<script>(.*?)</script>", s, re.S)):
            t = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False); t.write(m.group(1)); t.close()
            r = subprocess.run(["node", "--check", t.name], capture_output=True, text=True); os.unlink(t.name)
            if r.returncode:
                line = s[:m.start()].count("\n") + 1
                print(f"JS ERROR {f} script #{i+1} (starts line {line}):\n{r.stderr.strip()[:600]}"); bad += 1
    s = rd("index.html"); first = s.find("<script>", s.find("firebase-firestore-compat"))
    late = [x for x in re.findall(r'<div[^>]+id="([^"]*[Mm]odal[^"]*)"', s[first:])]
    if late: print("MODAL AFTER SCRIPT (breaks init, see v8.7.0):", late); bad += 1
    print("lint:", "FAILED" if bad else "ok"); sys.exit(1 if bad else 0)

def verify(v, timeout=420):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            sha = git("ls-remote", "origin", "refs/heads/main").split()[0]
            live = version(raw("index.html"))
            dep = [d for d in api("deployments?environment=github-pages&per_page=3") if d["sha"] == sha]
            state = api(f"deployments/{dep[0]['id']}/statuses?per_page=1")[0]["state"] if dep else "not started"
            if live == v and state == "success" and f"asbc-calc-v{v}" in raw("sw.js"):
                print(f"LIVE: v{v} deployed to GitHub Pages (commit {sha[:7]})"); return
            if state in ("failure", "error"): sys.exit(f"Pages deploy {state} for {sha[:7]}")
            print(f"waiting: main={live} pages={state}", flush=True)
        except Exception as e: print("waiting:", e, flush=True)
        time.sleep(30)
    sys.exit("timed out: not live yet (has it been pushed?)")

APP_FILES = ("index.html", "log.html", "sw.js", "manifest.json", "labor-catalog.json")

def rollback(good, new):
    sha = git("log", "--format=%H", "-1", f"--grep=^v{re.escape(good)}:")
    if not sha: sys.exit(f"no commit found for v{good}")
    for f in APP_FILES:
        r = subprocess.run(["git", "--no-optional-locks", "show", f"{sha}:{f}"], cwd=ROOT, capture_output=True)
        if r.returncode == 0:
            data = r.stdout.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")  # keep Windows line endings
            open(P(f), "wb").write(data)
    print(f"restored app files from v{good} ({sha[:7]})"); bump(new)
    print(f"commit message: v{new}: rollback to v{good}")

if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["check"]: check()
    elif a == ["lint"]: lint()
    elif len(a) == 2 and a[0] == "bump": bump(a[1])
    elif len(a) == 2 and a[0] == "verify": verify(a[1])
    elif len(a) == 3 and a[0] == "rollback": rollback(a[1], a[2])
    else: print(__doc__)
