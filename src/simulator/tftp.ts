export const TFTP_BLOCK_SIZE = 512
export const MAX_TFTP_FILE_BYTES = 65536

export function isValidTftpFileName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes('..')
}

export function tftpBlockCount(byteLength: number): number {
  return Math.floor(byteLength / TFTP_BLOCK_SIZE) + 1
}

export function tftpBlockDataHex(contents: string, blockNumber: number): string {
  if (!Number.isInteger(blockNumber) || blockNumber < 1) return ''
  const bytes = new TextEncoder().encode(contents)
  const chunk = bytes.subarray((blockNumber - 1) * TFTP_BLOCK_SIZE, blockNumber * TFTP_BLOCK_SIZE)
  return Array.from(chunk, byte => byte.toString(16).padStart(2, '0')).join('')
}
