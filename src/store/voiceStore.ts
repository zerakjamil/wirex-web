import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { getPhoneRegistrations } from '@/simulator/voice'

export interface VoiceCall {
  id: string
  fromDeviceId: string
  toDeviceId: string
  fromNumber: string
  toNumber: string
  status: 'ringing' | 'connected' | 'held' | 'ended'
  createdAt: number
  answeredAt?: number
  endedAt?: number
  reason?: string
}
interface VoiceState {
  calls: VoiceCall[]
  errors: Record<string, string>
  phoneWindows: string[]
  openPhone: (deviceId: string) => void
  closePhone: (deviceId: string) => void
  dial: (deviceId: string, number: string) => string | null
  answer: (deviceId: string) => void
  hangUp: (deviceId: string) => void
  hold: (deviceId: string) => void
  resume: (deviceId: string) => void
  reconcile: () => void
  reset: () => void
}
const active = (call: VoiceCall) => call.status !== 'ended'
const involves = (call: VoiceCall, id: string) => call.fromDeviceId === id || call.toDeviceId === id
const registrations = () => { const { devices,links } = useNetworkStore.getState(); return getPhoneRegistrations(devices,links) }

export const useVoiceStore = create<VoiceState>((set,get) => ({
  calls: [], errors: {}, phoneWindows: [],
  openPhone: deviceId => {set(state=>({phoneWindows:[...new Set([...state.phoneWindows,deviceId])].slice(-4)}));useNetworkStore.getState().setActiveModal({type:'device',deviceId})},
  closePhone: deviceId => set(state=>({phoneWindows:state.phoneWindows.filter(id=>id!==deviceId)})),
  dial: (deviceId, number) => {
    get().reconcile()
    const regs = registrations()
    const source = regs.find(reg => reg.deviceId === deviceId)
    const target = regs.find(reg => reg.extension === number && reg.registered && reg.routerId === source?.routerId)
    let error = ''
    if (!source?.registered) error = source?.reason || 'Phone not registered'
    else if (!/^[0-9*#]{1,24}$/.test(number) || !target) error = 'Unknown extension'
    else if (target.deviceId === deviceId) error = 'Cannot call your own extension'
    else if (get().calls.some(call => active(call) && (involves(call,deviceId) || involves(call,target.deviceId)))) error = 'Line busy'
    if (error) { set(state => ({ errors: { ...state.errors,[deviceId]:error } })); return null }
    const id = crypto.randomUUID()
    const call: VoiceCall = { id,fromDeviceId:deviceId,toDeviceId:target!.deviceId,fromNumber:source!.extension,toNumber:number,status:'ringing',createdAt:Date.now() }
    set(state => ({ calls:[...state.calls.filter(active),...state.calls.filter(call => !active(call)).slice(-49),call],errors:{...state.errors,[deviceId]:'',[target!.deviceId]:''} }))
    return id
  },
  answer: deviceId => {
    get().reconcile()
    set(state => ({ calls:state.calls.map(call => call.toDeviceId === deviceId && call.status === 'ringing' ? {...call,status:'connected',answeredAt:Date.now()} : call) }))
  },
  hangUp: deviceId => set(state => ({ calls:state.calls.map(call => active(call) && involves(call,deviceId) ? {...call,status:'ended',endedAt:Date.now(),reason:call.status === 'ringing' ? 'Cancelled or declined' : 'Call ended'} : call),errors:{...state.errors,[deviceId]:''} })),
  hold: deviceId => set(state => ({ calls:state.calls.map(call => call.status === 'connected' && involves(call,deviceId) ? {...call,status:'held'} : call) })),
  resume: deviceId => { get().reconcile(); set(state => ({ calls:state.calls.map(call => call.status === 'held' && involves(call,deviceId) ? {...call,status:'connected'} : call) })) },
  reconcile: () => {
    const current = get().calls
    if (!current.some(active)) return
    const regs = registrations()
    let changed = false
    const calls = current.map(call => {
      if (!active(call)) return call
      const a = regs.find(reg => reg.deviceId === call.fromDeviceId)
      const b = regs.find(reg => reg.deviceId === call.toDeviceId)
      if (a?.registered && b?.registered && a.routerId === b.routerId && a.extension === call.fromNumber && b.extension === call.toNumber) return call
      changed = true
      return {...call,status:'ended' as const,endedAt:Date.now(),reason:'Network or registration lost'}
    })
    if (changed) set({ calls })
  },
  reset: () => set({ calls:[],errors:{},phoneWindows:[] }),
}))

useNetworkStore.subscribe((state,previous) => {
  if (state.devices !== previous.devices || state.links !== previous.links) useVoiceStore.getState().reconcile()
})
