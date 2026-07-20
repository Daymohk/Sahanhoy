#!/usr/bin/env python3
"""
Rebuild preview.html from the current index.html, styles.css, config.js,
app.js and data/people.json.

Run this after changing any of those files, otherwise preview.html will still
show the old version — it has everything baked in.

    python3 build-preview.py
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__)) + os.sep

def read(p):
    with open(ROOT + p, encoding='utf-8') as f:
        return f.read()

html = read('index.html')
css  = read('styles.css')
cfg  = read('config.js')
app  = read('app.js')
data = read('data/people.json')

html = html.replace('<link rel="stylesheet" href="styles.css">',
                    '<style>\n' + css + '\n</style>')

html = html.replace(
    '<script src="config.js"></script>\n<script src="app.js"></script>',
    '<script>\nwindow.PEOPLE_DATA = ' + data.strip() + ';\n</script>\n'
    '<script>\n' + cfg + '\n</script>\n'
    '<script>\n' + app + '\n</script>')

html = html.replace('<title>Саханхой', '<title>Саханхой (одним файлом) — ')

if 'PEOPLE_DATA' not in html or 'src="app.js"' in html:
    raise SystemExit('Inlining failed — did the script tags in index.html change?')

with open(ROOT + 'preview.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('preview.html rebuilt —', round(len(html.encode()) / 1024), 'KB')
