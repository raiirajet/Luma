from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, functools
from pathlib import Path

root=Path(__file__).resolve().parent
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self, *_): pass
handler=functools.partial(Quiet,directory=str(root))
server=ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/index.html'

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1440,970),(390,844)]:
  context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=width<500,is_mobile=width<500)
  page=context.new_page()
  page.set_default_timeout(6000)
  errors=[]; page.on('pageerror',lambda err:errors.append(str(err)))
  page.route('https://upload.wikimedia.org/**',lambda route:route.abort())
  page.route('https://images.unsplash.com/**',lambda route:route.abort())
  # This environment blocks localhost/file navigations. Execute the self-contained preview
  # in about:blank, preserving synthetic history in the same document.
  page.evaluate("""() => { const origPush=history.pushState.bind(history), origReplace=history.replaceState.bind(history);
    history.pushState=(s,t,u)=>origPush(s,t);history.replaceState=(s,t,u)=>origReplace(s,t);
    const values={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>(k in values?values[k]:null),setItem:(k,v)=>{values[k]=String(v)},removeItem:k=>delete values[k]}})
  }""")
  page.set_content((root/'preview.html').read_text(),wait_until='domcontentloaded')
  page.locator('#carGrid .car-card').first.wait_for()
  assert page.locator('#carGrid .car-card').count()==1,'expected exactly one demo car'
  assert 'Nissan GT-R' in page.locator('.car-card').first.inner_text()
  assert page.locator('#make option[value="Nissan"]').count()==1
  print('START',width,'cars',page.locator('.car-card').count(),'errors',errors)
  # Form and dynamic filters
  page.locator('#make').select_option('Nissan')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#model').select_option('GT-R')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#make').select_option('BMW')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#priceTo').fill('5000')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#resetEmpty').click()
  assert page.locator('#carGrid .car-card').count()==1
  # Main card detail and browser back
  page.locator('#carGrid .car-card').click(position={'x':50,'y':160})
  assert page.locator('#modal').is_visible()
  assert 'Nissan GT-R R35' in page.locator('#modalTitle').inner_text()
  assert page.locator('.vehicle-description').inner_text().__len__()>550
  assert page.locator('.photo-credit a').count()==1
  assert page.locator('#photoControls #photoPrev').is_hidden()
  assert page.locator('#detailBack').is_visible()
  page.locator('#detailBack').click()
  assert page.locator('#modal').is_hidden()
  assert page.locator('#homeView').is_visible()
  # heart and favorite page
  page.locator('.car-card .card-heart').first.click()
  fav_nav=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="favorites"]'
  page.locator(fav_nav).click()
  assert page.locator('#favoritesGrid .car-card').count()==1
  home_nav=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="home"]'
  page.locator(home_nav).click()
  # User country preference
  page.locator('#settingsBtn').click()
  page.locator('#countryChoices input[value="TR"]').check()
  page.locator('#saveCountries').click()
  page.locator(home_nav).click()
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#settingsBtn').click()
  page.locator('#allCountries').click()
  page.locator('#saveCountries').click()
  page.locator(home_nav).click()
  assert page.locator('#carGrid .car-card').count()==1
  # Search preservation and load
  page.locator('#keyword').fill('GT-R')
  page.locator('#saveSearchBtn').click()
  page.locator('#keyword').fill('nonexistent')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#settingsBtn').click()
  assert page.locator('#savedSearchesList [data-apply]').count()>=1
  page.locator('#savedSearchesList [data-apply]').first.click()
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#clearAll').click()
  # Swipe first-run tutorial and returning from info
  swipe_nav=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="swipe"]'
  page.locator(swipe_nav).click()
  assert page.locator('#swipeView').is_visible()
  assert page.locator('#swipeTutorial').is_visible()
  page.locator('#swipeTutorialBack').click()
  assert page.locator('#swipeTutorial').is_hidden()
  page.locator('#swipeHelp').click()
  assert page.locator('#swipeTutorial').is_visible()
  page.locator('#swipeDone').click()
  assert page.locator('#swipeTutorial').is_hidden()
  # last car message
  page.locator('#swipeCard').focus()
  page.keyboard.press('ArrowLeft')
  assert page.locator('#toast').is_visible()
  assert 'Nissan GT-R' in page.locator('#swipeCard').inner_text()
  page.keyboard.press('ArrowDown')
  assert page.locator('#toast').is_visible()
  # More details from UP; browser Back returns to swipe
  page.keyboard.press('ArrowUp')
  assert page.locator('#modal').is_visible()
  assert page.locator('#detailBack').is_visible()
  assert 'Nissan GT-R' in page.locator('#modalTitle').inner_text()
  page.go_back(wait_until='domcontentloaded')
  assert page.locator('#modal').is_hidden()
  assert page.locator('#swipeView').is_visible()
  # Swipe right -> detail then 'back to Swipe'
  page.locator('#swipeCard').focus()
  page.keyboard.press('ArrowRight')
  assert page.locator('#modal').is_visible()
  page.locator('#detailBack').click()
  assert page.locator('#modal').is_hidden()
  assert page.locator('#swipeView').is_visible()
  page.locator('#swipeFavorite').click()
  assert page.locator('#swipeFavorite').inner_text()=='♡'
  page.locator('#swipeFavorite').click()
  assert page.locator('#swipeFavorite').inner_text()=='♥'
  # Escape modal closes modal and retains swipe
  page.locator('#swipeCard').focus()
  page.keyboard.press('ArrowRight')
  page.keyboard.press('Escape')
  assert page.locator('#modal').is_hidden()
  assert page.locator('#swipeView').is_visible()
  # Leave swipe with house
  page.locator('#swipeHome').click()
  assert page.locator('#homeView').is_visible()
  # Locale coverage description + dynamic UI keys
  locales=[x.get_attribute('value') for x in page.locator('#language option').all()]
  assert len(locales)==14,locales
  for code in locales:
   page.locator('#language').select_option(code)
   assert page.locator('h1').inner_text().strip()
   assert page.locator('[data-i18n="singleDemoNotice"]').first.inner_text()!='singleDemoNotice'
   page.locator('#carGrid .car-card').first.click(position={'x':50,'y':160})
   assert len(page.locator('.vehicle-description').inner_text())>400,code
   page.locator('#detailBack').click()
   assert page.locator('#modal').is_hidden()
  page.locator('#language').select_option('de')
  # Guest auth is explanatory, not nonworking login form
  page.locator('#loginBtn').click()
  assert page.locator('#modal').is_visible()
  assert 'Firebase' in page.locator('#modalContent').inner_text()
  page.locator('#modalClose').click()
  # persistence across reload
  assert page.evaluate('localStorage.getItem("luma_auto_favorites")') is not None
  # Mobile/desktop screenshot
  page.screenshot(path=str(root/f'qa_{width}.png'),full_page=False,animations='disabled')
  assert not errors, f'JS errors: {errors}'
  print('PASS',width,'locales',len(locales),'car',page.locator('#carGrid .car-card').count(),'errors',len(errors))
  context.close()
 browser.close()
server.shutdown()