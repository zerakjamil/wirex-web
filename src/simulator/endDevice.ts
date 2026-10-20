import type { NetworkDevice } from '@/types/network'

/** Generic Packet Tracer end devices expose a GUI tab and an editable HTML surface. */
export const GENERIC_END_DEVICE_MODELS = ['WirelessEndDevice-PT', 'WiredEndDevice-PT'] as const
export type GenericEndDeviceModel = (typeof GENERIC_END_DEVICE_MODELS)[number]

export function isGenericEndDeviceModel(model: string | undefined): model is GenericEndDeviceModel {
  return GENERIC_END_DEVICE_MODELS.includes(model as GenericEndDeviceModel)
}

export function isGenericEndDevice(device: Pick<NetworkDevice, 'type' | 'model'>): boolean {
  return device.type === 'pc' && isGenericEndDeviceModel(device.model)
}

/**
 * Local GUI-lock digest. This is a classroom convenience lock, not a security
 * boundary; the workspace file remains readable and editable by its owner.
 */
export function hashGuiPassword(password: string): string {
  let hash = 0x811c9dc5
  for (const character of `wirex-end-device:${password}`) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const MAX_GUI_HTML_BYTES = 65_536
