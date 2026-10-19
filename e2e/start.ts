import { expect, type Page } from '@playwright/test'

/**
 * Fresh browser contexts start on the welcome chooser instead of a seeded campus lab.
 * Load the enterprise lab through the same practice-lab path a learner would use.
 */
export async function loadEnterpriseLab(page: Page) {
  await page.goto('/')
  const welcome = page.getByTestId('welcome-dialog')
  await expect(welcome).toBeVisible({ timeout: 10_000 })
  await welcome.getByRole('button', { name: /Practice Labs/i }).click()

  const labs = page.locator('dialog.pt-training-catalog[open]')
  await expect(labs).toBeVisible()
  await labs.locator('li').filter({ hasText: 'Enterprise Dual-Core' }).getByRole('button', { name: 'Load Lab' }).click()
  await expect(labs).toBeHidden()
  await expect(page.getByRole('heading', { name: /Devices 14/i })).toBeVisible({ timeout: 10_000 })
}

/** Enter the empty workspace from the first-visit chooser. */
export async function startNewWorkspace(page: Page) {
  await page.goto('/')
  const welcome = page.getByTestId('welcome-dialog')
  await expect(welcome).toBeVisible({ timeout: 10_000 })
  await welcome.getByRole('button', { name: /^New$/ }).click()
  await expect(welcome).toBeHidden()
  await expect(page.getByRole('heading', { name: /Devices 0/i })).toBeVisible()
}
