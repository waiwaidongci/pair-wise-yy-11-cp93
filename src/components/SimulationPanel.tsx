import { Box, Button, Chip, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { FastForwardOutlined, PlayArrowOutlined, RestartAlt, ScheduleOutlined, SkipNextOutlined } from '@mui/icons-material'
import { useState } from 'react'
import { useMachineStore } from '../stores/machine'
import { formatClock } from '../utils/machine'

export default function SimulationPanel() {
  const store = useMachineStore()
  const [customEvent, setCustomEvent] = useState('')
  const current = store.nodes.find((node) => node.id === store.currentStateId)
  const events = [...new Set(store.edges.filter((edge) => edge.source === store.currentStateId).map((edge) => String(edge.data?.event ?? '')))]
  const pendingTimers = store.timers
    .filter((timer) => timer.sourceId === store.currentStateId)
    .sort((a, b) => a.deadline - b.deadline)

  return (
    <section className="simulation-panel">
      <div className="simulation-head">
        <div>
          <Typography variant="subtitle2">状态模拟器</Typography>
          <Typography variant="caption" color="text.secondary">当前：{current?.data.label ?? '未进入状态'}</Typography>
        </div>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Chip size="small" icon={<ScheduleOutlined />} label={`虚拟时钟 T+${formatClock(store.clock)}`} color={pendingTimers.length ? 'primary' : 'default'} variant={pendingTimers.length ? 'filled' : 'outlined'} />
          <Chip size="small" label={`事件轨迹 ${store.trace.length}`} />
          <Button size="small" startIcon={<RestartAlt />} onClick={store.resetSimulation}>重置</Button>
        </Stack>
      </div>
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
        <Tooltip title="推快虚拟时钟，到点的超时会立即执行">
          <Button size="small" variant="outlined" startIcon={<FastForwardOutlined />} onClick={() => store.advanceClock(1000)}>+1s</Button>
        </Tooltip>
        <Button size="small" variant="outlined" onClick={() => store.advanceClock(10000)}>+10s</Button>
        <Button size="small" variant="outlined" onClick={() => store.advanceClock(30000)}>+30s</Button>
        <Tooltip title="直接推进到最近一个计时到点">
          <span>
            <Button size="small" variant="outlined" startIcon={<SkipNextOutlined />} disabled={!pendingTimers.length} onClick={store.advanceToNextTimer}>到下一到点</Button>
          </span>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">超时与事件同时到点时，超时先执行，轨迹按 #序号 排列</Typography>
      </Stack>
      {pendingTimers.length > 0 && (
        <div className="timer-strip">
          {pendingTimers.map((timer) => (
            <span key={timer.id} className="timer-chip" title={`进入状态于 T+${formatClock(timer.startedAt)}，时限 ${formatClock(timer.timeoutMs)}`}>
              ⏱ {timer.event} · 还剩 {formatClock(Math.max(0, timer.deadline - store.clock))}（到点 T+{formatClock(timer.deadline)}）
            </span>
          ))}
        </div>
      )}
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
        {store.trace.length === 0 && <span className="empty-trace">发送事件或推进时钟后，这里会显示完整执行轨迹。</span>}
        {[...store.trace].reverse().map((entry) => {
          const from = store.nodes.find((node) => node.id === entry.from)?.data.label ?? entry.from
          const to = store.nodes.find((node) => node.id === entry.to)?.data.label ?? entry.to
          return (
            <div key={entry.id} className={`trace-item ${entry.accepted ? 'accepted' : 'rejected'} ${entry.trigger === 'timeout' ? 'timeout' : ''}`} title={`真实时间 ${entry.timestamp}`}>
              <span className="trace-time">#{entry.seq} T+{formatClock(entry.clock)}</span>
              <strong>{entry.trigger === 'timeout' ? `⏱ ${entry.event}` : entry.event}</strong>
              <span>{from} → {to}</span>
              <small>{entry.reason || [entry.note, entry.condition, entry.action].filter(Boolean).join(' / ') || '无条件动作'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}
