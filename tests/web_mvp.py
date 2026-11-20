"""End-to-end offline Limba preview listing lifecycle on desktop and real mobile viewport."""
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
   if width<500:
    page.locator('.mobile-nav [data-view="account"]').click()
    page.locator('#accountSignIn').click()
   else:
    page.locator('#loginBtn').click()
    page.locator('#accountOpenBtn').click()
   assert page.locator('#demoQuick').count()==0
   page.locator('#registerCheck').check()
   page.locator('#authEmail').fill('preview-qa')
   page.locator('#authPassword').fill('local-test-password')
   page.locator('#authConfirm').fill('local-test-password')
   page.locator('#authSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#modal').is_hidden()
   add_listing=page.locator('#navSell' if width<500 else '#fabAdd')
   add_listing.click()
   form=page.locator('#sellForm')
   next_step=form.locator('[data-wizard-action="next"]')
   assert form.is_visible()
   assert form.locator('#sellSubmit').is_hidden()
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
   form.locator('[name="serviceHistory"]').fill('Service recorded at 50000 km.')
   form.locator('[name="documentNotes"]').fill('Invoices available on request.')
   form.locator('[name="fuel"]').select_option('electric')
   form.locator('[name="batteryHealth"]').fill('91.5')
   form.locator('[name="batteryMeasuredAt"]').fill('2025-01-10')
   form.locator('[name="batteryIssuer"]').fill('Independent EV service')
   form.locator('[name="batteryUrl"]').fill('https://example.test/report')
   next_step.click()
   png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/rpsAAAAASUVORK5CYII=')
   form.locator('#sellImages').set_input_files({'name':'bumper.png','mimeType':'image/png','buffer':png})
   form.locator('[name="photoKind0"]').select_option('damage')
   form.locator('[name="photoNote0"]').fill('Scratch on the rear bumper.')
   next_step.click()
   form.locator('[name="price"]').fill('14800')
   form.locator('[name="city"]').fill('Sarajevo')
   form.locator('[name="description"]').fill('Reliable and well maintained Toyota. <em data-fixture="note">Service history</em>.')
   next_step.click()
   assert 'Toyota Corolla' in form.locator('.listing-draft-preview').inner_text()
   assert form.locator('[data-fixture="note"]').count()==0
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
   assert page.get_by_text('<em data-fixture="note">Service history</em>', exact=False).is_visible()
   assert page.locator('[data-fixture="note"]').count() == 0
   assert 'Scratch on the rear bumper.' in page.locator('#detailPhotoCaption').inner_text()
   assert '91,5' in page.locator('.market-battery').inner_text()
   assert page.locator('.market-battery a').get_attribute('href')=='https://example.test/report'
   page.locator('#detailLike').click()
   page.locator('#detailBack').click()
   add_listing.click()
   form=page.locator('#sellForm')
   next_step=form.locator('[data-wizard-action="next"]')
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
   form.locator('[name="modificationNotes"]').fill('MTM tuning reported by seller.')
   next_step.click()
   next_step.click()
   form.locator('[name="price"]').fill('97000')
   form.locator('[name="city"]').fill('Zagreb')
   form.locator('[name="description"]').fill('Performance estate with a declared MTM upgrade and servicing notes.')
   next_step.click()
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid .car-card').count()==2
   page.locator('#mineGrid .car-card').first.click()
   assert 'MTM tuning' in page.locator('.limba-passport').inner_text()
   page.locator('#detailLike').click()
   page.locator('#detailBack').click()
   if width<500:
    page.locator('.mobile-nav [data-view="account"]').click()
    page.locator('#accountView [data-view="discover"]').click()
   route=('#discoverView ' if width<500 else '.main-nav ')+'[data-view="performance"]'
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
   assert page.locator('#compareImportForm').count()==0
   assert page.locator('#modalContent .compare-table').count()==1
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
   print(f'PASS MVP {width}px: local account, create, edit, sold, reactivate, delete')
   ctx.close()
  browser.close()
finally:
 server.shutdown()
