declare module 'twofish' {
  export function twofish(iv?: number[]): { encrypt(key: number[], plaintext: number[]): number[] }
}
