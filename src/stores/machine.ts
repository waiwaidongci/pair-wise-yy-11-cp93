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
  ActiveTimer,
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
  formatClock,
  normalizeTransitionData,
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
  /** 模拟虚拟时钟（毫秒），只能通过推进按钮前进 */
  clock: number
  /** 当前等待中的超时计时 */
  timers: ActiveTimer[]
  /** 结构版本：改动结构或转移时递增，用于作废旧计时 */
  structureVersion: number
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
  advanceClock: (ms: number) => void
  advanceToNextTimer: () => void
  resetSimulation: () => void
  loadDocument: (document: MachineDocument) => void
  reset: () => void
}

const initial = sampleMachine()

function currentContext(variables: ContextVariable[]) {
  return Object.fromEntries(variables.map((variable) => [variable.name, variable.initial]))
}

function timerId() {
  return `timer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 为进入的状态武装超时计时：源状态为该状态且配置了等待时限的转移各产生一个计时 */
function createTimers(edges: TransitionEdge[], stateId: string | null, clock: number, generation: number): ActiveTimer[] {
  if (!stateId) return []
  return edges
    .filter((edge) => edge.source === stateId && typeof edge.data?.timeoutMs === 'number' && edge.data.timeoutMs > 0)
    .map((edge) => ({
      id: timerId(),
      edgeId: edge.id,
      sourceId: stateId,
      event: String(edge.data?.event ?? ''),
      timeoutMs: edge.data!.timeoutMs!,
      startedAt: clock,
      deadline: clock + edge.data!.timeoutMs!,
      generation,
    }))
}

function armTimersForState(draft: MachineState, stateId: string | null) {
  draft.timers.push(...createTimers(draft.edges, stateId, draft.clock, draft.structureVersion))
}

/** 取消某状态的全部计时（事件被接受、离开源状态时调用），返回取消数量 */
function cancelTimersForState(draft: MachineState, stateId: string) {
  const before = draft.timers.length
  draft.timers = draft.timers.filter((timer) => timer.sourceId !== stateId)
  return before - draft.timers.length
}

function pushTrace(draft: MachineState, entry: Omit<TraceEntry, 'id' | 'seq' | 'timestamp' | 'clock'>) {
  draft.trace.push({
    id: sendEventId(),
    seq: draft.trace.length + 1,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    clock: draft.clock,
    ...entry,
  })
}

function applyAssignments(edge: TransitionEdge, context: Record<string, ContextValue>) {
  const next = { ...context }
  ;(edge.data?.assignments ?? []).forEach((assignment) => {
    if (assignment.variable) next[assignment.variable] = resolveValue(assignment.expression, next)
  })
  return next
}

/**
 * 触发 upto 时刻（含）之前到点的计时，按到点先后依次执行超时转移。
 * 返回触发次数；计时到点与事件同时提交时，先调用本函数即保证超时先执行。
 */
function fireDueTimers(draft: MachineState, upto: number) {
  let fired = 0
  for (;;) {
    const due = draft.timers
      .filter((timer) => timer.deadline <= upto && timer.generation === draft.structureVersion && timer.sourceId === draft.currentStateId)
      .sort((a, b) => a.deadline - b.deadline || a.id.localeCompare(b.id))[0]
    if (!due) break
    draft.timers = draft.timers.filter((timer) => timer.id !== due.id)
    draft.clock = Math.max(draft.clock, due.deadline)
    const edge = draft.edges.find((item) => item.id === due.edgeId)
    const timeoutMs = edge?.data?.timeoutMs
    if (!edge || typeof timeoutMs !== 'number' || timeoutMs <= 0) continue // 转移已删除或时限已移除，计时作废
    const condition = String(edge.data?.condition ?? '')
    if (!evaluateCondition(condition, draft.context)) {
      pushTrace(draft, {
        event: due.event,
        from: due.sourceId,
        to: due.sourceId,
        condition,
        action: String(edge.data?.action ?? ''),
        contextAfter: JSON.parse(JSON.stringify(draft.context)) as Record<string, ContextValue>,
        trigger: 'timeout',
        accepted: false,
        reason: '超时到点但条件未满足',
      })
      continue
    }
    const siblings = cancelTimersForState(draft, due.sourceId)
    const nextContext = applyAssignments(edge, draft.context)
    draft.context = nextContext
    draft.currentStateId = edge.target
    pushTrace(draft, {
      event: due.event,
      from: due.sourceId,
      to: edge.target,
      condition,
      action: String(edge.data?.action ?? ''),
      contextAfter: JSON.parse(JSON.stringify(nextContext)) as Record<string, ContextValue>,
      trigger: 'timeout',
      accepted: true,
      note: `等待 ${formatClock(due.timeoutMs)} 无人处理，超时自动执行${siblings ? `；其余 ${siblings} 个计时已取消` : ''}`,
    })
    armTimersForState(draft, edge.target)
    fired += 1
  }
  return fired
}

/** 结构或转移变更后：作废旧计时，并按当前状态重新武装（重算） */
function invalidateTimers(draft: MachineState) {
  draft.structureVersion += 1
  const discarded = draft.timers.length
  draft.timers = []
  armTimersForState(draft, draft.currentStateId)
  if (discarded) draft.notice = `结构或转移已修改，${discarded} 个计时作废重算`
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
  clock: 0,
  timers: createTimers(initial.edges, 'idle', 0, 0),
  structureVersion: 0,

  setName: (name) => set((state: MachineState) => { state.name = name }),

  onNodesChange: (changes) => set((state: MachineState) => {
    state.nodes = applyNodeChanges(changes, state.nodes)
    if (changes.some((change) => change.type === 'remove' || change.type === 'add')) {
      if (state.currentStateId && !state.nodes.some((node) => node.id === state.currentStateId)) {
        state.currentStateId = null
      }
      invalidateTimers(state)
    }
  }),

  onEdgesChange: (changes) => set((state: MachineState) => {
    state.edges = applyEdgeChanges(changes, state.edges)
    if (changes.some((change) => change.type === 'remove' || change.type === 'add')) {
      invalidateTimers(state)
    }
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
    invalidateTimers(state)
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
    invalidateTimers(state)
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
    if (!node) return
    node.data = { ...node.data, ...patch }
    if (patch.kind !== undefined) invalidateTimers(state)
  }),

  updateEdge: (id, patch) => set((state: MachineState) => {
    const edge = state.edges.find((item) => item.id === id)
    if (edge) {
      edge.data = {
        event: patch.event ?? edge.data?.event ?? 'NEXT',
        condition: patch.condition ?? edge.data?.condition ?? '',
        action: patch.action ?? edge.data?.action ?? '',
        assignments: patch.assignments ?? edge.data?.assignments ?? [],
        timeoutMs: 'timeoutMs' in patch ? patch.timeoutMs : edge.data?.timeoutMs,
      }
      invalidateTimers(state)
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
      invalidateTimers(state)
    } else if (state.selectedEdgeId) {
      state.edges = state.edges.filter((edge) => edge.id !== state.selectedEdgeId)
      state.selectedEdgeId = null
      invalidateTimers(state)
    }
  }),

  setInitial: (id) => set((state: MachineState) => {
    const node = state.nodes.find((item) => item.id === id)
    if (!node) return
    state.nodes.filter((item) => item.parentId === node.parentId).forEach((item) => { item.data.initial = false })
    node.data.initial = true
    if (!node.parentId) state.currentStateId = node.id
    invalidateTimers(state)
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

  sendEvent: (event, synthetic = false) => set((state: MachineState) => {
    // 计时到点与事件同时提交时，超时先执行，轨迹按 seq 记录先后顺序
    fireDueTimers(state, state.clock)
    const current = state.currentStateId
    if (!current) {
      state.notice = '模拟尚未进入任何状态'
      return
    }
    const lastEntry = state.trace[state.trace.length - 1]
    const tieNote = lastEntry?.trigger === 'timeout' && lastEntry.clock === state.clock
      ? '与到点超时同时刻提交，超时已先执行（见上一条轨迹）'
      : undefined
    const candidates = state.edges.filter((edge) => edge.source === current && String(edge.data?.event ?? '') === event)
    const edge = candidates.find((candidate) => evaluateCondition(String(candidate.data?.condition ?? ''), state.context))
    const from = state.nodes.find((node) => node.id === current)

    if (!edge) {
      const reason = candidates.length ? '条件均未满足' : '当前状态没有订阅该事件'
      pushTrace(state, {
        event,
        from: current,
        to: current,
        condition: '',
        action: '忽略事件',
        contextAfter: JSON.parse(JSON.stringify(state.context)) as Record<string, ContextValue>,
        trigger: 'event',
        accepted: false,
        reason,
        note: tieNote,
      })
      state.notice = `事件 ${event} 未触发：${reason}`
      return
    }

    const cancelled = cancelTimersForState(state, current)
    const nextContext = applyAssignments(edge, state.context)
    const target = state.nodes.find((node) => node.id === edge.target)
    state.context = nextContext
    state.currentStateId = edge.target
    pushTrace(state, {
      event,
      from: from?.id ?? current,
      to: edge.target,
      condition: String(edge.data?.condition ?? ''),
      action: String(edge.data?.action ?? ''),
      contextAfter: JSON.parse(JSON.stringify(nextContext)) as Record<string, ContextValue>,
      trigger: 'event',
      accepted: true,
      note: [tieNote, cancelled ? `时限内到达，已取消 ${cancelled} 个计时` : ''].filter(Boolean).join('；') || undefined,
    })
    armTimersForState(state, edge.target)
    state.notice = synthetic
      ? `模拟执行：${from?.data.label ?? current} → ${target?.data.label ?? edge.target}`
      : `事件 ${event} 已触发，进入${target?.data.label ?? edge.target}`
  }),

  advanceClock: (ms) => set((state: MachineState) => {
    if (!Number.isFinite(ms) || ms <= 0) {
      state.notice = '推进时长需为正数'
      return
    }
    const target = state.clock + Math.round(ms)
    const fired = fireDueTimers(state, target)
    state.clock = target
    state.notice = fired
      ? `时钟推进 ${formatClock(ms)}，到点触发 ${fired} 个超时转移`
      : `时钟推进 ${formatClock(ms)}，暂无到点计时`
  }),

  advanceToNextTimer: () => set((state: MachineState) => {
    const next = state.timers
      .filter((timer) => timer.generation === state.structureVersion && timer.sourceId === state.currentStateId)
      .sort((a, b) => a.deadline - b.deadline)[0]
    if (!next) {
      state.notice = '当前没有等待中的计时'
      return
    }
    const delta = Math.max(0, next.deadline - state.clock)
    fireDueTimers(state, next.deadline)
    state.clock = Math.max(state.clock, next.deadline)
    state.notice = `时钟推进 ${formatClock(delta)} 至下一到点`
  }),

  resetSimulation: () => set((state: MachineState) => {
    const initialNode = state.nodes.find((node) => node.data.initial && !node.parentId)
      ?? state.nodes.find((node) => !node.parentId && node.data.kind !== 'compound')
    state.currentStateId = initialNode?.id ?? null
    state.context = currentContext(state.variables)
    state.clock = 0
    state.timers = []
    state.trace = []
    armTimersForState(state, state.currentStateId)
    state.notice = '模拟已回到初始状态'
  }),

  loadDocument: (document) => set((state: MachineState) => {
    state.name = document.name
    state.nodes = document.nodes
    // 旧版本文档没有 timeoutMs 等字段，导入时补齐缺省值，无时限的转移照旧可用
    state.edges = document.edges.map((edge) => ({ ...edge, data: normalizeTransitionData(edge.data) }))
    state.variables = document.variables
    state.context = currentContext(document.variables)
    state.selectedNodeId = null
    state.selectedEdgeId = null
    state.currentStateId = document.nodes.find((node) => node.data.initial && !node.parentId)?.id ?? null
    state.clock = 0
    state.timers = []
    state.trace = []
    state.structureVersion += 1
    armTimersForState(state, state.currentStateId)
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
    state.clock = 0
    state.timers = []
    state.structureVersion += 1
    armTimersForState(state, state.currentStateId)
    state.notice = '已恢复审批流程示例'
  }),
})))
