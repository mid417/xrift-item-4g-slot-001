import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
await page.screenshot({ path: '.tmp/reels-current-front.png' })
await browser.close()
