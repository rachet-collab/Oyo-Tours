import { chromium } from 'playwright'
const errors = []
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto('file:///home/claude/oyo-tours-portal.html')
await page.waitForTimeout(600)
await page.getByText(/admin/i).first().click().catch(()=>{})
await page.waitForTimeout(500)
const s = page.getByRole('button', { name: /sign in|log in|continue|enter/i }).first()
if (await s.count()) await s.click().catch(()=>{})
await page.waitForTimeout(600)
await page.getByText(/packages/i).first().click().catch(()=>{})
await page.waitForTimeout(600)
// find a package with multiple departures - iterate cards until Departures table has rows
const cards = page.locator('a[href^="/packages/"]')
const n = await cards.count()
for (let i=0;i<n;i++){
  await cards.nth(i).click().catch(()=>{})
  await page.waitForTimeout(600)
  const dep = page.getByRole('button', { name: 'Departures', exact: true }).first()
  if (await dep.count()){ await dep.click().catch(()=>{}); await page.waitForTimeout(400) }
  const rows = await page.locator('table tbody tr').count()
  if (rows >= 2) break
  await page.getByText(/packages/i).first().click().catch(()=>{})
  await page.waitForTimeout(500)
}
const order = await page.locator('table tbody tr td:first-child p:first-child').allInnerTexts()
console.log('Order:', order.map(t=>t.trim()).join(' | '))
const imgs = await page.locator('table tbody td img').count()
console.log('Airline logos/monograms in table cells:', imgs)
await page.screenshot({ path: '/home/claude/table.png' })
console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
