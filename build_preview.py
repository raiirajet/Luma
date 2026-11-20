from pathlib import Path
import re
base=Path(__file__).resolve().parent
html=(base/'index.html').read_text(encoding='utf-8')
css=(base/'styles.css').read_text(encoding='utf-8')
parts=[]
for f in ['translations-extra.js','i18n.js','cars-i18n.js','car-brands.js','icons.js','feature-i18n.js','mvp-i18n.js','limba-lux.js','limba-lux-ui.js','search-filters-i18n.js','release-i18n.js','limba-market-ui.js','limba-dealer-ui.js','limba-drafts.js','limba-web-search.js','functions/listing-badges.mjs','app.js']:
 src=(base/f).read_text(encoding='utf-8')
 src=re.sub(r'^import [^\n]+\n','',src,flags=re.M)
 src=re.sub(r'^export \{[^\n]+\};?\n','',src,flags=re.M)
 src=re.sub(r'\bexport (const|function)\b',r'\1',src)
 if f=='cars-i18n.js':src='const oldT=t;\n'+src
 parts.append('\n/* '+f+' */\n'+src)
script='\n'.join(parts)
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script src="limba-theme.js"></script>','<script>\n'+(base/'limba-theme.js').read_text(encoding='utf-8')+'\n</script>')
html=html.replace('<script defer src="config.js"></script>','<script>window.LIMBA_OFFLINE_PREVIEW=true;window.LIMBA_FIREBASE_CONFIG=null;window.LUMA_FIREBASE_CONFIG=null;</script>')
html=html.replace('<script type="module" defer src="app.js"></script>','')
html=html.replace('</body>','<script>\n'+script.replace('</script','<\\/script')+'\n</script>\n</body>')
(base/'preview.html').write_text(html, encoding='utf-8')
(base/'_preview_combo.js').write_text(script, encoding='utf-8')
print(len(html),len(script))
