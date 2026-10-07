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
  /** 等待时限（毫秒）。进入源状态后开始计时，时限内收到匹配事件则取消计时，到点仍未处理则自动走该转移。0 或 undefined 表示不限制。 */
  timeout?: number
}

export type TransitionEdge = Edge<TransitionData, 'transition'>

export interface ContextVariable {
  name: string
  type: 'number' | 'string' | 'boolean'
  initial: ContextValue
}

export interface TraceEntry {
  id: string
  event: string
  from: string
  to: string
  condition: string
  action: string
  contextAfter: Record<string, ContextValue>
  timestamp: string
  /** 虚拟时钟时间（毫秒），用于在轨迹中区分同时刻的事件与超时顺序 */
  simClock: number
  /** 触发方式：事件触发 或 超时触发 */
  trigger: 'event' | 'timeout'
  accepted: boolean
  reason?: string
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
