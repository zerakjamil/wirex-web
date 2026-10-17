import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'

export interface LabCheckpoint {
  id: string
  labId: string
  labName: string
  title: string
  description: string
  snapshotJson: string
  createdAt: number
  isStarred: boolean
  tags: string[]
}

export interface CramCard {
  id: string
  category: string
  title: string
  keyPoint: string
  commandSnippet?: string
  mnemonic?: string
  createdAt: number
}

const DEFAULT_CRAM_CARDS: Omit<CramCard, 'id' | 'createdAt'>[] = [
  {
    category: 'Subnetting',
    title: 'CIDR Prefix to Subnet Mask & Usable Hosts',
    keyPoint: '/24 = 255.255.255.0 (254 hosts)\n/26 = 255.255.255.192 (62 hosts, step 64)\n/27 = 255.255.255.224 (30 hosts, step 32)\n/28 = 255.255.255.240 (14 hosts, step 16)\n/29 = 255.255.255.248 (6 hosts, step 8)\n/30 = 255.255.255.252 (2 hosts, step 4 point-to-point)',
    mnemonic: 'Magic Number = 256 minus interesting octet mask value.',
  },
  {
    category: 'Routing Protocols',
    title: 'Administrative Distances (AD) Ranked',
    keyPoint: 'Connected: 0\nStatic: 1\nInternal BGP: 200\nExternal BGP: 20\nEIGRP (internal): 90\nOSPF: 110\nIS-IS: 115\nRIP: 120\nExternal EIGRP: 170\nUnusable/Unknown: 255',
    commandSnippet: 'show ip route',
    mnemonic: 'Lower Administrative Distance is always preferred over higher.',
  },
  {
    category: 'Switching & STP',
    title: 'STP 802.1D vs RSTP 802.1w Port States',
    keyPoint: '802.1D: Blocking (20s) -> Listening (15s) -> Learning (15s) -> Forwarding (total 50s)\n802.1w: Discarding -> Learning -> Forwarding (sub-second convergence via handshake proposals)',
    commandSnippet: 'spanning-tree mode rapid-pvst\nshow spanning-tree summary',
    mnemonic: 'RSTP collapses Disabled, Blocking, and Listening into Discarding.',
  },
  {
    category: 'Common Ports',
    title: 'Essential CCNA Port Numbers & Protocols',
    keyPoint: 'FTP Data: 20 (TCP)\nFTP Control: 21 (TCP)\nSSH: 22 (TCP)\nTelnet: 23 (TCP)\nDNS: 53 (UDP/TCP)\nDHCP Server: 67 (UDP)\nDHCP Client: 68 (UDP)\nTFTP: 69 (UDP)\nHTTP: 80 (TCP)\nNTP: 123 (UDP)\nSNMP: 161 (UDP)\nHTTPS: 443 (TCP)\nSyslog: 514 (UDP)',
    mnemonic: 'SSH 22 secure; Telnet 23 cleartext. TFTP 69 uses UDP; FTP 21 uses TCP.',
  },
  {
    category: 'IOS Syntax',
    title: 'Crucial CCNA Verification Commands',
    keyPoint: 'show ip interface brief: Port up/up status and assigned IPs\nshow ip route: Routing table and connected/OSPF routes\nshow vlan brief: VLAN assignments across switchports\nshow cdp neighbors detail: Layer 2 connected peer device discovery\nshow interfaces trunk: Trunk ports and allowed VLANs\nshow etherchannel summary: LACP / PAgP bundle status',
    commandSnippet: 'show ip int brief\nshow vlan brief\nshow ip route\nshow interfaces trunk',
    mnemonic: 'Always check Layer 1/2 physical status before Layer 3 routing logic.',
  },
  {
    category: 'OSPF States',
    title: 'OSPF Adjacency Progression States',
    keyPoint: '1. Down: No hello received\n2. Init: Hello received, but local router ID not listed\n3. 2-Way: Bi-directional communication (DR/BDR elected on broadcast)\n4. ExStart: Master/Slave determined by highest Router ID\n5. Exchange: DBD packets exchanged\n6. Loading: LSR and LSU packets requested and sent\n7. Full: Databases fully synchronized',
    commandSnippet: 'show ip ospf neighbor\nshow ip ospf interface',
    mnemonic: 'Down -> Init -> 2-Way -> ExStart -> Exchange -> Loading -> Full',
  },
]

