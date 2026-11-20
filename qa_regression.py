from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, functools
from datetime import date
from pathlib import Path

root=Path(__file__).resolve().parent
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self, *_): pass
handler=functools.partial(Quiet,directory=str(root))
server=ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/preview.html'


def navigation(page, view):
 mobile = page.locator('.mobile-nav').is_visible()
 if view == 'favorites':
  if mobile:
   page.locator('.mobile-nav [data-view="account"]').click()
   page.locator('#accountView [data-view="favorites"]').click()
  else:
   page.locator('#loginBtn').click()
   page.locator('#accountMenu [data-view="favorites"]').click()
 else:
  route = '.mobile-nav' if mobile else '.main-nav'
  page.locator(f'{route} [data-view="{view}"]').click()


def account_action(page, action):
 if page.locator('.mobile-nav').is_visible():
  navigation(page,'account')
  page.locator('#accountSignIn' if action=='sign_in' else '#accountView [data-view="settings"]').click()
 else:
  page.locator('#loginBtn').click()
  page.locator('#accountOpenBtn' if action=='sign_in' else '#accountPreferencesBtn').click()


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
 if page.locator('.mobile-nav').is_visible():
  assert page.locator('#navSell').is_visible()
  assert page.locator('#navSell').inner_text().strip()
  assert page.locator('#headerSell').is_hidden()
 else:
  assert page.locator('#headerSell').is_visible()
  assert page.locator('#headerSell').inner_text()
 assert not page.locator('#settingsBtn').count()
 assert not page.locator('#sellBtn').count()


