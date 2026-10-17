import { exportLabToPkt } from '@/simulator/pktEncoder'
import { parseWorkspace } from '@/simulator/workspaceSchema'
import { readBoundedJson } from '@/simulator/requestBody'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request)
    const { devices, links } = parseWorkspace(body)

    const pktBuffer = exportLabToPkt(devices, links)

    return new Response(pktBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="lab.pkt"',
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not encode PKT file.' },
      { status: 400 }
    )
  }
}
