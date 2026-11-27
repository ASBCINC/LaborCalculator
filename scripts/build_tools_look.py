#!/usr/bin/env python3
"""v11.0.0 ASBC Tools look (D-Tools style): recolor the app and add the sidebar, logo and new name.

  python3 scripts/build_tools_look.py          -> writes a full preview copy to next/  (live app untouched)
  python3 scripts/build_tools_look.py --live   -> converts the app in place (run once, when the preview is approved)

Colors are mapped by where they are used (background, text or border), so dark backgrounds turn light and light text
turns dark. Tailwind class names like bg-[#101216] are left alone (tools.css overrides them by class name).
"""
import os, re, shutil, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = '--live' in sys.argv
OUT = ROOT if LIVE else os.path.join(ROOT, 'next')
SKIP_DIRS = {'.git', '.github', 'scripts', 'cloudflare', 'tools', 'next', 'node_modules', '.tmp_pdf'}
NO_SIDEBAR = {'signoff.html'}  # the client signs on the tech's phone: no staff menu there

BG = {  # backgrounds
    '#050505': '#F3F5F8', '#0a0a0a': '#F3F5F8', '#000': '#F3F5F8', '#000000': '#F3F5F8', '#111': '#FFFFFF', '#111111': '#FFFFFF',
    '#0b0d11': '#FFFFFF', '#101216': '#FFFFFF', '#111318': '#FFFFFF', '#141414': '#FFFFFF', '#171717': '#FFFFFF', '#0d0d0d': '#FFFFFF',
    '#1a1d23': '#FFFFFF', '#1b1e24': '#F1F4F8', '#1d2026': '#F1F4F8', '#1d2027': '#F1F4F8', '#23262d': '#E8F1FC', '#242424': '#F1F4F8',
    '#2a2a2a': '#F1F4F8', '#444': '#E3E7EE', '#454a53': '#E3E7EE', '#555': '#E3E7EE', '#555555': '#E3E7EE',
    '#2a1d1d': '#FDECEC', '#2a1414': '#FDECEC', '#1a1408': '#FFF7E6', '#c7a66a': '#1F6FD1', '#b08d57': '#1F6FD1'}
TX = {  # text
    '#fff': '#1F2937', '#ffffff': '#1F2937', '#f5f5f5': '#1F2937', '#050505': '#FFFFFF', '#000': '#FFFFFF', '#000000': '#FFFFFF',
    '#111': '#FFFFFF', '#0a0a0a': '#FFFFFF', '#c7a66a': '#1F6FD1', '#8b8f98': '#4B5563', '#888': '#4B5563', '#d7d9de': '#374151',
    '#c9ccd2': '#374151', '#e9dcc0': '#374151', '#ccc': '#374151', '#ff8b8b': '#B42318', '#d98c8a': '#B42318', '#7ee2a0': '#0E7A4D',
    '#ffd479': '#8A5A00', '#8fb3ff': '#1F6FD1', '#ff9f6b': '#A1440B', '#ffb36b': '#A1440B', '#c9a0ff': '#6D28D9', '#a78bfa': '#6D28D9',
    '#2dd4bf': '#0F766E', '#f59e0b': '#B45309', '#3b82f6': '#1D4ED8', '#9a4b00': '#9A4B00', '#ffb4b4': '#B42318', '#555': '#6B7280',
    '#555555': '#6B7280', '#141414': '#FFFFFF'}
BD = {  # borders
    '#26292f': '#E3E7EE', '#1d2026': '#E3E7EE', '#1d2027': '#E3E7EE', '#23262d': '#E3E7EE', '#2a2a2a': '#E3E7EE', '#242424': '#E3E7EE',
    '#454a53': '#D5DBE4', '#444': '#D5DBE4', '#555': '#D5DBE4', '#555555': '#D5DBE4', '#c7a66a': '#1F6FD1', '#8a6d2f': '#E0B860',
    '#2f7a4c': '#8FD3B0', '#8a2f2f': '#F1A9A0', '#5a2b2b': '#F1A9A0', '#33518f': '#A9C6EE', '#8a4b2f': '#F3B98F', '#ff8b8b': '#E5484D',
    '#fff': '#E3E7EE', '#ffffff': '#E3E7EE', '#1b1e24': '#E3E7EE'}
