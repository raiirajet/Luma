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
base=f'http://127.0.0.1:{server.server_port}/preview.html'


def assert_header_available(page):
 widths=page.evaluate("""() => {
  const row=document.querySelector('.head-row').getBoundingClientRect();
  const actions=['brandBtn','loginBtn'];
  const clipped=actions.filter(id=>{
   const bounds=document.getElementById(id).getBoundingClientRect();
   return bounds.width>0 && (bounds.left<row.left-1 || bounds.right>row.right+1);
  });
  return {viewport:window.innerWidth,document:document.documentElement.scrollWidth,clipped};
 }""")
 assert not widths['clipped'], widths
 assert widths['document']<=widths['viewport']+2, widths
 assert page.locator('#fabAdd').is_visible()
 assert page.locator('#fabAdd').get_attribute('aria-label')
 assert not page.locator('#settingsBtn').count()
 assert not page.locator('#sellBtn').count()

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for width,height in [(1440,970),(390,844)]:
  context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=width<500,is_mobile=width<500)
  page=context.new_page()
  page.set_default_timeout(6000)
  errors=[]; page.on('pageerror',lambda err:errors.append(str(err)))
  page.route('https://upload.wikimedia.org/**',lambda route:route.abort())
  page.route('https://images.unsplash.com/**',lambda route:route.abort())
  # A real HTTP origin is required for accurate mobile viewport, touch events
  # and ES-module loading. about:blank set_content distorts mobile hit-testing.
  page.goto(base,wait_until='domcontentloaded')
  page.locator('#carGrid .car-card').first.wait_for(timeout=7000)
  assert not errors, f'Bootstrap errors: {errors}'
  assert page.locator('#carGrid .car-card').count()==1,'expected exactly one demo car'
  assert 'Nissan GT-R' in page.locator('.car-card').first.inner_text()

  # Main make, model and price controls remain visible; advanced fields remain available.
  for field in ['yearFrom', 'mileageTo', 'fuel', 'transmission']:
   assert page.locator(f'#advancedFilters #{field}').count()==1
   assert page.locator(f'#advancedFilters #{field}').is_hidden()
  for field in ['make', 'model', 'priceTo']:
   assert page.locator(f'#searchForm #{field}').is_visible()
  if width < 500:
   positions=page.evaluate("""() => {
     const fields=['make','model'];
     return Object.fromEntries(fields.map(k=>{const r=document.getElementById(k).getBoundingClientRect();return[k,{x:r.x,y:r.y,w:r.width,right:r.right}]}));
   }""")
   for left,right in [('make','model')]:
    assert abs(positions[left]['y']-positions[right]['y'])<4, (left,right,positions)
    assert positions[left]['right']<=positions[right]['x']+2, (left,right,positions)
    assert positions[left]['w']>=125 and positions[right]['w']>=125, positions
   assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2'), 'horizontal overflow'
  assert page.locator('#makeOptions option[value="Nissan"]').count()==1
  assert page.locator('#makeOptions option').count()>=400
  assert page.locator('#makeOptions option[value="Togg"]').count()==1
  assert page.locator('#makeOptions option[value="Zastava"]').count()==1
  assert page.evaluate('validCarMake("Ungewöhnliche Marke")')
  assert page.evaluate('resolveCarMake("Skoda")')=='Škoda'
  assert page.evaluate('resolveCarMake("vw")')=='Volkswagen'
  print('START',width,'cars',page.locator('.car-card').count(),'errors',errors)
  # Limba 1.5 Showroom / Passport / Borderless smoke coverage.
  assert page.locator('#showroomSpotlight').is_visible()
  assert 'Nissan' in page.locator('#showroomSpotlight').inner_text()
  assert page.locator('#showroomSpotlight [data-open]').count()==1
  page.locator('#showroomSpotlight [data-open]').click()
  assert page.locator('.limba-passport').is_visible()
  assert 'nicht geprüft' in page.locator('.limba-passport').inner_text()
  assert page.locator('#importForm').is_visible()
  assert page.locator('#importForm [name="import-mode"]').input_value()=='official'
  page.locator('#importForm [name="import-mode"]').select_option('manual')
  page.locator('#importForm [name="destination"]').select_option('CH')
  page.locator('#importForm [name="transport"]').fill('1000')
  page.locator('#importForm [name="customs"]').fill('10')
  page.locator('#importForm [name="vat"]').fill('19')
  page.locator('#importForm [name="registration"]').fill('500')
  page.locator('#importForm button[type="submit"]').click()
  assert 'Gesamtkosten' in page.locator('#importResult').inner_text()
  assert '91.999' in page.locator('#importResult').inner_text()
  official_form=page.locator('#importForm')
  official_form.locator('[name="import-mode"]').select_option('official')
  official_form.locator('[data-official-sources] time').wait_for()
  assert official_form.locator('[data-official-sources] a[href^="https://www.bazg.admin.ch/"]').count()>=1
  assert '8,1' in official_form.locator('[data-official-sources]').inner_text()
  official_form.locator('button[type="submit"]').click()
  assert page.evaluate('L("officialSubtotal")') in page.locator('#importResult').inner_text()
  assert page.evaluate('L("officialNeedsInput")') in page.locator('#importResult').inner_text()
  official_form.locator('[name="official-vatApplicable"]').select_option('yes')
  for key,value in {'transport':'1000','vatBasis':'10000','vehicleTaxBasis':'10000','otherCharges':'0','registration':'0'}.items():
   official_form.locator('[name="official-'+key+'"]').fill(value)
  official_form.locator('button[type="submit"]').click()
  assert 'Gesamtkosten' in page.locator('#importResult').inner_text()
  assert '810,00' in page.locator('#importResult').inner_text()
  assert '400,00' in page.locator('#importResult').inner_text()
  official_form.locator('[name="destination"]').select_option('GR')
  assert official_form.locator('[name="official-transport"]').input_value()==''
  assert official_form.locator('[name="official-euCirculation"]').is_visible()
  assert not official_form.locator('[name="official-euCirculation"]').is_checked()
  assert official_form.locator('[name="official-customs"]').is_visible()
  official_form.locator('[name="official-euCirculation"]').check()
  assert official_form.locator('[name="official-customs"]').is_hidden()
  official_form.locator('[name="import-mode"]').select_option('manual')
  assert official_form.locator('[name="transport"]').input_value()=='1000'
  page.locator('#detailBack').click()
  assert page.locator('#modal').is_hidden()
  perf_nav=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="performance"]'
  page.locator(perf_nav).click()
  assert page.locator('#performanceView').is_visible()
  assert page.locator('#performanceGrid .car-card').count()==0
  page.locator(('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="home"]').click()
  # The built-in catalogs open without typing and offer live narrowing.
  page.locator('[data-catalog-toggle="make"]').click()
  assert page.locator('#makeDropdown .catalog-option').count()>=400
  page.locator('#makeDropdown [data-catalog-choice="Nissan"]').click()
  assert page.locator('#make').input_value()=='Nissan'
  page.locator('[data-catalog-toggle="model"]').click()
  assert page.locator('#modelDropdown [data-catalog-choice="GT-R"]').count()==1
  page.locator('#modelDropdown [data-catalog-choice="GT-R"]').click()
  assert page.locator('#model').input_value()=='GT-R'
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#clearAll').click()
  # Exact search ranges (not just fixed coarse mileage tiers).
  page.locator('#advancedToggle').click()
  page.locator('#powerFrom').fill('551')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  page.locator('#mileageFrom').fill('49501')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  page.locator('#yearTo').select_option('2012')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  page.locator('#engineTerm').fill('V6')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#capacityFrom').fill('3801')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  page.locator('#mileageTo').fill('49499')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  # Form and dynamic filters
  page.locator('#make').fill('Nissan')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#model').fill('GT-R')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#make').fill('BMW')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#make').fill('nIs')
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#make').fill('Mercedes-Benz')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#make').press('Escape')
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
  if width<500:
   print('NAV_HITTEST',page.evaluate("""() => { const n=document.querySelector('.mobile-nav [data-view="favorites"]');const r=n.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const el=document.elementFromPoint(x,y);return {rect:[r.x,r.y,r.width,r.height],viewport:[innerWidth,innerHeight],visual:[visualViewport.width,visualViewport.height,visualViewport.offsetTop],hit:el?.outerHTML?.slice(0,160),z:getComputedStyle(n.closest('nav')).zIndex,navDisplay:getComputedStyle(n.closest('nav')).display};}"""),flush=True)
  page.locator(fav_nav).click()
  assert page.locator('#favoritesGrid .car-card').count()==1
  home_nav=('.mobile-nav ' if width<500 else '.main-nav ')+ '[data-view="home"]'
  page.locator(home_nav).click()
  # Search countries are account preferences, not duplicated on the homepage.
  assert page.locator('#searchCountryToggle').count()==0
  # User country preference
  page.locator('#loginBtn').click()
  page.locator('#accountPreferencesBtn').click()
  page.locator('#countryChoices input[value="TR"]').check()
  page.locator('#saveCountries').click()
  page.locator(home_nav).click()
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#loginBtn').click()
  page.locator('#accountPreferencesBtn').click()
  page.locator('#allCountries').click()
  page.locator('#saveCountries').click()
  page.locator(home_nav).click()
  assert page.locator('#carGrid .car-card').count()==1
  # Search preservation and load
  page.locator('#keyword').fill('GT-R')
  page.locator('#saveSearchBtn').click()
  page.locator('#keyword').fill('nonexistent')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#loginBtn').click()
  page.locator('#accountPreferencesBtn').click()
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
  assert not page.locator('#swipeFavorite').evaluate('(e) => e.classList.contains("active")')
  page.locator('#swipeFavorite').click()
  assert page.locator('#swipeFavorite').evaluate('(e) => e.classList.contains("active")')
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
   page.evaluate("""code => {const el=document.querySelector('#settingsLanguage'); el.value=code;el.dispatchEvent(new Event('change',{bubbles:true}))}""",code)
   assert_header_available(page)
   assert page.locator('#searchForm h2').inner_text().strip()
   assert page.locator('[data-i18n="singleDemoNotice"]').first.inner_text()!='singleDemoNotice'
   page.locator('#carGrid .car-card').first.click(position={'x':50,'y':160})
   assert len(page.locator('.vehicle-description').inner_text())>400,code
   page.locator('#detailBack').click()
   assert page.locator('#modal').is_hidden()
  page.evaluate("""() => {const el=document.querySelector('#settingsLanguage'); el.value='de';el.dispatchEvent(new Event('change',{bubbles:true}))}""")
  # Guest auth is explanatory, not nonworking login form
  page.locator('#loginBtn').click()
  page.locator('#accountOpenBtn').click()
  assert page.locator('#modal').is_visible()
  assert 'Firebase' in page.locator('#modalContent').inner_text()
  page.locator('#modalClose').click()
  # persistence across reload
  assert page.evaluate('localStorage.getItem("luma_auto_favorites")') is not None
  # Mobile/desktop screenshot
  page.screenshot(path=str(root/f'qa_{width}.png'),full_page=False,animations='disabled')
  assert not errors, f'JS errors: {errors}'
  print('PASS',width,'locales',len(locales),'car',page.locator('#carGrid .car-card').count(),'errors',len(errors))
  if width==1440:
   for responsive_width in [1181,1024,768,600,360,320]:
    page.set_viewport_size({'width':responsive_width,'height':844})
    assert_header_available(page)
   page.locator('#fabAdd').click()
   assert page.locator('#modal').is_visible()
   page.locator('#modalClose').click()
   page.locator('#loginBtn').click()
  page.locator('#accountPreferencesBtn').click()
   assert page.locator('#settingsLanguage').is_visible()
  context.close()
 browser.close()
server.shutdown()
