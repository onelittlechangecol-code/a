# Assembles src/ into the single-file game at the repo root (index.html).
# Extra modules named mod_*.js are inserted after partE.js, sorted by name.
import os, glob, sys
D = os.path.dirname(os.path.abspath(__file__))
R = os.path.dirname(D)
A = open(os.path.join(D, 'partA.html')).read()
head, body = A.split('<div id="loader"', 1); body = '<div id="loader"' + body
order = ['partB.js', 'partC.js', 'partD.js', 'partE.js'] + sorted(os.path.basename(p) for p in glob.glob(os.path.join(D, 'mod_*.js'))) + ['partF.js', 'partG.js']
js = ''.join(open(os.path.join(D, f)).read() + '\n' for f in order)
full = f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head.strip()}
</head>
<body>
{body.strip()}
<script>
{js}</script>
</body>
</html>
'''
open(os.path.join(R, 'index.html'), 'w').write(full)
if os.environ.get('ARTIFACT'):
    open(os.environ['ARTIFACT'], 'w').write(head.strip() + '\n' + body.strip() + '\n<script>\n' + js + '</script>\n')
print(len(full))
