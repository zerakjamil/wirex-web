import type { NetworkDevice } from '@/types/network'
import { isNetworkController, NETWORK_CONTROLLER_HTTP_PAGE } from './networkController'
import { CYBER_OBSERVER_HTTP_PAGE, isCyberObserver } from './cyberObserver'

export function isHttpServerDevice(device: Pick<NetworkDevice, 'type' | 'model'>): boolean {
  return device.type === 'server' || isNetworkController(device) || isCyberObserver(device)
}

export function isHttpServiceEnabled(device: Pick<NetworkDevice, 'type' | 'model' | 'config'>): boolean {
  return isNetworkController(device) || isCyberObserver(device) || device.config.httpServiceEnabled === true
}

export function httpResponseBody(device: NetworkDevice): string {
  if (isNetworkController(device)) return NETWORK_CONTROLLER_HTTP_PAGE
  if (isCyberObserver(device)) return CYBER_OBSERVER_HTTP_PAGE
  return device.config.htmlContent || '<h1>wireX Web Server</h1><p>HTTP service operational.</p>'
}
