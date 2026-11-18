"""Acceptance smoke: no clipped header/navigation/filter at 320, 390, 768, 1440 px."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
import functools
import threading

root=Path(__file__).resolve().parents[1]
handler=functools.partial(SimpleHTTPRequestHandler,directory=str(root))
server=ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
  for width,height in [(320,680),(390,844),(768,1024),(1440,900)]:
   ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<500)
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/preview.html',wait_until='domcontentloaded')
   page.locator('#carGrid .car-card').first.wait_for(timeout=12000)
   metrics=page.evaluate("""() => {
     const box=id=>{ const n=document.querySelector(id);const r=n?.getBoundingClientRect();
       if(!n||!r)return null;return {left:r.left,right:r.right,width:r.width,
         visible:getComputedStyle(n).display!=='none'};};
     return {vw:innerWidth,docWidth:document.documentElement.scrollWidth,
       bodyWidth:document.body.scrollWidth,
       header:box('.site-header'),brand:box('#brandBtn'),language:box('#language'),
       login:box('#loginBtn'),settings:box('#settingsBtn'),filters:box('#searchForm'),
       swipe:box('.swipe-inline'),nav:box('.mobile-nav')};
   }""")
   assert metrics['docWidth']<=width+1, (width,metrics)
   for key in ['brand','language','login','filters']:
    r=metrics[key]
    assert r and r['left']>=-1 and r['right']<=width+1,(width,key,r)
   if width<=390:
    assert page.locator('.mobile-nav button').count()==5
    assert page.locator('#mobileSell').is_visible()
    for key in ['settings','nav']:
     r=metrics[key];assert r and r['visible'] and r['right']<=width+1,(width,key,r)
    page.locator('.mobile-nav [data-view="messages"]').click()
    assert page.locator('#messagesView').is_visible()
    page.locator('.mobile-nav [data-view="profile"]').click()
    assert page.locator('#profileView').is_visible()
    page.locator('.mobile-nav [data-view="home"]').click()
   assert page.locator('#keyword').is_hidden(), 'optional keyword is in more filters only'
   page.locator('.search-swipe-btn').click()
   assert page.locator('#swipeView').is_visible()
   if page.locator('#swipeTutorial').is_visible():
    page.locator('#swipeDone').click()
   page.locator('#swipeHome').click()
   assert page.locator('#homeView').is_visible()
   assert not errors,(width,errors)
   print('PASS responsive',width,metrics)
   ctx.close()
  browser.close()
finally:
 server.shutdown()