# light accent colors that only ever mean text/borders on the dark theme (also inside JS ternaries): mapped everywhere
ANY = {'#7ee2a0': '#0E7A4D', '#ff8b8b': '#B42318', '#ffd479': '#8A5A00', '#ff9f6b': '#A1440B', '#ffb36b': '#A1440B', '#8fb3ff': '#1F6FD1',
       '#d7d9de': '#374151', '#e9dcc0': '#374151', '#c9a0ff': '#6D28D9', '#ffb4b4': '#B42318'}
VARS = {'--gold': '#1F6FD1', '--bg': '#F3F5F8', '--card': '#FFFFFF', '--line': '#E3E7EE', '--muted': '#4B5563', '--good': '#0E7A4D',
        '--warn': '#8A5A00', '--bad': '#B42318', '--blue': '#1F6FD1', '--none': '#6B7280'}
HEX = re.compile(r'(?<![\[\w-])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
PROP = re.compile(r'(?<![\w-])((?:background(?:-color)?|color|fill|stroke|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow)\s*:\s*)([^;"\'}{<>\n]*)', re.I)

def lum(h):
    h = h.lstrip('#'); h = ''.join(c * 2 for c in h) if len(h) == 3 else h
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def fallback(kind, h):  # shades not in the tables: decide by brightness
    L = lum(h)
    if kind == 'bg' and L < 0.35:  # any dark fill -> a very light tint of the same hue
        h2 = h.lstrip('#'); h2 = ''.join(c * 2 for c in h2) if len(h2) == 3 else h2
        ch = [int(h2[i:i + 2], 16) for i in (0, 2, 4)]
        if max(ch) - min(ch) < 24: return '#F1F4F8'
        return '#' + ''.join('%02X' % round(255 - (255 - c) * 0.12) for c in ch)
    if kind == 'bd' and L < 0.22: return '#E3E7EE'
    if kind == 'tx' and L > 0.80: return '#374151'
    return h

def table(prop):
    p = prop.lower()
    if p.startswith('background'): return BG
    if p.startswith(('border', 'outline', 'box-shadow')): return BD
    if p.startswith(('fill', 'stroke')): return BG
    return TX

PRINT = re.compile(r'@media\s+print\s*\{')

def recolor(text):
    # keep @media print blocks as they are (black on white paper)
    keep, out, i = [], [], 0
    for m in PRINT.finditer(text):
        if m.start() < i: continue
        j, depth = m.end(), 1
        while j < len(text) and depth:
            depth += {'{': 1, '}': -1}.get(text[j], 0); j += 1
        out.append(_recolor(text[i:m.start()])); out.append(text[m.start():j]); i = j
    out.append(_recolor(text[i:]))
    return ''.join(out)

def _recolor(text):
    def per_prop(m):
        t = table(m.group(1).split(':')[0].strip())
        kind = 'bg' if t is BG else 'bd' if t is BD else 'tx'
        return m.group(1) + HEX.sub(lambda h: t.get(h.group(0).lower()) or fallback(kind, h.group(0)), m.group(2))
    text = PROP.sub(per_prop, text)
    text = HEX.sub(lambda h: ANY.get(h.group(0).lower(), h.group(0)), text)
    for a, b in (('rgba(5,5,5,.96)', 'rgba(255,255,255,.97)'), ('rgba(199,166,106,.08)', 'rgba(31,111,209,.06)'), ('rgba(255,255,255,0.08)', 'rgba(31,111,209,0.06)')):
        text = text.replace(a, b)
    for k, v in VARS.items():
        text = re.sub(r'(%s\s*:\s*)#[0-9a-fA-F]{3,6}\b' % re.escape(k), r'\g<1>' + v, text)
    return text

HEAD_ADD = ('<script>window.ASBC_TOOLS = true;</script>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
            '<link rel="stylesheet" href="./tools.css">\n')

def html(name, s):
    s = recolor(s)
    s = s.replace('ASBC Labor Calculator', 'ASBC Tools').replace('Labor Calculator | ASBC', 'Calculator | ASBC Tools')
    s = s.replace('<title>ASBC | ', '<title>ASBC Tools | ')
    s = re.sub(r'<title>([^<|]*)\| ASBC</title>', r'<title>\1| ASBC Tools</title>', s)
    s = s.replace('<span class="text-[#C7A66A]">Labor Calculator</span>', '<span class="text-[#C7A66A]">Calculator</span>')
    s = s.replace('./apple-touch-icon.png', './tools-apple-touch-icon.png').replace('href="./icon-192.png"', 'href="./tools-icon-192.png"').replace('./favicon.svg', './tools-favicon.svg')
    s = s.replace('content="#b08d57"', 'content="#2F7FD1"').replace('content="#050505"', 'content="#2F7FD1"')
    if 'tools.css' not in s: s = s.replace('</head>', HEAD_ADD + '</head>', 1)
    if name not in NO_SIDEBAR and 'sidebar.js' not in s and './roles.js' in s:
        extra = '<script src="./alerts.js"></script>\n' if name in ('home.html', 'jobs.html', 'index.html') and 'alerts.js' not in s else ''
        s = s.replace('</body>', extra + '<script src="./sidebar.js" defer></script>\n</body>', 1)
    return s

def main():
    if not LIVE:
        if os.path.isdir(OUT): shutil.rmtree(OUT)
        os.makedirs(OUT)
    for name in sorted(os.listdir(ROOT)):
        src = os.path.join(ROOT, name)
        if os.path.isdir(src) or name in SKIP_DIRS or name.startswith('.') or name in ('CLAUDE.md', 'README.md'): continue
        dst = os.path.join(OUT, name)
        if name.endswith('.html'):
            with open(src, encoding='utf-8') as f: s = f.read()
            with open(dst, 'w', encoding='utf-8') as f: f.write(html(name, s))
        elif name.endswith('.js') and name not in ('sidebar.js',):
            with open(src, encoding='utf-8') as f: s = f.read()
            s = recolor(s)
            if name == 'sw.js':
                s = s.replace("'asbc-calc-v", "'asbc-tools-next-v" if not LIVE else "'asbc-tools-v")
                if "'./tools.css'" not in s: s = s.replace("'./update-check.js',", "'./update-check.js',\n  './tools.css',\n  './sidebar.js',\n  './alerts.js',", 1)
            with open(dst, 'w', encoding='utf-8') as f: f.write(s)
        elif name == 'manifest.json':
            m = json.load(open(src, encoding='utf-8'))
            m.update({'name': 'ASBC Tools', 'short_name': 'ASBC Tools', 'background_color': '#F3F5F8', 'theme_color': '#2F7FD1'})
            if not LIVE: m['id'] = './next/'
            for ic in m.get('icons', []): ic['src'] = ic['src'].replace('./icon-', './tools-icon-')
            json.dump(m, open(dst, 'w', encoding='utf-8'), indent=1)
        elif not LIVE:
            shutil.copy2(src, dst)
    if LIVE:
        for ic in ('192', '512', '512-maskable'):
            p = os.path.join(ROOT, 'tools-icon-%s.png' % ic)
            if os.path.exists(p): shutil.copy2(p, os.path.join(ROOT, 'icon-%s.png' % ic))
        m = json.load(open(os.path.join(ROOT, 'manifest.json'))); [i.update(src=i['src'].replace('./tools-icon-', './icon-')) for i in m['icons']]
        json.dump(m, open(os.path.join(ROOT, 'manifest.json'), 'w'), indent=1)
    print(('converted the app in place' if LIVE else 'preview written to next/'))

if __name__ == '__main__':
    main()
