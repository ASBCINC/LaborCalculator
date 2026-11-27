#!/usr/bin/env python3
"""Release helper for the ASBC Labor Calculator (used by Claude).

v11.8.0: the calculator and Jobs page code lives in src/calculator/*.js and src/jobs/*.js (edit those).
`build` joins them, in file-name order, into calculator.js and jobs-app.js (the files the pages load);
`bump` builds automatically and `lint` fails if a built file is out of date.

  python3 scripts/release.py check            # local copy vs GitHub main, current version
  python3 scripts/release.py build            # rebuild calculator.js / jobs-app.js from src/ (v11.8.0)
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

BUNDLES = (("calculator", "calculator.js"), ("jobs", "jobs-app.js"))
HDR = "// BUILT FILE: do not edit. Edit src/{d}/*.js, then run: python3 scripts/release.py build\n"
def built(d):
    files = sorted(f for f in os.listdir(P("src", d)) if f.endswith(".js"))
    return HDR.format(d=d) + "".join(open(P("src", d, f), "rb").read().decode("utf-8") for f in files)
def build(quiet=False):
    for d, out in BUNDLES:
        wr(out, built(d))
        if not quiet: print("built", out, "from", len([f for f in os.listdir(P("src", d)) if f.endswith(".js")]), "files")

def check():
    local = git("rev-parse", "HEAD"); remote = git("ls-remote", "origin", "refs/heads/main").split()[0]
    print("local version :", version(rd("calculator.js")))
    print("live version  :", version(raw("calculator.js")))
    print("in sync       :", "yes" if local == remote else "NO - click 'Fetch origin' then 'Pull' in GitHub Desktop")
    ch = git("status", "--short"); print("local changes :", ch or "none")

def bump(v):
    if not re.fullmatch(r"\d+\.\d+\.\d+", v): sys.exit("version must look like 8.9.16")
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-8))).strftime("%Y-%m-%d")
    SETUP = os.path.join("src", "calculator", "01-setup.js")
    s = rd(SETUP)
    s, n1 = re.subn(r"const APP_VERSION = '[\d.]+';", f"const APP_VERSION = '{v}';", s, 1)
    s, n2 = re.subn(r"const BUILD_DATE = '[\d-]+';", f"const BUILD_DATE = '{today}';", s, 1)
    w = rd("sw.js")
    w, n3 = re.subn(r"asbc-(?:calc|tools)-v[\d.]+", f"asbc-tools-v{v}", w, 1)
    w = re.sub(r"(update marker[^\n]*?)asbc-calc-v[\d.]+", lambda m: m.group(1) + f"asbc-calc-v{v}", w)  # v11.11.1 old update checks
    w = re.sub(r"service worker \(v[\d.]+\)", f"service worker (v{v})", w, 1)
    if (n1, n2, n3) != (1, 1, 1): sys.exit(f"bump failed: APP_VERSION={n1} BUILD_DATE={n2} CACHE_NAME={n3}")
    u = rd("update-check.js")
    u, n4 = re.subn(r"const ASBC_VERSION = '[\d.]+';", f"const ASBC_VERSION = '{v}';", u, 1)
    if n4 != 1: sys.exit("bump failed: ASBC_VERSION in update-check.js")
    wr(SETUP, s); wr("sw.js", w); wr("update-check.js", u); build(True); print(f"bumped to v{v} ({today})")

def lint():
    bad = 0
    for f in ("index.html", "log.html", "jobs.html", "signoff.html", "leaderboard.html", "calendar.html", "pipeline.html", "home.html", "users.html", "expenses.html"):
        s = rd(f)
        for i, m in enumerate(re.finditer(r"<script>(.*?)</script>", s, re.S)):
            t = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False); t.write(m.group(1)); t.close()
            r = subprocess.run(["node", "--check", t.name], capture_output=True, text=True); os.unlink(t.name)
            if r.returncode:
                line = s[:m.start()].count("\n") + 1
                print(f"JS ERROR {f} script #{i+1} (starts line {line}):\n{r.stderr.strip()[:600]}"); bad += 1
    for d, out in BUNDLES:
        if rd(out) != built(d): print(f"OUT OF DATE: {out} (run: python3 scripts/release.py build)"); bad += 1
        r = subprocess.run(["node", "--check", P(out)], capture_output=True, text=True)
        if r.returncode: print(f"JS ERROR {out}:\n{r.stderr.strip()[:600]}"); bad += 1
    s = rd("index.html"); first = s.find('<script src="./calculator.js"')
    late = [x for x in re.findall(r'<div[^>]+id="([^"]*[Mm]odal[^"]*)"', s[first:])]
    if late: print("MODAL AFTER SCRIPT (breaks init, see v8.7.0):", late); bad += 1
    print("lint:", "FAILED" if bad else "ok"); sys.exit(1 if bad else 0)

def verify(v, timeout=420):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            sha = git("ls-remote", "origin", "refs/heads/main").split()[0]
            dep = [d for d in api("deployments?environment=github-pages&per_page=3") if d["sha"] == sha]
            state = api(f"deployments/{dep[0]['id']}/statuses?per_page=1")[0]["state"] if dep else "not started"
            live = version(raw("calculator.js"))
            if live == v and state == "success" and f"asbc-tools-v{v}" in raw("sw.js"):
                print(f"LIVE: v{v} deployed to GitHub Pages (commit {sha[:7]})"); return
            if state in ("failure", "error"): sys.exit(f"Pages deploy {state} for {sha[:7]}")
            print(f"waiting: main={live} pages={state}", flush=True)
        except Exception as e: print("waiting:", e, flush=True)
        time.sleep(30)
    sys.exit("timed out: not live yet (has it been pushed?)")

APP_FILES = ("index.html", "log.html", "sw.js", "manifest.json", "labor-catalog.json", "calculator.js", "calculator.css", "jobs.html", "jobs-app.js", "jobs.css")

def rollback(good, new):
    sha = git("log", "--format=%H", "-1", f"--grep=^v{re.escape(good)}:")
    if not sha: sys.exit(f"no commit found for v{good}")
    for f in APP_FILES:
        r = subprocess.run(["git", "--no-optional-locks", "show", f"{sha}:{f}"], cwd=ROOT, capture_output=True)
        if r.returncode == 0:
            data = r.stdout.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")  # keep Windows line endings
            open(P(f), "wb").write(data)
    print(f"restored app files from v{good} ({sha[:7]})")
    # versions before v11.8.0 had the code inside index.html / jobs.html: the restored pages carry it themselves
    if os.path.exists(P("src", "calculator", "01-setup.js")) and '<script src="./calculator.js"' in rd("index.html"): bump(new)
    else:
        s = rd("index.html"); s = re.sub(r"const APP_VERSION = '[\d.]+';", f"const APP_VERSION = '{new}';", s, 1); wr("index.html", s)
        w = rd("sw.js"); w = re.sub(r"asbc-(?:calc|tools)-v[\d.]+", f"asbc-tools-v{new}", w, 1); w = re.sub(r"(update marker[^\n]*?)asbc-calc-v[\d.]+", lambda m: m.group(1) + f"asbc-calc-v{new}", w); wr("sw.js", w)
        u = rd("update-check.js"); u = re.sub(r"const ASBC_VERSION = '[\d.]+';", f"const ASBC_VERSION = '{new}';", u, 1); wr("update-check.js", u)
    print(f"commit message: v{new}: rollback to v{good}")

if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["check"]: check()
    elif a == ["lint"]: lint()
    elif a == ["build"]: build()
    elif len(a) == 2 and a[0] == "bump": bump(a[1])
    elif len(a) == 2 and a[0] == "verify": verify(a[1])
    elif len(a) == 3 and a[0] == "rollback": rollback(a[1], a[2])
    else: print(__doc__)
