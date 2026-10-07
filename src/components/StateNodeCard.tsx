import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FlagOutlined, PlayCircle, StopOutlined } from '@mui/icons-material'
import type { StateNode } from '../types/machine'
import { useMachineStore } from '../stores/machine'
import { formatDuration } from '../utils/machine'

export default function StateNodeCard({ id, data, selected }: NodeProps<StateNode>) {
  const currentStateId = useMachineStore((state) => state.currentStateId)
  const simClock = useMachineStore((state) => state.simClock)
  const stateEnteredAt = useMachineStore((state) => state.stateEnteredAt)
  const edges = useMachineStore((state) => state.edges)
  const isCurrent = currentStateId === id
  const activeTimers = isCurrent
    ? edges
        .filter((edge) => edge.source === id && edge.data?.timeout && edge.data.timeout > 0)
        .map((edge) => ({ edge, deadline: stateEnteredAt + (edge.data?.timeout ?? 0) }))
    : []
  const earliestDeadline = activeTimers.length ? Math.min(...activeTimers.map((timer) => timer.deadline)) : null
  const remaining = earliestDeadline !== null ? earliestDeadline - simClock : null
  if (data.isGroup) {
    return (
      <div className={`state-node compound-node ${selected ? 'selected' : ''}`}>
        <div className="compound-title"><span>{data.label}</span><small>复合状态 · {data.initial ? '初始' : '普通'}</small></div>
        <div className="compound-body">子状态区域</div>
      </div>
    )
  }
  return (
    <div className={`state-node ${data.kind === 'final' ? 'final-node' : ''} ${data.initial ? 'initial-node' : ''} ${selected ? 'selected' : ''} ${isCurrent ? 'current-node' : ''}`}>
      <Handle id="in" type="target" position={Position.Left} className="state-handle" />
      {data.initial && <div className="initial-marker"><PlayCircle /></div>}
      <div className="state-kind">
        {data.kind === 'final' ? <><StopOutlined /> final</> : <><FlagOutlined /> state</>}
      </div>
      <strong>{data.label}</strong>
      <p>{data.description || '右键配置状态说明与实际业务含义'}</p>
      {isCurrent && <span className="current-label">CURRENT</span>}
      {isCurrent && activeTimers.length > 0 && (
        <span className={`timer-badge ${remaining !== null && remaining <= 0 ? 'due' : ''}`}>
          ⏱ {remaining !== null && remaining > 0 ? formatDuration(remaining) : '已到点'} · {activeTimers.length}
        </span>
      )}
      <Handle id="out" type="source" position={Position.Right} className="state-handle" />
    </div>
  )
}
