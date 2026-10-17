import { NextRequest, NextResponse } from 'next/server'
import { getStudyStore } from '@/simulator/sqliteStore'
import { localApiError } from '@/simulator/localApiAccess'

export async function GET(request: NextRequest) {
  const denied=localApiError(request)
  if(denied)return NextResponse.json({ok:false,error:denied},{status:403})
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list-checkpoints'
    const store = getStudyStore()

    if (action === 'list-checkpoints') {
      const labId = searchParams.get('labId') || undefined
      const checkpoints = store.listCheckpoints(labId)
      return NextResponse.json({ ok: true, checkpoints })
    }

    if (action === 'get-checkpoint') {
      const id = searchParams.get('id')
      if (!id) return NextResponse.json({ ok: false, error: 'Missing checkpoint id' }, { status: 400 })
      const checkpoint = store.getCheckpoint(id)
      if (!checkpoint) return NextResponse.json({ ok: false, error: 'Checkpoint not found' }, { status: 404 })
      return NextResponse.json({ ok: true, checkpoint })
    }

    if (action === 'get-autosave') {
      const checkpoint = store.getAutosave()
      return NextResponse.json({ ok: true, checkpoint })
    }

    if (action === 'list-cram-cards') {
      const category = searchParams.get('category') || undefined
      const cards = store.listCramCards(category)
      return NextResponse.json({ ok: true, cards })
    }

    return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied=localApiError(request)
  if(denied)return NextResponse.json({ok:false,error:denied},{status:403})
  try {
    const body = await request.json()
    const { action } = body
    const store = getStudyStore()

    if (action === 'create-checkpoint') {
      const { labId, labName, title, description, snapshot, tags } = body
      if (!labId || !title || !snapshot) {
        return NextResponse.json({ ok: false, error: 'Missing required checkpoint fields' }, { status: 400 })
      }
      const checkpoint = store.createCheckpoint({
        labId,
        labName: labName || 'Untitled Lab',
        title,
        description: description || '',
        snapshot,
        tags: Array.isArray(tags) ? tags : [],
      })
      return NextResponse.json({ ok: true, checkpoint })
    }

    if (action === 'save-autosave') {
      const { snapshot, fileName } = body
      if (!snapshot) {
        return NextResponse.json({ ok: false, error: 'Missing snapshot data' }, { status: 400 })
      }
      store.saveAutosave(snapshot, fileName)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete-checkpoint') {
      const { id } = body
      if (!id) return NextResponse.json({ ok: false, error: 'Missing checkpoint id' }, { status: 400 })
      const success = store.deleteCheckpoint(id)
      return NextResponse.json({ ok: true, deleted: success })
    }

    if (action === 'toggle-star') {
      const { id } = body
      if (!id) return NextResponse.json({ ok: false, error: 'Missing checkpoint id' }, { status: 400 })
      const isStarred = store.toggleStarCheckpoint(id)
      return NextResponse.json({ ok: true, isStarred })
    }

    return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
