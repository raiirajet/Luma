from pathlib import Path
import re
base=Path(__file__).resolve().parent
html=(base/'index.html').read_text()
css=(base/'styles.css').read_text()
parts=[]
for f in ['translations-extra.js','i18n.js','cars-i18n.js','car-brands.js','app.js']:
 src=(base/f).read_text()
 src=re.sub(r'^import [^\n]+\n','',src,flags=re.M)
 src=re.sub(r'^export \{[^\n]+\};?\n','',src,flags=re.M)
 src=re.sub(r'\bexport (const|function)\b',r'\1',src)
 if f=='cars-i18n.js':src='const oldT=t;\n'+src
 parts.append('\n/* '+f+' */\n'+src)
script='\n'.join(parts)
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script defer src="config.js"></script>','<script>window.LUMA_FIREBASE_CONFIG=null;</script>')
html=html.replace('<script type="module" defer src="app.js"></script>','')
html=html.replace('</body>','<script>\n'+script.replace('</script','<\\/script')+'\n</script>\n</body>')
(base/'preview.html').write_text(html)
(base/'_preview_combo.js').write_text(script)
print(len(html),len(script))