import { decodePkt, MAX_PKT_BYTES } from '@/simulator/pktDecoder'
import { parsePktXml } from '@/simulator/packetImport'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > MAX_PKT_BYTES) return Response.json({error:'Maximum PKT file size is 8 MB.'},{status:413})
    const reader = request.body?.getReader()
    if (!reader) throw new Error('No PKT file was supplied.')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const {value,done} = await reader.read(); if (done) break
      size += value.byteLength
      if (size > MAX_PKT_BYTES) { await reader.cancel();return Response.json({error:'Maximum PKT file size is 8 MB.'},{status:413}) }
      chunks.push(value)
    }
    const bytes = Buffer.concat(chunks)
    const textStart = bytes.subarray(0, 100).toString('utf8').trim()
    let xmlContent = ''
    if (textStart.startsWith('<?xml') || textStart.startsWith('<PACKET') || textStart.includes('<NETWORK')) {
      xmlContent = bytes.toString('utf8')
    } else {
      xmlContent = decodePkt(bytes)
    }
    return Response.json(parsePktXml(xmlContent))
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Could not decode this PKT file.'},{status:400})
  }
}
