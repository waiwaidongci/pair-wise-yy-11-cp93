import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import { PlayArrowOutlined, RestartAlt } from '@mui/icons-material'
import { useState } from 'react'
import { useMachineStore } from '../stores/machine'

export default function SimulationPanel() {
  const store = useMachineStore()
  const [customEvent, setCustomEvent] = useState('')
  const current = store.nodes.find((node) => node.id === store.currentStateId)
  const events = [...new Set(store.edges.filter((edge) => edge.source === store.currentStateId).map((edge) => String(edge.data?.event ?? '')))]

  return (
    <section className="simulation-panel">
      <div className="simulation-head">
        <div>
          <Typography variant="subtitle2">状态模拟器</Typography>
          <Typography variant="caption" color="text.secondary">当前：{current?.data.label ?? '未进入状态'}</Typography>
        </div>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Chip size="small" label={`事件轨迹 ${store.trace.length}`} />
          <Button size="small" startIcon={<RestartAlt />} onClick={store.resetSimulation}>重置</Button>
        </Stack>
      </div>
      <Stack direction="row" spacing={0.7} sx={{ my: 1, flexWrap: 'wrap' }}>
        {events.map((event) => event && <Button key={event} size="small" variant="contained" startIcon={<PlayArrowOutlined />} onClick={() => store.sendEvent(event)}>{event}</Button>)}
        <TextField size="small" label="自定义事件" value={customEvent} onChange={(event) => setCustomEvent(event.target.value.toUpperCase())} sx={{ width: 150 }} />
        <Button size="small" disabled={!customEvent} onClick={() => { store.sendEvent(customEvent); setCustomEvent('') }}>发送</Button>
      </Stack>
      <Box className="context-strip">
        {Object.entries(store.context).map(([name, value]) => (
          <label key={name}>
            <span>{name}</span>
            <input value={String(value)} onChange={(event) => {
              const variable = store.variables.find((item) => item.name === name)
              const next = variable?.type === 'number' ? Number(event.target.value) : variable?.type === 'boolean' ? event.target.value === 'true' : event.target.value
              store.setContextValue(name, next)
            }} />
          </label>
        ))}
      </Box>
      <div className="trace-list">
        {store.trace.length === 0 && <span className="empty-trace">发送事件后，这里会显示完整执行轨迹。</span>}
        {[...store.trace].reverse().map((entry) => {
          const from = store.nodes.find((node) => node.id === entry.from)?.data.label ?? entry.from
          const to = store.nodes.find((node) => node.id === entry.to)?.data.label ?? entry.to
          return (
            <div key={entry.id} className={`trace-item ${entry.accepted ? 'accepted' : 'rejected'}`}>
              <span className="trace-time">{entry.timestamp}</span>
              <strong>{entry.event}</strong>
              <span>{from} → {to}</span>
              <small>{entry.reason || [entry.condition, entry.action].filter(Boolean).join(' / ') || '无条件动作'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}
