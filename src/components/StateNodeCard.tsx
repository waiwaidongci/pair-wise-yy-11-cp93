import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FlagOutlined, PlayCircle, StopOutlined } from '@mui/icons-material'
import type { StateNode } from '../types/machine'
import { useMachineStore } from '../stores/machine'

export default function StateNodeCard({ id, data, selected }: NodeProps<StateNode>) {
  const currentStateId = useMachineStore((state) => state.currentStateId)
  const isCurrent = currentStateId === id
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
      <Handle id="out" type="source" position={Position.Right} className="state-handle" />
    </div>
  )
}
