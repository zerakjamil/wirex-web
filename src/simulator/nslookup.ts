export type NslookupArguments =
  | { ok: true; domain: string; queryType: 'A' | 'MX' }
  | { ok: false; reason: 'usage' }
  | { ok: false; reason: 'unsupported-query-type'; queryType: string }

export function parseNslookupArguments(args: string[]): NslookupArguments {
  if (args.length === 1 && !args[0].startsWith('-')) {
    return { ok: true, domain: args[0], queryType: 'A' }
  }

  const option = args[0]?.match(/^-(?:type|query)=(.*)$/i)
  if (!option || args.length !== 2 || !args[1]) return { ok: false, reason: 'usage' }

  const queryType = option[1].toUpperCase()
  if (queryType !== 'A' && queryType !== 'MX') return { ok: false, reason: 'unsupported-query-type', queryType }
  return { ok: true, domain: args[1], queryType }
}
