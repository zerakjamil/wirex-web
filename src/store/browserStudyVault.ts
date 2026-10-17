import type { LabCheckpoint, CramCard } from '@/simulator/sqliteStore'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
type Result = { ok: boolean; error?: string; checkpoints?: LabCheckpoint[]; checkpoint?: LabCheckpoint; cards?: CramCard[]; isStarred?: boolean; deleted?: boolean }
const KEY = 'wirex-study-vault-v1'
const cards: CramCard[] = [
  { id: 'subnets', category: 'Subnetting', title: 'Subnet sizes', keyPoint: '/24: 254 usable hosts\n/26: 62\n/27: 30\n/28: 14\n/29: 6\n/30: 2', mnemonic: 'For ordinary IPv4 LANs: 2^(32-prefix) minus 2.', createdAt: 0 },
  { id: 'routing', category: 'Routing', title: 'Choose a route', keyPoint: 'Longest matching prefix first. For the same prefix, compare administrative distance, then the routing protocol metric.', commandSnippet: 'show ip route', createdAt: 0 },
  { id: 'vlan', category: 'Switching', title: 'Access and trunk ports', keyPoint: 'An access port carries its access VLAN. A trunk carries permitted VLANs. The native VLAN must match at both ends.', commandSnippet: 'show vlan brief\nshow interfaces trunk', createdAt: 0 },
  { id: 'stp', category: 'Switching', title: 'Spanning tree prevents loops', keyPoint: '802.1D states: blocking, listening, learning, forwarding, disabled. Listening and learning each use the forward-delay timer (15 seconds by default). A topology change may also wait for max-age (20 seconds). RSTP uses discarding, learning and forwarding.', commandSnippet: 'show spanning-tree', createdAt: 0 },
  { id: 'dhcp', category: 'Addressing', title: 'DHCP troubleshooting', keyPoint: 'Check the client VLAN, server pool network and mask, exclusions, available addresses and default gateway. Across a router, check the DHCP relay.', commandSnippet: 'show ip interface brief\nshow running-config', createdAt: 0 },
  { id: 'verify', category: 'Troubleshooting', title: 'Work from the physical link upwards', keyPoint: 'Check power and link status, VLAN and trunk settings, IP address and mask, gateway and routes. Test the next hop before the remote destination.', commandSnippet: 'show ip interface brief\nshow interfaces trunk\nshow ip route', createdAt: 0 },
]

export function browserStudyRequest(storage: Storage, action: string, body: Record<string, unknown> = {}): Result {
  try {
    if (action === 'list-cram-cards') return { ok: true, cards }
    const raw = storage.getItem(KEY)
    if (raw && raw.length > 32 * 1024 * 1024) throw new Error('Study vault is too large. Export a backup before continuing.')
    const saved = raw ? JSON.parse(raw) : { version: 1, checkpoints: [] }
    if (saved.version !== 1 || !Array.isArray(saved.checkpoints) || saved.checkpoints.some((row: LabCheckpoint) => !row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.snapshotJson !== 'string' || !Array.isArray(row.tags))) throw new Error('Study vault data is damaged. Existing data has been kept.')
    const rows: LabCheckpoint[] = saved.checkpoints
    if (action === 'list-checkpoints') return { ok: true, checkpoints: [...rows].sort((a, b) => Number(b.isStarred) - Number(a.isStarred) || b.createdAt - a.createdAt) }
    let result: Result
    if (action === 'create-checkpoint') {
      if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('Enter a checkpoint title.')
      if (rows.length >= 50) throw new Error('The vault holds 50 checkpoints. Delete an old checkpoint after exporting a backup.')
      const snapshotJson = typeof body.snapshot === 'string' ? body.snapshot : JSON.stringify(body.snapshot)
      if (!snapshotJson || snapshotJson.length > 8 * 1024 * 1024) throw new Error('Checkpoint is too large. Use File > Save instead.')
      const checkpoint: LabCheckpoint = { id: crypto.randomUUID(), labId: String(body.labId || 'default'), labName: String(body.labName || ''), title: body.title.trim().slice(0, 200), description: String(body.description || '').slice(0, 2000), snapshotJson, createdAt: Date.now(), isStarred: false, tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20) : [] }
      rows.push(checkpoint)
      result = { ok: true, checkpoint }
    } else {
      const index = rows.findIndex(row => row.id === body.id)
      if (index < 0) throw new Error('Checkpoint no longer exists. Refresh the vault.')
      if (action === 'delete-checkpoint') { rows.splice(index, 1); result = { ok: true, deleted: true } }
      else if (action === 'toggle-star') { rows[index].isStarred = !rows[index].isStarred; result = { ok: true, isStarred: rows[index].isStarred } }
      else throw new Error('Unknown study vault action.')
    }
    storage.setItem(KEY, JSON.stringify({ version: 1, checkpoints: rows }))
    return result
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `Could not update study vault: ${error.message}` : 'Browser storage is unavailable. Use File > Save to keep a backup.' }
  }
}

export async function studyVaultRequest(action: string, body: Record<string, unknown> = {}): Promise<Response> {
  let result: Result
  try { result = browserStudyRequest(window.localStorage, action, body) }
  catch { result = { ok: false, error: 'Browser storage is unavailable. Use File > Save to keep a backup.' } }
  return Response.json(result, { status: result.ok ? 200 : 400 })
}
