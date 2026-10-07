import { createMachine } from 'xstate'
import type { ContextValue, MachineDocument, StateNode, TransitionData, TransitionEdge, ValidationIssue } from '../types/machine'

export function sendEventId() {
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function stateId(prefix = 'state') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function createState(label: string, position: { x: number; y: number }, kind: StateNode['data']['kind'] = 'simple', parentId?: string): StateNode {
  const node: StateNode = {
    id: stateId(kind),
    type: 'state',
    position,
    data: { label, kind, description: '', initial: false, isGroup: kind === 'compound' },
  }
  if (parentId) {
    node.parentId = parentId
    node.extent = 'parent'
    node.expandParent = true
  }
  if (kind === 'compound') {
    node.style = { width: 460, height: 310 }
    node.zIndex = 0
  }
  return node
}

export function sampleMachine(): { nodes: StateNode[]; edges: TransitionEdge[]; variables: MachineDocument['variables'] } {
  const idle = createState('待提交', { x: 60, y: 110 })
  idle.id = 'idle'
  idle.data.initial = true
  idle.data.description = '等待用户提交业务申请'

  const validating = createState('自动校验', { x: 320, y: 110 })
  validating.id = 'validating'
  validating.data.description = '验证资料完整性和额度'

  const manual = createState('人工审核', { x: 590, y: 70 })
  manual.id = 'manual'
  manual.data.description = '风控专员复核申请'

  const approved = createState('已通过', { x: 880, y: 70 }, 'final')
  approved.id = 'approved'

  const rejected = createState('已驳回', { x: 590, y: 250 }, 'final')
  rejected.id = 'rejected'

  const draft = createState('草稿补充', { x: 60, y: 300 })
  draft.id = 'draft'

  const edges: TransitionEdge[] = [
    { id: 't1', source: 'idle', target: 'validating', type: 'transition', data: { event: 'SUBMIT', condition: '', action: '记录提交时间', assignments: [{ variable: 'submitCount', expression: 'submitCount + 1' }] } },
    { id: 't2', source: 'validating', target: 'manual', type: 'transition', data: { event: 'VALID', condition: 'amount > 5000', action: '分配人工审核', assignments: [] } },
    { id: 't3', source: 'validating', target: 'approved', type: 'transition', data: { event: 'VALID', condition: 'amount <= 5000', action: '自动审批通过', assignments: [] } },
    { id: 't4', source: 'validating', target: 'rejected', type: 'transition', data: { event: 'INVALID', condition: '', action: '记录驳回原因', assignments: [{ variable: 'rejectCount', expression: 'rejectCount + 1' }] } },
    { id: 't5', source: 'manual', target: 'approved', type: 'transition', data: { event: 'APPROVE', condition: '', action: '审核通过', assignments: [] } },
    { id: 't6', source: 'manual', target: 'rejected', type: 'transition', data: { event: 'REJECT', condition: '', action: '审核驳回（30 秒未处理自动执行）', assignments: [], timeoutMs: 30000 } },
    { id: 't7', source: 'rejected', target: 'draft', type: 'transition', data: { event: 'REVISE', condition: '', action: '进入补充资料', assignments: [] } },
  ]
  return {
    nodes: [idle, validating, manual, approved, rejected, draft],
    edges,
    variables: [
      { name: 'amount', type: 'number', initial: 8000 },
      { name: 'submitCount', type: 'number', initial: 0 },
      { name: 'rejectCount', type: 'number', initial: 0 },
      { name: 'riskLevel', type: 'string', initial: 'normal' },
    ],
  }
}

export function resolveValue(expression: string, context: Record<string, ContextValue>): ContextValue {
  const trimmed = expression.trim()
  if (/^".*"$|^'.*'$/.test(trimmed)) return trimmed.slice(1, -1)
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true'
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed in context) return context[trimmed]
  const arithmetic = /^([A-Za-z_]\w*|\d+(?:\.\d+)?)\s*([+\-*/])\s*([A-Za-z_]\w*|\d+(?:\.\d+)?)$/.exec(trimmed)
  if (arithmetic) {
    const read = (value: string) => value in context ? Number(context[value]) : Number(value)
    const left = read(arithmetic[1])
    const right = read(arithmetic[3])
    if (arithmetic[2] === '+') return left + right
    if (arithmetic[2] === '-') return left - right
    if (arithmetic[2] === '*') return left * right
    if (arithmetic[2] === '/') return right === 0 ? 0 : left / right
  }
  return trimmed
}

