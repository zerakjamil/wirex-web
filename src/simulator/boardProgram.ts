export type BoardLanguage = 'javascript' | 'python'
export type BoardPinState = { mode: 'INPUT' | 'OUTPUT'; value: number }
export type BoardPinStates = Record<string, BoardPinState>

type Expression = { kind: 'value'; value: string } | { kind: 'compare'; left: Expression; operator: string; right: Expression }
type Statement =
  | { kind: 'assign'; name: string; expression: Expression }
  | { kind: 'call'; name: string; args: string[] }
  | { kind: 'if'; condition: Expression; yes: Statement[]; no: Statement[] }

const MAX_SOURCE_LENGTH = 8192
const MAX_STATEMENTS = 256
const MAX_NESTING = 16

function stripComments(source: string, language: BoardLanguage): string {
  return source.split('\n').map(line => {
    const marker = language === 'python' ? '#' : '//'
    const commentAt = line.indexOf(marker)
    return commentAt < 0 ? line : line.slice(0, commentAt)
  }).join('\n')
}

function extractJavaScriptBodies(source: string): string[] | null {
  const functions: Record<string, string> = {}
  const ranges: Array<[number, number]> = []
  const header = /\bfunction\s+(setup|loop|main)\s*\(\s*\)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = header.exec(source))) {
    const name = match[1]
    if (functions[name] !== undefined) return null
    const bodyStart = header.lastIndex
    let depth = 1
    let end = bodyStart
    while (end < source.length && depth > 0) {
      if (source[end] === '{') depth += 1
      if (source[end] === '}') depth -= 1
      end += 1
    }
    if (depth !== 0) return null
    functions[name] = source.slice(bodyStart, end - 1)
    ranges.push([match.index, end])
    header.lastIndex = end
  }

  if (ranges.length === 0) return [source]
  let remainder = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    remainder += source.slice(cursor, start)
    cursor = end
  }
  remainder += source.slice(cursor)
  if (remainder.replace(/[;\s]/g, '') !== '') return null
  return [functions.setup, functions.loop ?? functions.main].filter((body): body is string => body !== undefined)
}

function extractPythonBodies(source: string): string[] | null {
  const lines = source.split('\n')
  const functions: Record<string, string[]> = {}
  const topLevel: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || /^from\s+(gpio|time)\s+import\s+\*$/.test(trimmed)) continue
    if (/^if\s+__name__\s*==\s*["']__main__["']\s*:$/.test(trimmed) || trimmed === 'main()') continue

    const def = /^(\s*)def\s+(setup|loop|main)\s*\(\s*\)\s*:\s*$/.exec(line)
    if (!def) {
      topLevel.push(line)
      continue
    }
    const name = def[2]
    if (functions[name]) return null
    const baseIndent = def[1].length
    const body: string[] = []
    let j = i + 1
    while (j < lines.length) {
      const candidate = lines[j]
      if (!candidate.trim()) {
        j += 1
        continue
      }
      const indent = candidate.length - candidate.trimStart().length
      if (indent <= baseIndent) break
      body.push(candidate)
      j += 1
    }
    functions[name] = body
    i = j - 1
  }
  if (topLevel.some(line => line.trim() !== '')) return null
  const selected = [functions.setup, functions.loop ?? functions.main].filter((body): body is string[] => body !== undefined)
  return selected.map(body => pythonBlocks(body))
}

