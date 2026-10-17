import { test, expect } from '@playwright/test'
import { createDevice, createPort } from '../src/simulator/deviceFactory'

function phoneLab() {
  const router = createDevice('router', 720, 160, '2811')
  router.id = 'voice-router'
  router.name = 'Voice Router'
  router.ports = [createPort('FastEthernet0/0', 'Fa0/0', 'fastethernet', 'up')]
  Object.assign(router.ports[0], { status: 'up', vlan: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' })
  router.config.telephony = {
    sourceIp: '192.168.20.1', port: 2000, maxEphones: 2, maxDn: 2,
    directoryNumbers: [{ id: 1, number: '101' }, { id: 2, number: '102' }],
    ephones: [
      { id: 1, macAddress: '001122334401', buttons: [{ line: 1, dn: 1 }] },
      { id: 2, macAddress: '001122334402', buttons: [{ line: 1, dn: 2 }] },
    ],
  }
  router.config.dhcpPools = [{ name: 'VOICE', network: '192.168.20.0', mask: '255.255.255.0', defaultRouter: '192.168.20.1', tftpServer: '192.168.20.1' }]
  router.config.excludedDhcpIps = ['192.168.20.1 192.168.20.10']

  const switchDevice = createDevice('switch', 480, 320)
  switchDevice.id = 'voice-switch'
  switchDevice.name = 'Voice Switch'
  switchDevice.ports = [1, 2, 3].map(index => createPort(`FastEthernet0/${index}`, `Fa0/${index}`, 'fastethernet', 'up'))
  switchDevice.ports.forEach(port => Object.assign(port, { status: 'up', vlan: 10, voiceVlan: 20, portMode: 'access' }))
  Object.assign(switchDevice.ports[2], { portMode: 'trunk', allowedVlans: [10, 20] })

  const phones = [1, 2].map(index => {
    const phone = createDevice('phone', 180 + index * 220, 160, '7960')
    phone.id = `ip-phone-${index}`
    phone.name = `IP Phone${index - 1}`
    phone.macAddress = `00:11:22:33:44:0${index}`
    phone.power = true
    phone.ports = [createPort('Switch', 'Switch', 'fastethernet', 'up'), createPort('PC', 'PC', 'fastethernet', 'down')]
    Object.assign(phone.ports[0], { status: 'up', macAddress: `aa:bb:cc:dd:ee:0${index}` })
    return phone
  })

  const links: Array<{ id: string; type: 'straight'; status: 'up'; fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string }> = []
  const connect = (from: typeof router, fromPort: (typeof router.ports)[number], to: typeof router, toPort: (typeof router.ports)[number]) => {
    const id = `voice-link-${links.length}`
    Object.assign(fromPort, { connectedDeviceId: to.id, connectedPortId: toPort.id, connectedLinkId: id, status: 'up' })
    Object.assign(toPort, { connectedDeviceId: from.id, connectedPortId: fromPort.id, connectedLinkId: id, status: 'up' })
    links.push({ id, type: 'straight', status: 'up', fromDeviceId: from.id, fromPortId: fromPort.id, toDeviceId: to.id, toPortId: toPort.id })
  }
  phones.forEach((phone, index) => connect(phone, phone.ports[0], switchDevice, switchDevice.ports[index]))
  connect(switchDevice, switchDevice.ports[2], router, router.ports[0])
  return { devices: [router, switchDevice, ...phones], links }
}

test('two phone windows place, ring, answer, and end a simulated call', async ({ page, baseURL }) => {
  const lab = phoneLab()
  const encodedLab = Buffer.from(JSON.stringify({ version: 1, fileName: 'IP phone call acceptance', devices: lab.devices, links: lab.links, annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${encodedLab}`)
  await expect(page.getByRole('heading', { name: /Devices 4/i })).toBeVisible()

  const navigator = page.locator('.pt-device-navigator')
  await navigator.getByRole('button', { name: /IP Phone0/ }).click()
  await navigator.getByRole('button', { name: /IP Phone1/ }).click()
  const caller = page.locator('.pt-device-window[aria-label="IP Phone0 window"]')
  const receiver = page.locator('.pt-device-window[aria-label="IP Phone1 window"]')
  await expect(caller).toBeVisible()
  await expect(receiver).toBeVisible()
  await expect(caller.locator('.phone-call-strip')).toContainText('Registered: 101')
  await expect(receiver.locator('.phone-call-strip')).toContainText('Registered: 102')

  await caller.getByLabel('Dial extension').fill('102')
  await caller.getByRole('button', { name: 'Dial', exact: true }).click()
  await expect(receiver.locator('.phone-status')).toHaveText('From: 101')
  await expect(receiver.locator('.phone-ring-lamp')).toHaveClass(/phone-ring-lamp/)
  await receiver.getByRole('button', { name: 'Answer', exact: true }).click()
  await expect(caller.locator('.phone-status')).toHaveText('Connected')
  await expect(receiver.locator('.phone-status')).toHaveText('Connected')

  await caller.getByRole('button', { name: 'EndCall', exact: true }).click()
  await expect(caller.locator('.phone-status')).toHaveText('Your current options')
  await expect(receiver.locator('.phone-status')).toHaveText('Enter number')
  await expect(caller.getByRole('button', { name: 'EndCall', exact: true })).toHaveCount(0)
  await expect(receiver.getByRole('button', { name: 'EndCall', exact: true })).toHaveCount(0)
  await expect(receiver.locator('.phone-ring-lamp')).toHaveCount(0)
  await caller.getByLabel('Dial extension').fill('102')
  await expect(caller.getByRole('button', { name: 'Dial', exact: true })).toBeEnabled()
})
