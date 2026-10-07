import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { TransitionEdge as TransitionEdgeType } from '../types/machine'
import { formatClock } from '../utils/machine'

export default function TransitionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<TransitionEdgeType>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 18,
  })
  const timeout = data?.timeoutMs
  const label = [
    data?.event,
    data?.condition,
    typeof timeout === 'number' && timeout > 0 ? `⏱${formatClock(timeout)}` : '',
  ].filter(Boolean).join(' · ')
  const hasTimeout = typeof timeout === 'number' && timeout > 0
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#2563eb' : hasTimeout ? '#d97706' : '#728299', strokeWidth: selected ? 2.5 : 1.8, strokeDasharray: hasTimeout ? '7 4' : undefined }} />
      <EdgeLabelRenderer>
        <div className={`edge-label ${hasTimeout ? 'has-timeout' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          {label || 'EVENT'}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
