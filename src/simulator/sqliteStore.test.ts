import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SqliteStudyStore } from './sqliteStore'

test('SqliteStudyStore initializes in-memory and seeds default CCNA cram cards', () => {
  const store = new SqliteStudyStore(':memory:')
  const cards = store.listCramCards()

  assert.ok(cards.length >= 6, 'Must seed at least 6 CCNA cram cards')
  const subnetCard = cards.find(c => c.category === 'Subnetting')
  assert.ok(subnetCard, 'Must include Subnetting cram card')
  assert.ok(subnetCard.keyPoint.includes('/24'), 'Must describe /24 subnet mask')

  store.close()
})

test('SqliteStudyStore manages student checkpoints with rollback snapshots', () => {
  const store = new SqliteStudyStore(':memory:')

  const dummySnapshot = {
    devices: [
      { id: 'dev-1', name: 'R1', type: 'router', ports: [] },
      { id: 'dev-2', name: 'SW1', type: 'switch', ports: [] },
    ],
    links: [
      { id: 'link-1', fromDeviceId: 'dev-1', toDeviceId: 'dev-2' },
    ],
  }

  // 1. Create checkpoint
  const chk1 = store.createCheckpoint({
    labId: 'lab-ccna-101',
    labName: 'Basic OSPF Topology',
    title: 'Pre-OSPF Area 0 Configuration',
    description: 'Working physical connections before activating dynamic routing',
    snapshot: dummySnapshot,
    tags: ['OSPF', 'Area0', 'Baseline'],
  })

  assert.ok(chk1.id.startsWith('chk_'), 'Checkpoint ID must start with chk_')
  assert.equal(chk1.labId, 'lab-ccna-101')
  assert.equal(chk1.title, 'Pre-OSPF Area 0 Configuration')
  assert.equal(chk1.isStarred, false)
  assert.deepEqual(chk1.tags, ['OSPF', 'Area0', 'Baseline'])

  // 2. List checkpoints
  const list = store.listCheckpoints('lab-ccna-101')
  assert.equal(list.length, 1)
  assert.equal(list[0].id, chk1.id)

  // 3. Toggle star
  const isStarred = store.toggleStarCheckpoint(chk1.id)
  assert.equal(isStarred, true)
  const updated = store.getCheckpoint(chk1.id)
  assert.equal(updated?.isStarred, true)

  // 4. Retrieve checkpoint snapshot for rollback
  const retrieved = store.getCheckpoint(chk1.id)
  assert.ok(retrieved, 'Must find checkpoint by ID')
  const parsedSnapshot = JSON.parse(retrieved.snapshotJson)
  assert.equal(parsedSnapshot.devices.length, 2)
  assert.equal(parsedSnapshot.devices[0].name, 'R1')

  // 5. Delete checkpoint
  const deleted = store.deleteCheckpoint(chk1.id)
  assert.equal(deleted, true)
  assert.equal(store.listCheckpoints('lab-ccna-101').length, 0)

  store.close()
})

test('SqliteStudyStore filters cram cards by category', () => {
  const store = new SqliteStudyStore(':memory:')

  const stpCards = store.listCramCards('Switching & STP')
  assert.ok(stpCards.length > 0)
  assert.ok(stpCards.every(c => c.category === 'Switching & STP'))

  const nonExistent = store.listCramCards('NonExistentCategory')
  assert.equal(nonExistent.length, 0)

  store.close()
})
