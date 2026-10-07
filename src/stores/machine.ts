import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  ContextValue,
  ContextVariable,
  MachineDocument,
  StateNode,
  TraceEntry,
  TransitionEdge,
  TransitionData,
  ValidationIssue,
} from '../types/machine'
import {
  createState,
  evaluateCondition,
  resolveValue,
  sampleMachine,
  sendEventId,
  validateMachine,
} from '../utils/machine'

interface MachineState {
  name: string
  nodes: StateNode[]
  edges: TransitionEdge[]
  variables: ContextVariable[]
  context: Record<string, ContextValue>
  currentStateId: string | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  trace: TraceEntry[]
  issues: ValidationIssue[]
  notice: string
  setName: (name: string) => void
  onNodesChange: (changes: NodeChange<StateNode>[]) => void
  onEdgesChange: (changes: EdgeChange<TransitionEdge>[]) => void
  connect: (connection: Connection) => void
  addState: (kind: StateNode['data']['kind'], parentId?: string | null) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  updateNode: (id: string, patch: Partial<StateNode['data']>) => void
  updateEdge: (id: string, patch: Partial<TransitionData>) => void
  deleteSelection: () => void
  setInitial: (id: string) => void
  addVariable: () => void
  updateVariable: (name: string, patch: Partial<ContextVariable>) => void
  removeVariable: (name: string) => void
  setContextValue: (name: string, value: ContextValue) => void
  validate: () => ValidationIssue[]
  sendEvent: (event: string, synthetic?: boolean) => void
  resetSimulation: () => void
  loadDocument: (document: MachineDocument) => void
  reset: () => void
}

const initial = sampleMachine()

function currentContext(variables: ContextVariable[]) {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.initial]))
}

