import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

const academy = (page: import('@playwright/test').Page) => page.getByTestId('ccna-academy')

async function openFromWelcome(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('welcome-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('welcome-academy-open').click()
  await expect(academy(page)).toBeVisible()
  await expect(page.getByTestId('academy-home')).toBeVisible()
}

test('reads a concept, checks understanding, persists progress, and resets cleanly', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })

  await openFromWelcome(page)

  await page.getByTestId('academy-chapter-ch1').click()
  await expect(page.getByTestId('academy-reader')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Enterprise Network Topology' })).toBeVisible()
  await expect(page.locator('.ccna-markdown')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('.ccna-markdown')).toContainText('Enterprise Network')

  await page.getByTestId('academy-check-ch1-ap-option-0').click()
  await page.getByTestId('academy-check-ch1-ap-submit').click()
  await expect(page.getByTestId('academy-check-ch1-ap-feedback')).toContainText('Correct')
  await expect(page.getByTestId('academy-check-ch1-ap')).toHaveClass(/is-correct/)

  await page.getByTestId('academy-mark-read').click()
  await expect(page.getByTestId('academy-progress')).toContainText('2%')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wirex-academy-v1') || '{}'))
  expect(saved.completedSections).toContain('1.1')
  expect(saved.correctChecks).toContain('ch1-ap')

  await page.getByTestId('academy-close').click()
  await expect(academy(page)).toBeHidden()

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="welcome-dialog"][open]')) || Boolean(document.querySelector('[data-testid="academy-open"]')), undefined, { timeout: 15_000 })
  if (await page.getByTestId('welcome-dialog').isVisible()) {
    await page.getByTestId('welcome-dialog').getByRole('button', { name: /^New$/ }).click()
  }
  await page.getByTestId('academy-open').click()
  await expect(page.getByTestId('academy-home')).toBeVisible()
  await expect(page.getByTestId('academy-continue')).toContainText('Continue reading')
  await expect(page.getByTestId('academy-progress')).toContainText('2%')

  await page.getByTestId('academy-reset').click()
  await page.getByTestId('academy-reset-confirm').click()
  await expect(page.getByTestId('academy-progress')).toContainText('0%')
  await expect(page.getByTestId('academy-continue')).toContainText('Start with Chapter 1')

  expect(browserErrors).toEqual([])
})

test('opens from the title bar, searches the course, and launches a guided lab', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByTestId('academy-open').click()
  await expect(academy(page)).toBeVisible()

  await page.getByTestId('academy-search').fill('Data Encapsulation')
  await expect(page.getByTestId('academy-search-result-1.8')).toBeVisible()
  await page.getByTestId('academy-search-result-1.8').click()
  await expect(page.getByTestId('academy-reader')).toContainText('Data Encapsulation')
  await expect(page.getByTestId('academy-open-lab')).toBeVisible()

  await page.getByTestId('academy-open-lab').click()
  await expect(academy(page)).toBeHidden()
  const training = page.getByRole('complementary', { name: 'Training' })
  await expect(training).toBeVisible()
  await expect(training).toContainText(/TCP\/IP|Encapsulation/)
})

test('opens the matching concept from the training catalog', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'Training', exact: true }).click()
  const catalog = page.locator('dialog.pt-training-catalog[open]')
  await expect(catalog).toBeVisible()
  await catalog.getByRole('button', { name: 'Read concept' }).first().click()
  await expect(catalog).toBeHidden()
  await expect(page.getByTestId('academy-reader')).toBeVisible()
  await expect(page.locator('.ccna-markdown')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByTestId('academy-open-lab')).toBeVisible()
})

test('completes a practice round and enters a rescue path', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByTestId('academy-open').click()
  await page.getByTestId('academy-view-practice').click()
  await expect(page.getByTestId('academy-practice-question')).toBeVisible()

  for (let index = 0; index < 10; index += 1) {
    await expect(page.getByTestId('academy-practice-question')).toBeVisible()
    await page.getByTestId('academy-practice-option-0').click()
    await page.getByTestId('academy-practice-submit').click()
    await expect(page.getByTestId('academy-practice-feedback')).toBeVisible()
    await page.getByTestId('academy-practice-next').click()
  }

  await expect(page.getByTestId('academy-practice-result')).toBeVisible()
  await page.getByTestId('academy-practice-rescue').click()
  await expect(page.getByTestId('academy-rescue')).toBeVisible()
  await page.getByTestId('academy-rescue-start-vlans-45').click()
  await expect(page.getByTestId('academy-rescue-checklist')).toBeVisible()
  await expect(page.getByTestId('academy-rescue-section-4.1')).toBeVisible()

  await page.getByTestId('academy-rescue-section-4.1').click()
  await expect(page.getByTestId('academy-reader')).toBeVisible()
  await page.getByTestId('academy-mark-read').click()
  await page.getByTestId('academy-view-rescue').click()
  await expect(page.getByTestId('academy-rescue-checklist')).toBeVisible()
  await expect(page.getByTestId('academy-rescue-section-4.1')).toHaveClass(/is-done/)
})

test('Arabic chrome keeps English course content LTR', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wireforge-language', 'ar'))
  await page.goto('/')
  await expect(page.getByTestId('welcome-dialog')).toBeVisible({ timeout: 10_000 })
  const welcomeArrow = await page.getByTestId('welcome-academy-open').locator('svg').getAttribute('style')
  expect(welcomeArrow).toContain('rotate(180deg)')
  await page.getByTestId('welcome-academy-open').click()
  await expect(academy(page)).toBeVisible()

  await expect(academy(page)).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('academy-view-learn')).toContainText(/[\u0600-\u06FF]/)
  await page.getByTestId('academy-view-learn').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('academy-view-practice')).toBeFocused()
  await page.getByTestId('academy-view-learn').click()
  const description = page.locator('.ccna-chapter-desc').first()
  await expect(description).toHaveAttribute('dir', 'ltr')
  await expect(description).toHaveCSS('direction', 'ltr')
  const forwardArrow = await page.locator('.ccna-action-more svg path').first().getAttribute('d')
  expect(forwardArrow).toBe('M19 12H5')

  await page.getByTestId('academy-chapter-ch1').click()
  await expect(page.locator('.ccna-markdown')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('.ccna-markdown')).toHaveCSS('direction', 'ltr')
  await expect(page.locator('.ccna-check-prompt').first()).toHaveAttribute('dir', 'ltr')
})

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the course drawer closes when a section is selected', async ({ page }) => {
    await openFromWelcome(page)
    const toggle = page.getByTestId('academy-course-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.getByTestId('academy-section-1.2').click()
    await expect(page.getByTestId('academy-reader')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const overflow = await academy(page).evaluate(element => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
