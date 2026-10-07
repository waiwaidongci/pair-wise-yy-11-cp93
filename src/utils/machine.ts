import { createMachine } from 'xstate'
import type { ContextValue, MachineDocument, StateNode, TransitionEdge, ValidationIssue } from '../types/machine'

export function sendEventId() {
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 把毫秒格式化为易读时长，如 30s、1m 30s、2h。用于虚拟时钟与等待时限展示。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${Number(totalSeconds.toFixed(1))}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = Number((totalSeconds % 60).toFixed(1))
  if (totalMinutes < 60) return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
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
    { id: 't5', source: 'manual', target: 'approved', type: 'transition', data: { event: 'APPROVE', condition: '', action: '审核通过', assignments: [], timeout: 30000 } },
    { id: 't6', source: 'manual', target: 'rejected', type: 'transition', data: { event: 'REJECT', condition: '', action: '审核驳回', assignments: [] } },
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
  /** XState 延迟转移：等待时限到点后自动触发，保留超时含义 */
  after?: Record<string, { target: string }>
}

export function xstateConfig(nodes: StateNode[], edges: TransitionEdge[], variables: MachineDocument['variables']) {
  const rootInitial = nodes.find((node) => !node.parentId && node.data.initial)?.id
    ?? nodes.find((node) => !node.parentId && node.data.kind !== 'compound')?.id
  const states: Record<string, ExportStateConfig> = {}
  nodes.filter((node) => !node.parentId).forEach((node) => {
    const outgoing = edges.filter((edge) => edge.source === node.id)
    const transitions: Record<string, Array<{ target: string }>> = {}
    const after: Record<string, { target: string }> = {}
    outgoing.forEach((edge) => {
      const event = String(edge.data?.event ?? 'EVENT')
      transitions[event] = [...(transitions[event] ?? []), { target: edge.target }]
      const timeout = edge.data?.timeout
      if (timeout && timeout > 0) after[String(timeout)] = { target: edge.target }
    })
    const children = nodes.filter((child) => child.parentId === node.id)
    const childStates: Record<string, ExportStateConfig> = {}
    children.forEach((child) => {
      const childTransitions: Record<string, Array<{ target: string }>> = {}
      const childAfter: Record<string, { target: string }> = {}
      edges.filter((edge) => edge.source === child.id).forEach((edge) => {
        const event = String(edge.data?.event ?? 'EVENT')
        childTransitions[event] = [...(childTransitions[event] ?? []), { target: edge.target }]
        const timeout = edge.data?.timeout
        if (timeout && timeout > 0) childAfter[String(timeout)] = { target: edge.target }
      })
      childStates[child.id] = { states: {}, on: childTransitions, after: childAfter }
    })
    states[node.id] = {
      initial: children.find((child) => child.data.initial)?.id,
      states: childStates,
      on: transitions,
      after,
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
    const timeoutLabel = edge.data?.timeout ? ` ⏱${formatDuration(edge.data.timeout)}` : ''
    const label = [edge.data?.event, edge.data?.condition ? `[${edge.data.condition}]` : '', edge.data?.action].filter(Boolean).join(' / ') + timeoutLabel
    lines.push(`  ${safeId(edge.source)} --> ${safeId(edge.target)}: ${label || 'event'}`)
  })
  nodes.filter((node) => node.data.kind === 'final').forEach((node) => lines.push(`  ${safeId(node.id)} --> [*]`))
  return lines.join('\n')
}
