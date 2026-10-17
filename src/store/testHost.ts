const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLoopbackAutomationHost(hostname: string): boolean {
  return loopbackHosts.has(hostname.toLowerCase())
}
