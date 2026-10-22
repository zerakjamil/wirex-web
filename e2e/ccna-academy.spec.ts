import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

const academy = (page: import('@playwright/test').Page) => page.getByTestId('ccna-academy')

async function runTrainingCommands(page: import('@playwright/test').Page, deviceId: string, commands: readonly string[]) {
  const dock = page.locator('.pt-training-dock')
  await dock.locator('select').selectOption(deviceId)
  const input = dock.getByLabel('Cisco Terminal Command Input')
  await expect(input).toBeVisible()
  for (const command of commands) {
    await input.fill(command)
    await input.press('Enter')
    await expect(input).toHaveValue('')
  }
}

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
  const opener = page.getByTestId('academy-open')
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(academy(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(academy(page)).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.click()
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

test('starts the 14-task practical exam from the Academy', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByTestId('academy-open').click()
  await page.getByTestId('academy-view-practice').click()
  await expect(page.getByTestId('academy-practice-practical')).toBeVisible()
  await expect(page.getByTestId('academy-practical-start')).toBeVisible()

  await page.getByTestId('academy-practical-start').click()
  await expect(page.getByTestId('ccna-academy')).toBeHidden()
  await expect(page.getByTestId('training-practical-score')).toBeVisible()
  await expect(page.locator('.pt-training-panel .pt-task-list li')).toHaveCount(14)
  await expect(page.getByTestId('training-practical-score')).toContainText('0 / 14')

  await page.getByTestId('training-exam-return').click()
  await expect(page.getByTestId('ccna-academy')).toBeVisible()
  await expect(page.getByTestId('academy-practice-practical')).toBeVisible()
})

test('configures the practical exam through the real CLI and returns 14/14', async ({ page }) => {
  test.setTimeout(120_000)
  await startNewWorkspace(page)
  await page.getByTestId('academy-open').click()
  await page.getByTestId('academy-view-practice').click()
  await page.getByTestId('academy-practical-start').click()

  const dock = page.locator('.pt-training-dock')
  await expect(dock).toBeVisible()
  const common = ['enable', 'configure terminal', 'vlan 10', 'name Sales', 'exit', 'vlan 20', 'name Management', 'exit', 'vlan 30', 'name Admin', 'exit']
  await runTrainingCommands(page, 'exam-sw-a', [...common,
    'interface range fa0/1-2', 'switchport mode access', 'switchport access vlan 10', 'exit',
    'interface fa0/3', 'switchport mode access', 'switchport access vlan 20', 'exit',
    'interface fa0/4', 'switchport mode access', 'switchport access vlan 30', 'exit',
    'interface range gi0/1-2', 'switchport mode trunk', 'channel-group 1 mode active', 'exit',
    'interface fa0/24', 'switchport mode trunk', 'exit',
  ])
  await runTrainingCommands(page, 'exam-sw-b', [...common,
    'interface fa0/1', 'switchport mode access', 'switchport access vlan 10', 'exit',
    'interface fa0/3', 'switchport mode access', 'switchport access vlan 20', 'exit',
    'interface range gi0/1-2', 'switchport mode trunk', 'channel-group 1 mode active', 'exit',
  ])
  await runTrainingCommands(page, 'exam-router', [
    'enable', 'configure terminal', 'interface gi0/0', 'no shutdown', 'exit',
    'interface gi0/0.10', 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0', 'exit',
    'interface gi0/0.20', 'encapsulation dot1q 20', 'ip address 192.168.20.1 255.255.255.0', 'exit',
    'interface gi0/0.30', 'encapsulation dot1q 30', 'ip address 192.168.30.1 255.255.255.0', 'exit',
  ])
  await runTrainingCommands(page, 'exam-sw-a', ['spanning-tree vlan 10 root primary', 'spanning-tree vlan 20 root primary', 'spanning-tree vlan 30 root primary'])

  await page.getByRole('button', { name: 'Check my work', exact: true }).click()
  await expect(page.getByTestId('training-practical-score')).toContainText('13 / 14')
  await page.getByRole('button', { name: 'Test traffic', exact: true }).click()
  await expect(page.getByText(/Last test: Successful/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Check my work', exact: true }).click()
  await expect(page.getByTestId('training-practical-score')).toContainText('14 / 14')

  await page.getByTestId('training-exam-return').click()
  await expect(page.getByTestId('academy-practice-practical')).toBeVisible()
  await expect(page.locator('.ccna-exam-scorebar')).toContainText('14 / 14')
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

test('shows the full LACP walkthrough and configures both switch ends', async ({ page }) => {
  test.setTimeout(120_000)
  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'Training', exact: true }).click()
  const catalog = page.locator('dialog.pt-training-catalog[open]')
  await expect(catalog).toBeVisible()
  const card = catalog.locator('li').filter({ has: page.getByRole('heading', { name: 'EtherChannel: bundle the uplinks' }) })
  await card.getByText('Lesson context').click()
  await expect(card).toContainText('EtherChannel bundles parallel switch links')
  await card.getByRole('button', { name: 'Start lesson' }).click()

  const panel = page.getByRole('complementary', { name: 'Training' })
  await expect(panel).toContainText('EtherChannel bundles parallel switch links')
  await panel.getByText('Full configuration walkthrough').click()
  await expect(panel.locator('.pt-lesson-guide')).toContainText('Distribution-A Gi0/1')
  await expect(panel.locator('.pt-lesson-guide pre').first()).toContainText('channel-group 1 mode active')
  await expect(panel.locator('.pt-guide-expected pre')).toContainText('Po1(SU)')
  await panel.getByRole('button', { name: 'Hint', exact: true }).click()
  await panel.getByRole('button', { name: 'Hint', exact: true }).click()
  await panel.getByRole('button', { name: 'Reveal command', exact: true }).click()
  const hintCommands = panel.getByTestId('training-hint-commands')
  await expect(hintCommands).toContainText('channel-group 1 mode active')
  await expect(hintCommands).not.toContainText('! Distribution-B')
  await panel.getByRole('button', { name: /Use this device: Distribution-A/ }).first().click()

  const common = ['enable', 'configure terminal', 'vlan 10', 'name Sales', 'exit',
    'interface fa0/1', 'switchport mode access', 'switchport access vlan 10', 'exit',
    'interface range gi0/1-2', 'switchport mode trunk', 'channel-group 1 mode active', 'exit']
  await runTrainingCommands(page, 'campus-sw-a', common)
  await runTrainingCommands(page, 'campus-sw-b', common)
  await panel.getByRole('button', { name: 'Test traffic', exact: true }).click()
  await expect(panel.getByText(/Last test: Successful/)).toBeVisible({ timeout: 30_000 })
  await panel.getByRole('button', { name: 'Check my work', exact: true }).click()
  await expect(panel.getByText('Completed', { exact: true })).toBeVisible()
})

test('completes a practice round and enters a rescue path', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByTestId('academy-open').click()
  await page.getByTestId('academy-view-practice').click()
  await expect(page.getByTestId('academy-practice-practical')).toBeVisible()
  await page.getByTestId('academy-practice-tab-theory').click()
  await expect(page.getByTestId('academy-practice-question')).toBeVisible()

  for (let index = 0; index < 10; index += 1) {
    await expect(page.getByTestId('academy-practice-question')).toBeVisible()
    await page.getByTestId('academy-practice-option-0').click()
    await page.getByTestId('academy-practice-submit').click()
    await expect(page.getByTestId('academy-practice-feedback')).toBeVisible()
    await page.getByTestId('academy-practice-next').click()
  }

  await expect(page.getByTestId('academy-practice-result')).toBeVisible()
  await expect(page.getByTestId('academy-practice-result').getByRole('heading', { level: 1 })).toBeFocused()
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
    await expect(page.getByTestId('academy-reader').getByRole('heading', { level: 1 })).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const overflow = await academy(page).evaluate(element => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