function compare(left: ContextValue, operator: string, right: ContextValue): boolean {
  if (operator === '==' || operator === '===') return String(left) === String(right)
  if (operator === '!=' || operator === '!==') return String(left) !== String(right)
  const a = Number(left)
  const b = Number(right)
  if (operator === '>') return a > b
  if (operator === '<') return a < b
  if (operator === '>=') return a >= b
  if (operator === '<=') return a <= b
  return false
}

export function evaluateCondition(condition: string, context: Record<string, ContextValue>) {
  if (!condition.trim()) return true
  return condition.split(/\|\|/).some((orPart) => orPart.split(/&&/).every((part) => {
    const match = /^\s*([A-Za-z_]\w*|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?)\s*(>=|<=|==|!=|>|<)\s*([A-Za-z_]\w*|"[^"]*"|'[^']*'|-?\d+(?:\.\d+)?)\s*$/.exec(part)
    if (!match) return Boolean(resolveValue(part, context))
    return compare(resolveValue(match[1], context), match[2], resolveValue(match[3], context))
  }))
}

/** 虚拟时钟/时长格式化：800 → 800ms，5000 → 5s，90000 → 1m30s */
export function formatClock(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes}m${rest}s` : `${minutes}m`
}

/** 旧版本文档的转移没有 timeoutMs 等字段，导入时补齐缺省值，保证升级后照旧可用 */
export function normalizeTransitionData(data: TransitionEdge['data'] | undefined): TransitionData {
  const timeout = typeof data?.timeoutMs === 'number' && Number.isFinite(data.timeoutMs) && data.timeoutMs > 0
    ? Math.round(data.timeoutMs)
    : undefined
  return {
    event: String(data?.event ?? 'NEXT'),
    condition: String(data?.condition ?? ''),
    action: String(data?.action ?? ''),
    assignments: Array.isArray(data?.assignments) ? data.assignments : [],
    timeoutMs: timeout,
  }
}

export function validateMachine(nodes: StateNode[], edges: TransitionEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const rootNodes = nodes.filter((node) => !node.parentId && node.data.kind !== 'compound')
  const initialState = nodes.find((node) => !node.parentId && node.data.initial) ?? rootNodes.find((node) => node.data.kind !== 'final')
  if (!initialState) {
    issues.push({ id: 'missing-initial', severity: 'error', title: '缺少初始状态', detail: '状态机至少需要一个根级初始状态。' })
  } else {
    const reachable = new Set<string>([initialState.id])
    const queue = [initialState.id]
    while (queue.length) {
      const id = queue.shift()!
      edges.filter((edge) => edge.source === id).forEach((edge) => {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target)
          queue.push(edge.target)
        }
      })
    }
    nodes.filter((node) => !node.parentId && node.data.kind !== 'compound' && !reachable.has(node.id)).forEach((node) => {
      issues.push({ id: `unreachable-${node.id}`, severity: 'error', title: '不可达状态', detail: `“${node.data.label}”无法从初始状态到达。`, nodeId: node.id })
    })
  }

  nodes.filter((node) => node.data.kind !== 'compound').forEach((node) => {
    const outgoing = edges.filter((edge) => edge.source === node.id)
    if (!outgoing.length && node.data.kind !== 'final') {
      issues.push({ id: `missing-${node.id}`, severity: 'warning', title: '缺少转移', detail: `“${node.data.label}”没有任何出站转移。`, nodeId: node.id })
    }
  })

  nodes.filter((node) => node.data.kind === 'compound').forEach((node) => {
    const children = nodes.filter((child) => child.parentId === node.id)
    if (!children.length) {
      issues.push({ id: `empty-${node.id}`, severity: 'warning', title: '复合状态为空', detail: `“${node.data.label}”尚未配置子状态。`, nodeId: node.id })
    } else if (!children.some((child) => child.data.initial)) {
      issues.push({ id: `child-initial-${node.id}`, severity: 'warning', title: '缺少子状态初始项', detail: `“${node.data.label}”需要标记一个初始子状态。`, nodeId: node.id })
    }
  })

  const groups = new Map<string, TransitionEdge[]>()
  edges.forEach((edge) => {
    const key = `${edge.source}::${String(edge.data?.event ?? '')}::${String(edge.data?.condition ?? '')}`
    groups.set(key, [...(groups.get(key) ?? []), edge])
  })
  groups.forEach((sameEdges) => {
    if (sameEdges.length > 1) {
      const first = sameEdges[0]
      issues.push({
        id: `duplicate-${first.id}`,
        severity: 'error',
        title: '重复事件',
        detail: `同一状态下的 “${String(first.data?.event)} / ${String(first.data?.condition || '无条件')}” 出现了 ${sameEdges.length} 次。`,
        edgeId: first.id,
      })
    }
  })
  return issues
}

interface ExportStateConfig {
  initial?: string
  states: Record<string, ExportStateConfig>
  on?: Record<string, { target: string } | Array<{ target: string }>>
  after?: Record<string, { target: string } | Array<{ target: string }>>
}

export function xstateConfig(nodes: StateNode[], edges: TransitionEdge[], variables: MachineDocument['variables']) {
  const rootInitial = nodes.find((node) => !node.parentId && node.data.initial)?.id
    ?? nodes.find((node) => !node.parentId && node.data.kind !== 'compound')?.id
  const buildTransitions = (stateId: string) => {
    const on: Record<string, Array<{ target: string }>> = {}
    const after: Record<string, Array<{ target: string }>> = {}
    edges.filter((edge) => edge.source === stateId).forEach((edge) => {
      const event = String(edge.data?.event ?? 'EVENT')
      on[event] = [...(on[event] ?? []), { target: edge.target }]
      const timeoutMs = edge.data?.timeoutMs
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        after[String(timeoutMs)] = [...(after[String(timeoutMs)] ?? []), { target: edge.target }]
      }
    })
    return { on, after }
  }
  const states: Record<string, ExportStateConfig> = {}
  nodes.filter((node) => !node.parentId).forEach((node) => {
    const { on, after } = buildTransitions(node.id)
    const children = nodes.filter((child) => child.parentId === node.id)
    const childStates: Record<string, ExportStateConfig> = {}
    children.forEach((child) => {
      const childTransitions = buildTransitions(child.id)
      childStates[child.id] = {
        states: {},
        on: childTransitions.on,
        ...(Object.keys(childTransitions.after).length ? { after: childTransitions.after } : {}),
      }
    })
    states[node.id] = {
      initial: children.find((child) => child.data.initial)?.id,
      states: childStates,
      on,
      ...(Object.keys(after).length ? { after } : {}),
    }
  })
  const context = Object.fromEntries(variables.map((variable) => [variable.name, variable.initial]))
  const config: Record<string, unknown> = {
    id: 'StateBoardMachine',
    initial: rootInitial,
    context,
    states,
  }
  return config
}

export function compileMachine(nodes: StateNode[], edges: TransitionEdge[], variables: MachineDocument['variables']) {
  return createMachine(xstateConfig(nodes, edges, variables))
}

export function mermaidDiagram(nodes: StateNode[], edges: TransitionEdge[]) {
  const safeId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_')
  const lines = ['stateDiagram-v2']
  const initial = nodes.find((node) => !node.parentId && node.data.initial)
  if (initial) lines.push(`  [*] --> ${safeId(initial.id)}`)
  nodes.forEach((node) => {
    if (node.data.kind === 'final') lines.push(`  state "${node.data.label}" as ${safeId(node.id)}`)
  })
  edges.forEach((edge) => {
    const timeout = edge.data?.timeoutMs
    const label = [
      edge.data?.event,
      edge.data?.condition ? `[${edge.data.condition}]` : '',
      edge.data?.action,
      typeof timeout === 'number' && timeout > 0 ? `after ${timeout}ms` : '',
    ].filter(Boolean).join(' / ')
    lines.push(`  ${safeId(edge.source)} --> ${safeId(edge.target)}: ${label || 'event'}`)
  })
  nodes.filter((node) => node.data.kind === 'final').forEach((node) => lines.push(`  ${safeId(node.id)} --> [*]`))
  return lines.join('\n')
}
