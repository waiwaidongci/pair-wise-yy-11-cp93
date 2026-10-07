import type { Edge, Node } from '@xyflow/react'

export type StateKind = 'simple' | 'compound' | 'final'
export type ContextValue = string | number | boolean

export interface StateNodeData extends Record<string, unknown> {
  label: string
  kind: StateKind
  description: string
  initial: boolean
  isGroup?: boolean
}

export type StateNode = Node<StateNodeData, 'state'>

export interface Assignment {
  variable: string
  expression: string
}

export interface TransitionData extends Record<string, unknown> {
  event: string
  condition: string
  action: string
  assignments: Assignment[]
  /** 等待时限（毫秒）。进入源状态即计时，时限内匹配事件到达则取消计时，到点未处理则沿该转移超时执行。缺省表示无超时。 */
  timeoutMs?: number
}

export type TransitionEdge = Edge<TransitionData, 'transition'>

export interface ContextVariable {
  name: string
  type: 'number' | 'string' | 'boolean'
  initial: ContextValue
}

export interface TraceEntry {
  id: string
  /** 全局单调序号，同一虚拟时刻的多条记录按 seq 排列 */
  seq: number
  event: string
  from: string
  to: string
  condition: string
  action: string
  contextAfter: Record<string, ContextValue>
  timestamp: string
  /** 触发时的虚拟时钟（毫秒） */
  clock: number
  /** event=事件触发；timeout=等待时限到点自动触发 */
  trigger: 'event' | 'timeout'
  accepted: boolean
  reason?: string
  /** 补充说明，例如“已取消 2 个计时”“到点超时已先执行” */
  note?: string
}

/** 模拟运行中的活动计时：进入源状态时武装，事件接受或结构变更时作废 */
export interface ActiveTimer {
  id: string
  edgeId: string
  sourceId: string
  event: string
  timeoutMs: number
  /** 武装时的虚拟时钟（毫秒） */
  startedAt: number
  /** 到点时刻（虚拟时钟，毫秒） */
  deadline: number
  /** 武装时的结构版本，结构或转移变更后作废旧计时 */
  generation: number
}

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  id: string
  severity: IssueSeverity
  title: string
  detail: string
  nodeId?: string
  edgeId?: string
}

export interface MachineDocument {
  version: 1
  name: string
  nodes: StateNode[]
  edges: TransitionEdge[]
  variables: ContextVariable[]
  savedAt: string
}