export const useMachineStore = create<MachineState>()(immer((set, get) => ({
  name: '费用申请审批状态机',
  nodes: initial.nodes,
  edges: initial.edges,
  variables: initial.variables,
  context: currentContext(initial.variables),
  currentStateId: 'idle',
  selectedNodeId: 'idle',
  selectedEdgeId: null,
  trace: [],
  issues: [],
  notice: '已加载审批流程示例',

  setName: (name) => set((state: MachineState) => { state.name = name }),

  onNodesChange: (changes) => set((state: MachineState) => {
    state.nodes = applyNodeChanges(changes, state.nodes)
  }),

  onEdgesChange: (changes) => set((state: MachineState) => {
    state.edges = applyEdgeChanges(changes, state.edges)
  }),

  connect: (connection) => set((state: MachineState) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const edge: TransitionEdge = {
      ...connection,
      id: `transition-${Date.now().toString(36)}`,
      type: 'transition',
      data: { event: 'NEXT', condition: '', action: '', assignments: [] },
    }
    state.edges = addEdge(edge, state.edges) as TransitionEdge[]
    state.selectedEdgeId = edge.id
    state.selectedNodeId = null
    state.notice = '已创建转移，请在属性面板配置事件'
  }),

  addState: (kind, parentId = null) => set((state: MachineState) => {
    const parent = parentId ? state.nodes.find((node) => node.id === parentId && node.data.kind === 'compound') : undefined
    const siblings = state.nodes.filter((node) => node.parentId === parent?.id).length
    const rootCount = state.nodes.filter((node) => !node.parentId).length
    const position = parent
      ? { x: 35 + (siblings % 2) * 190, y: 90 + Math.floor(siblings / 2) * 95 }
      : { x: 80 + (rootCount % 4) * 240, y: 100 + Math.floor(rootCount / 4) * 180 }
    const stateNode = createState(kind === 'compound' ? '新复合状态' : kind === 'final' ? '结束状态' : '新状态', position, kind, parent?.id)
    if (kind === 'compound') stateNode.data.description = '可包含子状态的复合区域'
    state.nodes.push(stateNode)
    if (kind === 'compound' && siblings === 0) stateNode.data.initial = true
    state.selectedNodeId = stateNode.id
    state.selectedEdgeId = null
    state.notice = `已添加${kind === 'compound' ? '复合状态' : kind === 'final' ? '结束状态' : '状态'}`
  }),

  selectNode: (id) => set((state: MachineState) => {
    state.selectedNodeId = id
    state.selectedEdgeId = null
  }),

  selectEdge: (id) => set((state: MachineState) => {
    state.selectedEdgeId = id
    state.selectedNodeId = null
  }),

  updateNode: (id, patch) => set((state: MachineState) => {
    const node = state.nodes.find((item) => item.id === id)
    if (node) node.data = { ...node.data, ...patch }
  }),

  updateEdge: (id, patch) => set((state: MachineState) => {
    const edge = state.edges.find((item) => item.id === id)
    if (edge) {
      edge.data = {
        event: patch.event ?? edge.data?.event ?? 'NEXT',
        condition: patch.condition ?? edge.data?.condition ?? '',
        action: patch.action ?? edge.data?.action ?? '',
        assignments: patch.assignments ?? edge.data?.assignments ?? [],
      }
    }
  }),

  deleteSelection: () => set((state: MachineState) => {
    if (state.selectedNodeId) {
      const id = state.selectedNodeId
      const childIds = state.nodes.filter((node) => node.parentId === id).map((node) => node.id)
      state.nodes = state.nodes.filter((node) => node.id !== id && node.parentId !== id)
      const removed = new Set([id, ...childIds])
      state.edges = state.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target))
      state.selectedNodeId = null
      if (state.currentStateId && removed.has(state.currentStateId)) state.currentStateId = null
    } else if (state.selectedEdgeId) {
      state.edges = state.edges.filter((edge) => edge.id !== state.selectedEdgeId)
      state.selectedEdgeId = null
    }
  }),

  setInitial: (id) => set((state: MachineState) => {
    const node = state.nodes.find((item) => item.id === id)
    if (!node) return
    state.nodes.filter((item) => item.parentId === node.parentId).forEach((item) => { item.data.initial = false })
    node.data.initial = true
    if (!node.parentId) state.currentStateId = node.id
  }),

  addVariable: () => set((state: MachineState) => {
    let index = state.variables.length + 1
    let name = `variable${index}`
    while (state.variables.some((item) => item.name === name)) name = `variable${++index}`
    state.variables.push({ name, type: 'number', initial: 0 })
    state.context[name] = 0
  }),

  updateVariable: (name, patch) => set((state: MachineState) => {
    const variable = state.variables.find((item) => item.name === name)
    if (!variable) return
    const previousName = variable.name
    Object.assign(variable, patch)
    if (patch.name && patch.name !== previousName) {
      state.context[patch.name] = state.context[previousName] ?? variable.initial
      delete state.context[previousName]
    }
    if (patch.initial !== undefined) state.context[variable.name] = patch.initial
  }),

  removeVariable: (name) => set((state: MachineState) => {
    state.variables = state.variables.filter((variable) => variable.name !== name)
    delete state.context[name]
  }),

  setContextValue: (name, value) => set((state: MachineState) => { state.context[name] = value }),

  validate: () => {
    const issues = validateMachine(get().nodes, get().edges)
    set((state: MachineState) => {
      state.issues = issues
      state.notice = issues.length ? `校验发现 ${issues.length} 个问题` : '校验通过：状态机结构完整'
    })
    return issues
  },

  sendEvent: (event, synthetic = false) => {
    const state = get()
    const current = state.currentStateId
    if (!current) {
      set((draft: MachineState) => { draft.notice = '模拟尚未进入任何状态' })
      return
    }
    const candidates = state.edges.filter((edge) => edge.source === current && String(edge.data?.event ?? '') === event)
    const edge = candidates.find((candidate) => evaluateCondition(String(candidate.data?.condition ?? ''), state.context))
    const from = state.nodes.find((node) => node.id === current)
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })

    if (!edge) {
      const reason = candidates.length ? '条件均未满足' : '当前状态没有订阅该事件'
      set((draft: MachineState) => {
        draft.trace.push({
          id: sendEventId(),
          event,
          from: current,
          to: current,
          condition: '',
          action: '忽略事件',
          contextAfter: JSON.parse(JSON.stringify(draft.context)) as Record<string, ContextValue>,
          timestamp,
          accepted: false,
          reason,
        })
        draft.notice = `事件 ${event} 未触发：${reason}`
      })
      return
    }

    const nextContext = { ...state.context }
    ;(edge.data?.assignments ?? []).forEach((assignment) => {
      if (assignment.variable) nextContext[assignment.variable] = resolveValue(assignment.expression, nextContext)
    })
    const target = state.nodes.find((node) => node.id === edge.target)
    set((draft: MachineState) => {
      draft.context = nextContext
      draft.currentStateId = edge.target
      draft.trace.push({
        id: sendEventId(),
        event,
        from: from?.id ?? current,
        to: edge.target,
        condition: String(edge.data?.condition ?? ''),
        action: String(edge.data?.action ?? ''),
        contextAfter: JSON.parse(JSON.stringify(nextContext)) as Record<string, ContextValue>,
        timestamp,
        accepted: true,
      })
      draft.notice = synthetic
        ? `模拟执行：${from?.data.label ?? current} → ${target?.data.label ?? edge.target}`
        : `事件 ${event} 已触发，进入${target?.data.label ?? edge.target}`
    })
  },

  resetSimulation: () => set((state: MachineState) => {
    const initialNode = state.nodes.find((node) => node.data.initial && !node.parentId)
      ?? state.nodes.find((node) => !node.parentId && node.data.kind !== 'compound')
    state.currentStateId = initialNode?.id ?? null
    state.context = currentContext(state.variables)
    state.trace = []
    state.notice = '模拟已回到初始状态'
  }),

  loadDocument: (document) => set((state: MachineState) => {
    state.name = document.name
    state.nodes = document.nodes
    state.edges = document.edges
    state.variables = document.variables
    state.context = currentContext(document.variables)
    state.selectedNodeId = null
    state.selectedEdgeId = null
    state.currentStateId = document.nodes.find((node) => node.data.initial && !node.parentId)?.id ?? null
    state.trace = []
    state.notice = '状态机 JSON 已导入'
  }),

  reset: () => set((state: MachineState) => {
    const fresh = sampleMachine()
    state.name = '费用申请审批状态机'
    state.nodes = fresh.nodes
    state.edges = fresh.edges
    state.variables = fresh.variables
    state.context = currentContext(fresh.variables)
    state.currentStateId = 'idle'
    state.selectedNodeId = 'idle'
    state.selectedEdgeId = null
    state.trace = []
    state.issues = []
    state.notice = '已恢复审批流程示例'
  }),
})))