def assert_country_strip(page):
 bounds=page.locator('#countryQuick').evaluate("""strip => {
  const bar=document.getElementById('countryBar').getBoundingClientRect();
  const rect=strip.getBoundingClientRect();
  const chips=[...strip.querySelectorAll('[data-country-quick]')].map(chip => chip.getBoundingClientRect());
  return {viewport:window.innerWidth, document:document.documentElement.scrollWidth,
    barLeft:bar.left, barRight:bar.right, stripLeft:rect.left, stripRight:rect.right,
    width:strip.clientWidth, content:strip.scrollWidth, overflow:getComputedStyle(strip).overflowX, chips:chips.length,
    rows:new Set(chips.map(chip => Math.round(chip.top))).size};
 }""")
 assert bounds['barLeft']>=-1 and bounds['barRight']<=bounds['viewport']+1, bounds
 assert bounds['stripLeft']>=bounds['barLeft']-1 and bounds['stripRight']<=bounds['barRight']+1, bounds
 assert bounds['chips']>1 and bounds['rows']==1, bounds
 assert bounds['content']>bounds['width'] and bounds['overflow'] in ('auto','scroll'), bounds
 assert bounds['document']<=bounds['viewport']+2, bounds


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
  for field in ['yearFrom', 'mileageTo', 'fuel', 'transmission', 'body']:
   assert page.locator(f'#advancedFilters #{field}').count()==1
   assert page.locator(f'#advancedFilters #{field}').is_hidden()
  for field in ['make', 'model', 'priceTo', 'keyword']:
   assert page.locator(f'#searchForm #{field}').is_visible()
  assert not page.locator('#advancedFilters #keyword, #bodyQuick, #heroCount').count()
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
   assert_country_strip(page)
  assert page.locator('#makeOptions option[value="Nissan"]').count()==1
  assert page.locator('#makeOptions option').count()>=400
  assert page.locator('#makeOptions option[value="Togg"]').count()==1
  assert page.locator('#makeOptions option[value="Zastava"]').count()==1
  assert page.evaluate('validCarMake("Ungewöhnliche Marke")')
  assert page.evaluate('resolveCarMake("Skoda")')=='Škoda'
  assert page.evaluate('resolveCarMake("vw")')=='Volkswagen'
  print('START',width,'cars',page.locator('.car-card').count(),'errors',errors)
  # Showroom and Passport remain without country-based tax estimates.
  assert page.locator('#showroomSpotlight').is_visible()
  assert 'Nissan' in page.locator('#showroomSpotlight').inner_text()
  assert page.locator('#showroomSpotlight [data-open]').count()==1
  page.locator('#showroomSpotlight [data-open]').click()
  assert page.locator('.limba-passport').is_visible()
  assert 'nicht geprüft' in page.locator('.limba-passport').inner_text()
  assert page.locator('#importForm').count()==0
  assert page.locator('#compareImportForm').count()==0
  assert page.locator('.borderless-box').count()==0
  page.locator('#detailBack').click()
  assert page.locator('#modal').is_hidden()
  navigation(page,'performance')
  assert page.locator('#performanceView').is_visible()
  assert page.locator('#performanceGrid .car-card').count()==0
  navigation(page,'home')
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
  page.locator('#body').select_option('suv')
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
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
  page.locator('#carGrid .card-details').click()
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
  favorite = page.locator('#carGrid .card-heart')
  favorite.evaluate("button => button.scrollIntoView({block:'center',behavior:'instant'})")
  favorite.click()
  navigation(page,'favorites')
  assert page.locator('#favoritesGrid .car-card').count()==1
  navigation(page,'home')
  # The remaining shortcuts share the regular country selection.
  assert page.locator('#homeView #searchForm').is_visible()
  assert not page.locator('#countryQuick [data-country-quick="MK"], #countryQuick [data-country-quick="XK"]').count()
  page.locator('#countryQuick [data-country-quick="TR"]').click()
  assert page.locator('#countryQuick [data-country-quick="TR"]').get_attribute('aria-pressed')=='true'
  assert page.locator('#emptyResults').is_visible()
  assert not page.locator('#emptyResults [data-empty-country]').count()
  assert page.locator('#emptySuggestions button').count()==1
  assert page.locator('#emptyPerformance').is_visible()
  page.locator('#quickAllCountries').click()
  assert page.locator('#countryQuick [data-country-quick="TR"]').get_attribute('aria-pressed')=='false'
  assert page.locator('#carGrid .car-card').count()==1
  # Both entry points open the same dialog, with changes staged until apply.
  dialog = page.locator('dialog#searchCountryPanel')
  form_countries = page.locator('#searchCountryToggle')
  result_countries = page.locator('#resultCountries')
  form_countries.press('Enter')
  assert dialog.is_visible()
  page.locator('#countryChoices input[value="MK"]').check()
  assert page.locator('#carGrid .car-card').count()==1
  page.keyboard.press('Escape')
  dialog.wait_for(state='hidden')
  assert form_countries.evaluate('(button) => button === document.activeElement')
  assert page.locator('#carGrid .car-card').count()==1
  result_countries.click()
  assert dialog.is_visible()
  assert not page.locator('#countryChoices input:checked').count()
  page.locator('#countryChoices input[value="XK"]').check()
  page.locator('#cancelCountries').click()
  assert dialog.is_hidden()
  assert page.locator('#carGrid .car-card').count()==1
  form_countries.click()
  assert not page.locator('#countryChoices input:checked').count()
  for country in ('MK', 'XK'):
   page.locator(f'#countryChoices input[value="{country}"]').check()
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#applyCountries').click()
  assert dialog.is_hidden()
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#saveSearchBtn').click()
  result_countries.click()
  page.locator('#allCountries').click()
  assert dialog.is_hidden()
  assert page.locator('#carGrid .car-card').count()==1
  account_action(page,'settings')
  assert page.locator('#settingsView').is_visible()
  assert page.locator('#settingsView #countryChoices').count()==0
  page.locator('#savedSearchesList [data-apply]').first.click()
  assert page.locator('#emptyResults').is_visible()
  form_countries.click()
  for country in ('MK', 'XK'):
   assert page.locator(f'#countryChoices input[value="{country}"]').is_checked()
  page.locator('#cancelCountries').click()
  page.locator('#emptyPerformance').click()
  assert page.locator('#performanceView').is_visible()
  navigation(page,'home')
  # Search preservation and load
  page.locator('#keyword').fill('GT-R')
  page.locator('#saveSearchBtn').click()
  page.locator('#keyword').fill('nonexistent')
  assert page.locator('#carGrid .car-card').count()==0
  account_action(page,'settings')
  assert page.locator('#savedSearchesList [data-apply]').count()>=1
  page.locator('#savedSearchesList [data-apply]').first.click()
  assert page.locator('#carGrid .car-card').count()==1
  page.locator('#clearAll').click()
  # The display currency is approximate. EUR remains the search currency.
  page.route('https://api.frankfurter.dev/**', lambda route: route.fulfill(json=[
   {'quote':'CHF','base':'EUR','date':date.today().isoformat(),'rate':0.92}
  ]))
  page.locator('#displayCurrency').select_option('CHF')
  page.locator('#carGrid .car-price').filter(has_text='CHF').wait_for()
  assert 'Frankfurter' in page.locator('#exchangeRateStatus').inner_text()
  assert '(€)' in page.locator('label').filter(has=page.locator('#priceTo')).inner_text()
  page.locator('#displayCurrency').select_option('EUR')
  # Swipe first-run tutorial and returning from info
  navigation(page,'swipe')
  assert page.locator('#swipeView').is_visible()
  assert page.locator('#swipeTutorial').is_visible()
  assert page.locator('#swipeTutorial [data-gesture]').count()==4
  page.locator('#swipeTutorialBack').click()
  assert page.locator('#swipeTutorial').is_hidden()
  page.locator('#swipeHelp').click()
  assert page.locator('#swipeTutorial').is_visible()
  page.locator('#swipeDone').click()
  assert page.locator('#swipeTutorial').is_hidden()
  assert page.locator('#swipeActions button').count()==4
  page.locator('#swipeInfo').click()
  assert page.locator('#modal').is_visible()
  page.locator('#detailBack').click()
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
   page.locator('#carGrid .car-card').first.click(position={'x':50,'y':160})
   assert len(page.locator('.vehicle-description').inner_text())>400,code
   page.locator('#detailBack').click()
   assert page.locator('#modal').is_hidden()
  page.evaluate("""() => {const el=document.querySelector('#settingsLanguage'); el.value='de';el.dispatchEvent(new Event('change',{bubbles:true}))}""")
  # The current search and appearance are restored when the marketplace reloads.
  page.locator('#priceTo').fill('5000')
  page.locator('#sort').select_option('priceLow')
  page.reload(wait_until='domcontentloaded')
  assert page.locator('#priceTo').input_value()=='5000'
  assert page.locator('#sort').input_value()=='priceLow'
  assert page.locator('#carGrid .car-card').count()==0
  page.locator('#clearAll').click()
  account_action(page,'settings')
  page.locator('#settingsTheme').select_option('dark')
  page.reload(wait_until='domcontentloaded')
  assert page.locator('html').get_attribute('data-theme')=='dark'
  assert page.locator('html').evaluate('(root) => getComputedStyle(root).colorScheme')=='dark'
  account_action(page,'settings')
  assert page.locator('#settingsTheme').input_value()=='dark'
  page.locator('#settingsTheme').select_option('system')
  navigation(page,'home')
  # Standalone previews support local accounts without preset credentials
  account_action(page,'sign_in')
  assert page.locator('#modal').is_visible()
  assert page.locator('#authForm').is_visible()
  assert page.locator('#demoQuick').count()==0
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
    if responsive_width<=390:
     navigation(page,'home')
     assert_country_strip(page)
   page.locator('#navSell').click()
   assert page.locator('#modal').is_visible()
   page.locator('#modalClose').click()
   account_action(page,'settings')
   assert page.locator('#settingsLanguage').is_visible()
  context.close()
 browser.close()
server.shutdown()
