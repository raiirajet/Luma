"""End-to-end offline Limba demo listing lifecycle on desktop and real mobile viewport."""
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
   page.locator('#demoQuick').click()
   assert page.locator('#modal').is_hidden()
   page.locator('#mobileSell' if width<500 else '#sellBtn').click()
   form=page.locator('#sellForm')
   assert form.is_visible()
   form.locator('[name="make"]').fill('Toyota')
   form.locator('[name="model"]').fill('Corolla')
   form.locator('[name="year"]').select_option('2020')
   form.locator('[name="mileage"]').fill('56000')
   form.locator('[name="power"]').fill('120')
   form.locator('[name="price"]').fill('14800')
   form.locator('[name="city"]').fill('Sarajevo')
   form.locator('[name="description"]').fill('Reliable and well maintained Toyota with a full service history.')
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid [data-edit]').count()==1
   page.locator('#mineGrid [data-edit]').click()
   form=page.locator('#sellForm')
   assert form.is_visible()
   assert form.locator('[name="city"]').input_value()=='Sarajevo'
   form.locator('[name="city"]').fill('Tirana')
   form.locator('[name="price"]').fill('14500')
   form.locator('#sellSubmit').click()
   page.locator('#modal').wait_for(state='hidden')
   assert page.locator('#mineGrid [data-edit]').count()==1
   assert page.locator('#mineGrid .car-card').first.inner_text().find('Toyota')>=0
   # Listings cannot be marked sold without a verified two-party transaction.
   assert page.locator('#mineGrid [data-status="sold"]').count()==0
   page.locator('#mineGrid [data-status="paused"]').click()
   assert page.locator('#mineGrid [data-status="active"]').count()==1
   page.locator('#mineGrid [data-status="active"]').click()
   assert page.locator('#mineGrid [data-status="paused"]').count()==1
   page.once('dialog',lambda dialog:dialog.accept())
   page.locator('#mineGrid [data-delete]').click()
   assert page.locator('#mineGrid [data-edit]').count()==0
   assert errors==[],errors
   print(f'PASS MVP {width}px: demo login, create, edit, pause, reactivate, delete')
   ctx.close()
  browser.close()
finally:
 server.shutdown()
