declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(location: string, options?: unknown)
    close(): void
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
  }
}
