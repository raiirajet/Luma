from playwright.sync_api import sync_playwright
from pathlib import Path
html=(Path(__file__).resolve().parent/'preview.html').read_text(encoding='utf-8')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox','--allow-file-access-from-files','--disable-web-security'])
 for width,height in [(1440,900),(390,844)]:
  ctx=b.new_context(viewport={'width':width,'height':height},has_touch=width<500,is_mobile=False)
  page=ctx.new_page();page.set_default_timeout(5000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://upload.wikimedia.org/**',lambda route:route.abort())
  page.evaluate("""() => {const p=history.pushState.bind(history);history.pushState=(s,t,u)=>p(s,t);const r=history.replaceState.bind(history);history.replaceState=(s,t,u)=>r(s,t)}""")
  page.set_content(html,wait_until='domcontentloaded')
  selector=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="swipe"]'
  page.locator(selector).click();page.locator('#swipeDone').click()
  bb=page.locator('#swipeCard').bounding_box()
  assert bb, 'swipe card not located'
  cx=bb['x']+bb['width']*.5;cy=bb['y']+bb['height']*.5
  def drag(x,y):
   page.mouse.move(cx,cy);page.mouse.down();page.mouse.move(cx+x,cy+y,steps=12);page.mouse.up();page.wait_for_timeout(150)
  drag(-140,0)
  assert page.locator('#toast').is_visible(),'left swipe must show end toast'
  drag(0,150)
  assert page.locator('#toast').is_visible(),'down must show similar toast'
  drag(0,-150)
  assert page.locator('#modal').is_visible(),'up swipe must show detail'
  page.locator('#detailBack').click()
  assert page.locator('#swipeView').is_visible() and page.locator('#modal').is_hidden(),'back must restore swipe'
  drag(140,0)
  assert page.locator('#modal').is_visible(),'right swipe must open details'
  page.locator('#modalClose').click()
  assert page.locator('#modal').is_hidden() and page.locator('#swipeView').is_visible(),'close must restore swipe'
  page.locator('#swipeHome').click()
  assert page.locator('#homeView').is_visible(),'home must leave swipe'
  assert not errors,errors
  print('PASS POINTER',width,'x',height,'gestures: left down up right back home','errors',len(errors))
  ctx.close()
 b.close()
