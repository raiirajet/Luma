"""End-to-end offline Limba demo listing lifecycle on desktop and real mobile viewport."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64
import functools
import threading

root=Path(__file__).resolve().parents[1]
handler=functools.partial(SimpleHTTPRequestHandler,directory=str(root))
server=ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True,args=['--no-sandbox'])
  for width,height in ((1440,900),(390,844)):
   ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<500)
   page=ctx.new_page()
   page.set_default_timeout(7000)
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/preview.html',wait_until='domcontentloaded')
   page.locator('#carGrid .car-card').first.wait_for()
   page.locator('#loginBtn').click()
   page.locator('#accountOpenBtn').click()
   page.locator('#demoQuick').click()
   assert page.locator('#modal').is_hidden()
   page.locator('#fabAdd').click()
   form=page.locator('#sellForm')
   assert form.is_visible()
   form.locator('[data-catalog-toggle="sellMake"]').click()
   assert form.locator('#sellMakeDropdown [data-catalog-choice="Toyota"]').count()==1
   form.locator('#sellMakeDropdown [data-catalog-choice="Toyota"]').click()
   form.locator('[data-catalog-toggle="sellModel"]').click()
   assert form.locator('#sellModelDropdown [data-catalog-choice="Corolla"]').count()==1
   form.locator('#sellModelDropdown [data-catalog-choice="Corolla"]').click()
   form.locator('[name="year"]').select_option('2020')
   form.locator('[name="mileage"]').fill('56000')
   form.locator('[name="power"]').fill('120')
   form.locator('[name="engineName"]').fill('2.0 Hybrid')
   form.locator('[name="engineCapacity"]').fill('1987')
   form.locator('[name="price"]').fill('14800')
   form.locator('[name="city"]').fill('Sarajevo')
   form.locator('[name="description"]').fill('Reliable and well maintained Toyota with a full service history.')
   form.locator('[name="serviceHistory"]').fill('Service recorded at 50000 km.')
   form.locator('[name="documentNotes"]').fill('Invoices available on request.')
   form.locator('[name="fuel"]').select_option('electric')
   form.locator('[name="batteryHealth"]').fill('91.5')
   form.locator('[name="batteryMeasuredAt"]').fill('2025-01-10')
   form.locator('[name="batteryIssuer"]').fill('Independent EV service')
   form.locator('[name="batteryUrl"]').fill('https://example.test/report')
   png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/rpsAAAAASUVORK5CYII=')
   form.locator('#sellImages').set_input_files({'name':'bumper.png','mimeType':'image/png','buffer':png})
   form.locator('[name="photoKind0"]').select_option('damage')
   form.locator('[name="photoNote0"]').fill('Scratch on the rear bumper.')
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid [data-edit]').count()==1
   page.locator('#mineGrid [data-edit]').click()
   form=page.locator('#sellForm')
   assert form.is_visible()
   assert form.locator('[name="city"]').input_value()=='Sarajevo'
   assert '50000' in form.locator('[name="serviceHistory"]').input_value()
   assert form.locator('[name="photoNote0"]').input_value()=='Scratch on the rear bumper.'
   assert form.locator('[name="batteryHealth"]').input_value()=='91.5'
   form.locator('[name="city"]').fill('Tirana')
   form.locator('[name="price"]').fill('14500')
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid [data-edit]').count()==1
   assert page.locator('#mineGrid .car-card').first.inner_text().find('Toyota')>=0
   page.locator('#mineGrid .car-card').first.click()
   assert '50000' in page.locator('.limba-passport').inner_text()
   assert 'Scratch on the rear bumper.' in page.locator('#detailPhotoCaption').inner_text()
   assert '91,5' in page.locator('.market-battery').inner_text()
   assert page.locator('.market-battery a').get_attribute('href')=='https://example.test/report'
   page.locator('#detailLike').click()
   page.locator('#detailBack').click()
   page.locator('#fabAdd').click()
   form=page.locator('#sellForm')
   form.locator('[name="make"]').fill('Audi')
   form.locator('[name="make"]').press('Escape')
   form.locator('[name="model"]').fill('RS6')
   form.locator('[name="model"]').press('Escape')
   form.locator('[name="modelExtension"]').fill('MTM')
   form.locator('[name="year"]').select_option('2021')
   form.locator('[name="mileage"]').fill('33000')
   form.locator('[name="power"]').fill('700')
   form.locator('[name="engineName"]').fill('4.0 V8 Biturbo')
   form.locator('[name="engineCapacity"]').fill('3996')
   form.locator('[name="price"]').fill('97000')
   form.locator('[name="city"]').fill('Zagreb')
   form.locator('[name="description"]').fill('Performance estate with a declared MTM upgrade and servicing notes.')
   form.locator('[name="modificationNotes"]').fill('MTM tuning reported by seller.')
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid .car-card').count()==2
   page.locator('#mineGrid .car-card').first.click()
   assert 'MTM tuning' in page.locator('.limba-passport').inner_text()
   page.locator('#detailLike').click()
   page.locator('#detailBack').click()
   route=('.mobile-nav ' if width<500 else '.main-nav ')+'[data-view="performance"]'
   page.locator(route).click()
   assert page.locator('#performanceGrid .car-card').count()==1
   route=('.mobile-nav ' if width<500 else '.main-nav ')+'[data-view="favorites"]'
   page.locator(route).click()
   assert page.locator('#favoritesGrid .garage-pick').count()==2
   page.locator('#favoritesGrid [data-garage-pick]').nth(0).check()
   page.locator('#favoritesGrid [data-garage-pick]').nth(1).check()
   assert page.locator('[data-compare-open]').is_enabled()
   page.locator('[data-compare-open]').click()
   assert 'Toyota' in page.locator('#modalContent').inner_text()
   assert 'Audi' in page.locator('#modalContent').inner_text()
   comparison=page.locator('#compareImportForm')
   assert comparison.locator('[name="import-mode"]').input_value()=='official'
   comparison.locator('[name="import-mode"]').select_option('manual')
   comparison.locator('[name="destination"]').select_option('CH')
   comparison.locator('[name="transport-0"]').fill('1000')
   comparison.locator('[name="transport-1"]').fill('1000')
   comparison.locator('button[type="submit"]').click()
   totals=page.locator('#compareImportResult .import-total').inner_text()
   assert '15.500' in totals and '98.000' in totals,totals
   assert comparison.locator('[name="destination"] option').count()==14
   comparison.locator('[name="import-mode"]').select_option('official')
   comparison.locator('[data-official-sources] time').wait_for()
   comparison.locator('[name="official-vatApplicable-0"]').select_option('yes')
   for key,value in {'transport':'1000','vatBasis':'10000','vehicleTaxBasis':'10000','otherCharges':'0','registration':'0'}.items():
    comparison.locator('[name="official-'+key+'-0"]').fill(value)
   comparison.locator('button[type="submit"]').click()
   rows=page.locator('#compareImportResult')
   assert page.evaluate('L("officialNeedsInput")') in rows.inner_text()
   assert page.evaluate('L("officialSubtotal")') in rows.locator('.import-total').inner_text()
   assert 'Gesamtkosten' in rows.locator('.import-total small').inner_text()
   page.locator('#modalClose').click()
   page.evaluate('showView("mine")')
   page.locator('#mineGrid .my-car-item').first.locator('[data-status="sold"]').click()
   assert page.locator('#mineGrid .my-car-item').first.locator('[data-status="active"]').count()==1
   page.locator('#mineGrid .my-car-item').first.locator('[data-status="active"]').click()
   assert page.locator('#mineGrid .my-car-item').first.locator('[data-status="sold"]').count()==1
   page.once('dialog',lambda dialog:dialog.accept())
   page.locator('#mineGrid [data-delete]').first.click()
   assert page.locator('#mineGrid [data-edit]').count()==1
   page.once('dialog',lambda dialog:dialog.accept())
   page.locator('#mineGrid [data-delete]').first.click()
   assert page.locator('#mineGrid [data-edit]').count()==0
   assert errors==[],errors
   print(f'PASS MVP {width}px: demo login, create, edit, sold, reactivate, delete')
   ctx.close()
  browser.close()
finally:
 server.shutdown()
