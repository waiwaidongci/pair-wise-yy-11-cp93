import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useRef } from 'react'
import { useMachineStore } from '../stores/machine'
import StateNodeCard from './StateNodeCard'
import TransitionEdgeComponent from './TransitionEdge'

const nodeTypes = { state: StateNodeCard }
const edgeTypes = { transition: TransitionEdgeComponent }

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null)
  const reactFlow = useReactFlow()
  const store = useMachineStore()
  const { fitView } = reactFlow

  useEffect(() => {
    const timer = window.setTimeout(() => fitView({ padding: 0.18, duration: 300 }), 100)
    return () => window.clearTimeout(timer)
  }, [fitView, store.nodes.length])

  function dropState(event: React.DragEvent) {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/x-machine-state') as 'simple' | 'compound' | 'final'
    if (!kind) return
    store.addState(kind)
    store.notice = '已通过拖拽添加状态'
  }

  function connect(connection: Connection) {
    store.connect(connection)
  }

  return (
    <div ref={wrapper} className="flow-wrap" onDrop={dropState} onDragOver={(event) => event.preventDefault()}>
      <ReactFlow
        nodes={store.nodes}
        edges={store.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={store.onNodesChange}
        onEdgesChange={store.onEdgesChange}
        onConnect={connect}
        onNodeClick={(_, node) => store.selectNode(node.id)}
        onEdgeClick={(_, edge) => store.selectEdge(edge.id)}
        onPaneClick={() => { store.selectNode(null); store.selectEdge(null) }}
        fitView
        minZoom={0.25}
        maxZoom={1.8}
        selectionOnDrag
        panOnDrag={[1, 2]}
        elevateEdgesOnSelect
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#c5d0de" />
        <MiniMap pannable zoomable nodeColor={(node) => node.data.kind === 'final' ? '#dc2626' : node.data.kind === 'compound' ? '#7c3aed' : '#2563eb'} />
        <Controls />
        {store.notice && <Panel position="top-center"><div className="canvas-toast">{store.notice}</div></Panel>}
      </ReactFlow>
    </div>
  )
}

export default function MachineCanvas() {
  return <ReactFlowProvider><CanvasInner /></ReactFlowProvider>
}
