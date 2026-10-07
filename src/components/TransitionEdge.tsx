import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { TransitionEdge as TransitionEdgeType } from '../types/machine'

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
  const label = [data?.event, data?.condition].filter(Boolean).join(' · ')
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#2563eb' : '#728299', strokeWidth: selected ? 2.5 : 1.8 }} />
      <EdgeLabelRenderer>
        <div className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          {label || 'EVENT'}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