export class SqliteStudyStore {
  private db: DatabaseSync

  constructor(customPath?: string) {
    if (customPath === ':memory:') {
      this.db = new DatabaseSync(':memory:')
    } else {
      const defaultDir = fs.existsSync(path.join(process.cwd(), '.wireforge'))
        ? path.join(process.cwd(), '.wireforge')
        : (process.env.HOME || process.env.USERPROFILE
            ? path.join(process.env.HOME || process.env.USERPROFILE!, '.wireforge')
            : path.join(process.cwd(), '.wireforge'))
      const dbPath = customPath || process.env.WIREFORGE_DB_PATH || path.join(defaultDir, 'study_vault.db')
      const dir = path.dirname(dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      this.db = new DatabaseSync(dbPath)
    }

    this.initTables()
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS student_checkpoints (
        id TEXT PRIMARY KEY,
        lab_id TEXT NOT NULL,
        lab_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        is_starred INTEGER DEFAULT 0,
        tags TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chk_lab_id ON student_checkpoints(lab_id);
      CREATE INDEX IF NOT EXISTS idx_chk_created_at ON student_checkpoints(created_at DESC);

      CREATE TABLE IF NOT EXISTS cram_cards (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        key_point TEXT NOT NULL,
        command_snippet TEXT,
        mnemonic TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cram_category ON cram_cards(category);
    `)

    this.seedDefaultCardsIfEmpty()
  }

  private seedDefaultCardsIfEmpty(): void {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM cram_cards').get() as { count: number } | undefined
    if (!row || row.count === 0) {
      const insert = this.db.prepare(`
        INSERT INTO cram_cards (id, category, title, key_point, command_snippet, mnemonic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      const now = Date.now()
      for (const [idx, card] of DEFAULT_CRAM_CARDS.entries()) {
        const id = `card_${idx + 1}`
        insert.run(
          id,
          card.category,
          card.title,
          card.keyPoint,
          card.commandSnippet || null,
          card.mnemonic || null,
          now + idx
        )
      }
    }
  }

  // --- Checkpoints API ---

  createCheckpoint(params: {
    labId: string
    labName: string
    title: string
    description?: string
    snapshot: unknown
    tags?: string[]
  }): LabCheckpoint {
    const id = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const createdAt = Date.now()
    const tagsStr = (params.tags || []).join(',')
    const snapshotJson = typeof params.snapshot === 'string' ? params.snapshot : JSON.stringify(params.snapshot)

    const stmt = this.db.prepare(`
      INSERT INTO student_checkpoints (id, lab_id, lab_name, title, description, snapshot_json, created_at, is_starred, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `)

    stmt.run(
      id,
      params.labId,
      params.labName,
      params.title,
      params.description || '',
      snapshotJson,
      createdAt,
      tagsStr
    )

    return {
      id,
      labId: params.labId,
      labName: params.labName,
      title: params.title,
      description: params.description || '',
      snapshotJson,
      createdAt,
      isStarred: false,
      tags: params.tags || [],
    }
  }

  listCheckpoints(labId?: string): LabCheckpoint[] {
    let rows: Array<{
      id: string
      lab_id: string
      lab_name: string
      title: string
      description: string | null
      snapshot_json: string
      created_at: number
      is_starred: number
      tags: string | null
    }>

    if (labId) {
      rows = this.db.prepare(`
        SELECT * FROM student_checkpoints
        WHERE lab_id = ?
        ORDER BY is_starred DESC, created_at DESC
      `).all(labId) as typeof rows
    } else {
      rows = this.db.prepare(`
        SELECT * FROM student_checkpoints
        ORDER BY is_starred DESC, created_at DESC
      `).all() as typeof rows
    }

    return rows.map(r => ({
      id: r.id,
      labId: r.lab_id,
      labName: r.lab_name,
      title: r.title,
      description: r.description || '',
      snapshotJson: r.snapshot_json,
      createdAt: r.created_at,
      isStarred: r.is_starred === 1,
      tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    }))
  }

  getCheckpoint(id: string): LabCheckpoint | null {
    const r = this.db.prepare('SELECT * FROM student_checkpoints WHERE id = ?').get(id) as {
      id: string
      lab_id: string
      lab_name: string
      title: string
      description: string | null
      snapshot_json: string
      created_at: number
      is_starred: number
      tags: string | null
    } | undefined

    if (!r) return null

    return {
      id: r.id,
      labId: r.lab_id,
      labName: r.lab_name,
      title: r.title,
      description: r.description || '',
      snapshotJson: r.snapshot_json,
      createdAt: r.created_at,
      isStarred: r.is_starred === 1,
      tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    }
  }

  deleteCheckpoint(id: string): boolean {
    const res = this.db.prepare('DELETE FROM student_checkpoints WHERE id = ?').run(id)
    return Number(res.changes) > 0
  }

  toggleStarCheckpoint(id: string): boolean {
    const current = this.db.prepare('SELECT is_starred FROM student_checkpoints WHERE id = ?').get(id) as { is_starred: number } | undefined
    if (!current) return false

    const newStarred = current.is_starred === 1 ? 0 : 1
    this.db.prepare('UPDATE student_checkpoints SET is_starred = ? WHERE id = ?').run(newStarred, id)
    return newStarred === 1
  }

  // --- Workspace Autosave & Recovery ---

  saveAutosave(snapshot: unknown, fileName?: string): void {
    const labId = '__autosave__'
    const snapshotJson = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
    const existing = this.db.prepare('SELECT id FROM student_checkpoints WHERE lab_id = ?').get(labId) as { id: string } | undefined
    if (existing) {
      this.db.prepare(`
        UPDATE student_checkpoints
        SET snapshot_json = ?, title = ?, lab_name = ?, created_at = ?
        WHERE id = ?
      `).run(snapshotJson, fileName || 'Active Workspace', fileName || 'Active Lab', Date.now(), existing.id)
    } else {
      this.createCheckpoint({
        labId,
        labName: fileName || 'Active Lab',
        title: fileName || 'Active Workspace',
        description: 'Automatic session recovery checkpoint',
        snapshot,
        tags: ['autosave', 'recovery'],
      })
    }
  }

  getAutosave(): LabCheckpoint | null {
    const r = this.db.prepare('SELECT * FROM student_checkpoints WHERE lab_id = ?').get('__autosave__') as {
      id: string
      lab_id: string
      lab_name: string
      title: string
      description: string | null
      snapshot_json: string
      created_at: number
      is_starred: number
      tags: string | null
    } | undefined

    if (!r) return null

    return {
      id: r.id,
      labId: r.lab_id,
      labName: r.lab_name,
      title: r.title,
      description: r.description || '',
      snapshotJson: r.snapshot_json,
      createdAt: r.created_at,
      isStarred: r.is_starred === 1,
      tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    }
  }

  // --- Cram Cards API ---

  listCramCards(category?: string): CramCard[] {
    let rows: Array<{
      id: string
      category: string
      title: string
      key_point: string
      command_snippet: string | null
      mnemonic: string | null
      created_at: number
    }>

    if (category) {
      rows = this.db.prepare(`
        SELECT * FROM cram_cards
        WHERE category = ?
        ORDER BY created_at ASC
      `).all(category) as typeof rows
    } else {
      rows = this.db.prepare(`
        SELECT * FROM cram_cards
        ORDER BY created_at ASC
      `).all() as typeof rows
    }

    return rows.map(r => ({
      id: r.id,
      category: r.category,
      title: r.title,
      keyPoint: r.key_point,
      commandSnippet: r.command_snippet || undefined,
      mnemonic: r.mnemonic || undefined,
      createdAt: r.created_at,
    }))
  }

  close(): void {
    this.db.close()
  }
}

let defaultStoreInstance: SqliteStudyStore | null = null

export function getStudyStore(): SqliteStudyStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new SqliteStudyStore()
  }
  return defaultStoreInstance
}