function pythonBlocks(lines: string[]): string {
  const meaningful = lines.filter(line => line.trim())
  if (meaningful.some(line => line.includes('\t'))) return '\u0000'
  const baseIndent = meaningful.length
    ? Math.min(...meaningful.map(line => line.length - line.trimStart().length))
    : 0
  const output: string[] = []
  const stack: Array<{ indent: number; kind: 'if' | 'else' }> = []
  for (const line of meaningful) {
    const indent = line.length - line.trimStart().length - baseIndent
    const text = line.trim()
    while (stack.length && indent < stack[stack.length - 1].indent) {
      output.push('}')
      stack.pop()
    }
    if (text === 'else:') {
      const current = stack[stack.length - 1]
      if (!current || current.kind !== 'if' || current.indent !== indent) return '\u0000'
      output.push('}', 'else', '{')
      current.kind = 'else'
      continue
    }
    const condition = /^if\s+(.+):$/.exec(text)
    if (condition) {
      if (indent <= (stack[stack.length - 1]?.indent ?? -1)) return '\u0000'
      output.push(`if (${condition[1]})`, '{')
      stack.push({ indent, kind: 'if' })
      continue
    }
    if (/^(while|for|def)\b/.test(text)) return '\u0000'
    if (stack.length && indent <= stack[stack.length - 1].indent) return '\u0000'
    output.push(text)
  }
  while (stack.length) {
    output.push('}')
    stack.pop()
  }
  return output.join('\n')
}

