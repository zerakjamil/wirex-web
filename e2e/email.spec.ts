import { test, expect } from '@playwright/test'
import { parseWorkspace } from '../src/simulator/workspaceSchema'

function createEmailLab() {
  const pc = (id: string, name: string, ip: string, switchPortId: string, linkId: string) => ({
    id, name, type: 'pc', model: 'PC-PT', x: id === 'alice-pc' ? 160 : 480, y: 180, power: true, modules: [],
    ports: [{ id: `${id}-eth0`, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', ipAddress: ip, subnetMask: '255.255.255.0', macAddress: id === 'alice-pc' ? '02:00:00:00:20:10' : '02:00:00:00:20:11', status: 'up', adminStatus: 'up', connectedLinkId: linkId, connectedDeviceId: 'email-switch', connectedPortId: switchPortId }],
    config: { hostname: name.replaceAll(' ', ''), vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  })
  const server = {
    id: 'mail-server', name: 'Class Mail Server', type: 'server', model: 'Server-PT', x: 800, y: 180, power: true, modules: [],
    ports: [{ id: 'mail-server-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', ipAddress: '192.0.2.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:20:20', status: 'up', adminStatus: 'up', connectedLinkId: 'mail-link-2', connectedDeviceId: 'email-switch', connectedPortId: 'switch-server' }],
    config: { hostname: 'ClassMailServer', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const emailSwitch = {
    id: 'email-switch', name: 'Email Lab Switch', type: 'switch', model: '2960-24TT', x: 480, y: 360, power: true, modules: [],
    ports: [
      { id: 'switch-alice', name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', macAddress: '02:00:00:00:20:31', status: 'up', adminStatus: 'up', connectedLinkId: 'mail-link-0', connectedDeviceId: 'alice-pc', connectedPortId: 'alice-pc-eth0' },
      { id: 'switch-bob', name: 'FastEthernet0/2', shortName: 'Fa0/2', type: 'fastethernet', macAddress: '02:00:00:00:20:32', status: 'up', adminStatus: 'up', connectedLinkId: 'mail-link-1', connectedDeviceId: 'bob-pc', connectedPortId: 'bob-pc-eth0' },
      { id: 'switch-server', name: 'FastEthernet0/3', shortName: 'Fa0/3', type: 'fastethernet', macAddress: '02:00:00:00:20:33', status: 'up', adminStatus: 'up', connectedLinkId: 'mail-link-2', connectedDeviceId: 'mail-server', connectedPortId: 'mail-server-eth0' },
    ],
    config: { hostname: 'EmailLabSwitch', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const devices = [pc('alice-pc', 'Alice PC', '192.0.2.10', 'switch-alice', 'mail-link-0'), pc('bob-pc', 'Bob PC', '192.0.2.11', 'switch-bob', 'mail-link-1'), emailSwitch, server]
  const links = [
    { id: 'mail-link-0', type: 'straight', status: 'up', fromDeviceId: 'alice-pc', fromPortId: 'alice-pc-eth0', toDeviceId: 'email-switch', toPortId: 'switch-alice' },
    { id: 'mail-link-1', type: 'straight', status: 'up', fromDeviceId: 'bob-pc', fromPortId: 'bob-pc-eth0', toDeviceId: 'email-switch', toPortId: 'switch-bob' },
    { id: 'mail-link-2', type: 'straight', status: 'up', fromDeviceId: 'email-switch', fromPortId: 'switch-server', toDeviceId: 'mail-server', toPortId: 'mail-server-eth0' },
  ]
  return { version: 1, fileName: 'Email acceptance', devices, links, annotations: [] }
}

test('Server-PT SMTP delivery and POP3 inbox work from the Desktop email app', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })
  page.on('pageerror', error => browserErrors.push(error.message))
  const lab = Buffer.from(JSON.stringify(parseWorkspace(createEmailLab())), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /Class Mail Server Server-PT/i })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: /Class Mail Server Server-PT/i }).click()
  let window = page.locator('.pt-device-window').filter({ hasText: 'Class Mail Server' })
  await window.getByRole('tab', { name: 'Services', exact: true }).click()
  await window.locator('[data-service="email"]').click()
  await window.getByLabel('Mail domain').fill('classroom.test')
  await window.getByRole('button', { name: 'Save domain', exact: true }).click()
  await window.getByLabel('Enable SMTP (TCP 25)').check()
  await window.getByLabel('Enable POP3 (TCP 110)').check()
  for (const name of ['alice', 'bob']) {
    await window.getByLabel('Mailbox username').fill(name)
    await window.getByLabel('Mailbox password').fill('lab-secret')
    await window.getByRole('button', { name: 'Add mailbox', exact: true }).click()
  }
  await expect(window.getByText('alice@classroom.test')).toBeVisible()
  await expect(window.getByText('bob@classroom.test')).toBeVisible()
  await window.getByRole('button', { name: 'Close Class Mail Server' }).click()

  await page.getByRole('button', { name: /Alice PC PC-PT/i }).click()
  window = page.locator('.pt-device-window').filter({ hasText: 'Alice PC' })
  await window.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await window.getByRole('button', { name: 'Email', exact: true }).click()
  await window.getByLabel('Display name', { exact: true }).fill('Alice Student')
  await window.getByLabel('Email address', { exact: true }).fill('alice@classroom.test')
  await window.getByLabel('Mailbox username', { exact: true }).fill('alice')
  await window.getByLabel('Mailbox password', { exact: true }).fill('lab-secret')
  await window.getByLabel('Incoming mail server', { exact: true }).fill('192.0.2.20')
  await window.getByLabel('Outgoing mail server', { exact: true }).fill('192.0.2.20')
  await window.getByRole('button', { name: 'Save account', exact: true }).click()
  await window.getByLabel('To', { exact: true }).fill('bob@classroom.test')
  await window.getByLabel('Subject', { exact: true }).fill('VLAN lab result')
  await window.locator('textarea').fill('PC-to-server routing works over SMTP.')
  await window.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(window.getByRole('status').filter({ hasText: 'Email sent' })).toBeVisible({ timeout: 15000 })
  await window.getByLabel('Subject', { exact: true }).fill('A second note')
  await window.locator('textarea').fill('This note tests the selected mailbox message.')
  await window.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(window.getByRole('status').filter({ hasText: 'Email sent' })).toBeVisible({ timeout: 15000 })
  await window.getByRole('button', { name: 'Close Alice PC' }).click()

  await page.getByRole('button', { name: /Bob PC PC-PT/i }).click()
  window = page.locator('.pt-device-window').filter({ hasText: 'Bob PC' })
  await window.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await window.getByRole('button', { name: 'Email', exact: true }).click()
  await window.getByLabel('Display name', { exact: true }).fill('Bob Student')
  await window.getByLabel('Email address', { exact: true }).fill('bob@classroom.test')
  await window.getByLabel('Mailbox username', { exact: true }).fill('bob')
  await window.getByLabel('Mailbox password', { exact: true }).fill('lab-secret')
  await window.getByLabel('Incoming mail server', { exact: true }).fill('192.0.2.20')
  await window.getByLabel('Outgoing mail server', { exact: true }).fill('192.0.2.20')
  await window.getByRole('button', { name: 'Save account', exact: true }).click()
  const pop3CheckStartedAt = Date.now()
  await window.getByRole('button', { name: /Check mail/i }).click()
  await expect(window.getByRole('status').filter({ hasText: 'Mail retrieved' })).toBeVisible({ timeout: 45000 })
  const pop3CheckDuration = Date.now() - pop3CheckStartedAt
  test.info().annotations.push({ type: 'POP3 inbox retrieval duration ms', description: String(pop3CheckDuration) })
  expect(pop3CheckDuration).toBeLessThan(15_000)
  await expect(window.getByRole('article').getByText('VLAN lab result', { exact: true })).toBeVisible()
  await expect(window.getByRole('article').getByText('PC-to-server routing works over SMTP.')).toBeVisible()

  await window.getByRole('button', { name: 'Delete from server', exact: true }).click()
  await expect(window.getByText('Delete this message from the server? Your downloaded inbox copy will remain.')).toBeVisible()
  await window.getByRole('button', { name: /A second note/ }).click()
  await expect(window.getByText('Delete this message from the server? Your downloaded inbox copy will remain.')).toHaveCount(0)
  await expect(window.getByRole('article').getByText('A second note', { exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'Delete from server', exact: true }).click()
  await window.getByRole('button', { name: 'Confirm server deletion', exact: true }).click()
  await expect(window.getByRole('status').filter({ hasText: 'Message deleted from server' })).toBeVisible({ timeout: 15000 })
  await expect(window.getByRole('article').getByText('This note tests the selected mailbox message.')).toBeVisible()
  await window.getByRole('button', { name: /VLAN lab result/ }).click()
  await expect(window.getByRole('article').getByText('PC-to-server routing works over SMTP.')).toBeVisible()
  await window.getByRole('button', { name: 'Close Bob PC' }).click()

  await page.getByRole('button', { name: /Class Mail Server Server-PT/i }).click()
  window = page.locator('.pt-device-window').filter({ hasText: 'Class Mail Server' })
  await window.getByRole('tab', { name: 'Services', exact: true }).click()
  await window.locator('[data-service="email"]').click()
  await expect(window.getByTestId('mailbox-count-bob')).toHaveText('1 messages')
  expect(browserErrors).toEqual([])
})
