import { test, expect } from '@playwright/test'
import path from 'node:path'

const axePath = path.join(process.cwd(), 'node_modules/axe-core/axe.min.js')

async function openAcademy(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByTestId('welcome-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('welcome-academy-open').click()
  await expect(page.getByTestId('ccna-academy')).toBeVisible()
  await page.waitForTimeout(400)
  await page.addScriptTag({ path: axePath })
}

async function audit(page: import('@playwright/test').Page, label: string) {
  const result = await page.evaluate(async () => {
    // @ts-expect-error injected by axe-core
    return await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
  }) as {
    violations: Array<{
      id: string
      impact: string | null
      nodes: Array<{ target: string[]; failureSummary: string }>
    }>
  }
  const violations = result.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  }))
  return { label, violations }
}

async function assertA11y(page: import('@playwright/test').Page, label: string) {
  const result = await audit(page, label)
  const serious = result.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
  expect(serious, `${label}: ${JSON.stringify(serious, null, 2)}`).toEqual([])
}

test('academy accessibility audit light', async ({ page }) => {
  await openAcademy(page)
  await assertA11y(page, 'home-light')

  const learnTab = page.getByTestId('academy-view-learn')
  await learnTab.focus()
  await page.keyboard.press('ArrowRight')
  const practiceTab = page.getByTestId('academy-view-practice')
  await expect(practiceTab).toBeFocused()
  await expect(practiceTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('academy-tabpanel')).toHaveAttribute('aria-labelledby', 'academy-tab-practice')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('academy-view-rescue')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(learnTab).toBeFocused()
  await expect(page.getByTestId('academy-tabpanel')).toHaveAttribute('aria-labelledby', 'academy-tab-home')

  await page.getByTestId('academy-chapter-ch1').click()
  await expect(page.getByTestId('academy-reader')).toBeVisible()
  await page.waitForTimeout(300)
  await assertA11y(page, 'reader-light')

  await page.getByTestId('academy-view-practice').click()
  await expect(page.getByTestId('academy-practice-question')).toBeVisible()
  await page.waitForTimeout(300)
  await assertA11y(page, 'practice-light')

  await page.getByTestId('academy-view-rescue').click()
  await expect(page.getByTestId('academy-rescue')).toBeVisible()
  await page.waitForTimeout(300)
  await assertA11y(page, 'rescue-light')
})

test('academy accessibility audit dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wireforge-theme', 'dark'))
  await openAcademy(page)
  await assertA11y(page, 'home-dark')

  await page.getByTestId('academy-chapter-ch1').click()
  await expect(page.getByTestId('academy-reader')).toBeVisible()
  await page.waitForTimeout(300)
  await assertA11y(page, 'reader-dark')
})