function javascriptTokens(source: string): string[] {
  const tokens: string[] = []
  let current = ''
  for (const char of source) {
    if (char === '{' || char === '}') {
      if (current.trim()) tokens.push(current.trim())
      tokens.push(char)
      current = ''
    } else if (char === ';' || char === '\n' || char === '\r') {
      if (current.trim()) tokens.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) tokens.push(current.trim())
  return tokens
}

function parseExpression(source: string): Expression | null {
  const comparison = /^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/.exec(source.trim())
  if (!comparison) {
    const value = source.trim()
    return /^[A-Za-z_]\w*$/.test(value)
      || /^-?\d+(?:\.\d+)?$/.test(value)
      || /^(?:analogRead|digitalRead)\((?:A[0-5]|D[0-9])\)$/.test(value)
      ? { kind: 'value', value }
      : null
  }
  const left = parseExpression(comparison[1])
  const right = parseExpression(comparison[3])
  if (!left || !right) return null
  return { kind: 'compare', left, operator: comparison[2], right }
}

function parseStatements(tokens: string[], depth = 0): Statement[] | null {
  if (depth > MAX_NESTING) return null
  let index = 0
  let statementCount = 0
  const parseBlock = (nested: number): Statement[] | null => {
    if (nested > MAX_NESTING) return null
    const statements: Statement[] = []
    while (index < tokens.length) {
      const token = tokens[index]
      if (token === '}') {
        if (nested === 0) return null
        index += 1
        return statements
      }
      if (token === '{' || token === 'else') return null
      statementCount += 1
      if (statementCount > MAX_STATEMENTS) return null

      const conditional = /^if\s*\((.*)\)$/.exec(token)
      if (conditional) {
        const condition = parseExpression(conditional[1])
        if (!condition || tokens[index + 1] !== '{') return null
        index += 2
        const yes = parseBlock(nested + 1)
        if (!yes) return null
        let no: Statement[] = []
        if (tokens[index] === 'else') {
          if (tokens[index + 1] !== '{') return null
          index += 2
          const elseBody = parseBlock(nested + 1)
          if (!elseBody) return null
          no = elseBody
        }
        statements.push({ kind: 'if', condition, yes, no })
        continue
      }

      const assignment = /^(?:(?:var|let|const)\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(token)
      if (assignment) {
        const expression = parseExpression(assignment[2])
        if (!expression) return null
        statements.push({ kind: 'assign', name: assignment[1], expression })
        index += 1
        continue
      }

      const call = /^([A-Za-z_]\w*)\s*\((.*)\)$/.exec(token)
      if (!call || !['pinMode', 'digitalWrite', 'analogWrite'].includes(call[1])) return null
      const args = call[2].trim() ? call[2].split(',').map(arg => arg.trim()) : []
      if (args.some(arg => !/^[A-Za-z_]\w*$/.test(arg) && !/^-?\d+(?:\.\d+)?$/.test(arg))) return null
      if (args.length !== 2) return null
      statements.push({ kind: 'call', name: call[1], args })
      index += 1
    }
    return nested === 0 ? statements : null
  }
  return parseBlock(depth)
}

function resolveValue(source: string, variables: Map<string, number>, pins: BoardPinStates): number | null {
  if (/^-?\d+(?:\.\d+)?$/.test(source)) return Number(source)
  if (/^A[0-5]$/.test(source) || /^D[0-9]$/.test(source)) return pins[source]?.value ?? 0
  if (source === 'HIGH' || source === 'true' || source === 'True') return 1
  if (source === 'LOW' || source === 'false' || source === 'False') return 0
  if (variables.has(source)) return variables.get(source)!
  const read = /^(analogRead|digitalRead)\((A[0-5]|D[0-9])\)$/.exec(source)
  if (read) {
    const value = pins[read[2]]?.value ?? 0
    return read[1] === 'digitalRead' ? (value > 512 ? 1 : 0) : value
  }
  return null
}

function evaluate(expression: Expression, variables: Map<string, number>, pins: BoardPinStates): number | boolean | null {
  if (expression.kind === 'value') return resolveValue(expression.value, variables, pins)
  const left = evaluate(expression.left, variables, pins)
  const right = evaluate(expression.right, variables, pins)
  if (left === null || right === null) return null
  switch (expression.operator) {
    case '>': return Number(left) > Number(right)
    case '<': return Number(left) < Number(right)
    case '>=': return Number(left) >= Number(right)
    case '<=': return Number(left) <= Number(right)
    case '==': case '===': return left === right || Number(left) === Number(right)
    case '!=': case '!==': return !(left === right || Number(left) === Number(right))
    default: return null
  }
}

function execute(statements: Statement[], variables: Map<string, number>, pins: BoardPinStates): boolean {
  for (const statement of statements) {
    if (statement.kind === 'assign') {
      const result = evaluate(statement.expression, variables, pins)
      if (typeof result !== 'number' || !Number.isFinite(result)) return false
      variables.set(statement.name, result)
      continue
    }
    if (statement.kind === 'if') {
      const result = evaluate(statement.condition, variables, pins)
      if (result === null) return false
      if (!execute(result ? statement.yes : statement.no, variables, pins)) return false
      continue
    }

    const [pinName, valueName] = statement.args
    if (!/^A[0-5]$/.test(pinName) && !/^D[0-9]$/.test(pinName)) return false
    if (statement.name === 'pinMode') {
      if (valueName !== 'INPUT' && valueName !== 'OUTPUT') return false
      pins[pinName] = { mode: valueName, value: pins[pinName]?.value ?? 0 }
      continue
    }
    const value = resolveValue(valueName, variables, pins)
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    pins[pinName] = {
      mode: 'OUTPUT',
      value: statement.name === 'digitalWrite'
        ? (value > 0 ? 1023 : 0)
        : Math.round((Math.max(0, Math.min(255, value)) / 255) * 1023),
    }
  }
  return true
}

export function runBoardProgram(source: string, language: BoardLanguage, initialPins: BoardPinStates): { ok: boolean; error?: 'unsupported-syntax'; pinStates: BoardPinStates } {
  const rejected = () => ({ ok: false as const, error: 'unsupported-syntax' as const, pinStates: initialPins })
  if (source.length > MAX_SOURCE_LENGTH) return rejected()
  const uncommented = stripComments(source, language)
  const bodies = language === 'python'
    ? extractPythonBodies(uncommented)
    : extractJavaScriptBodies(uncommented)
  if (!bodies || bodies.some(body => body.includes('\u0000'))) return rejected()
  const tokens = bodies.flatMap(javascriptTokens)
  if (tokens.length > MAX_STATEMENTS * 4) return rejected()
  const statements = parseStatements(tokens)
  if (!statements) return rejected()
  const pins: BoardPinStates = Object.fromEntries(Object.entries(initialPins).map(([name, state]) => [name, { ...state }]))
  const variables = new Map<string, number>()
  if (!execute(statements, variables, pins)) return rejected()
  return { ok: true, pinStates: pins }
}
