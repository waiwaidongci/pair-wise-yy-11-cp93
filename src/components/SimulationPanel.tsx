import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import { PlayArrowOutlined, RestartAlt, SkipNextOutlined, TimerOutlined } from '@mui/icons-material'
import { useMemo, useState } from 'react'
import { useMachineStore } from '../stores/machine'
import { formatDuration } from '../utils/machine'

export default function SimulationPanel() {
  const store = useMachineStore()
  const [customEvent, setCustomEvent] = useState('')
  const current = store.nodes.find((node) => node.id === store.currentStateId)
  const events = [...new Set(store.edges.filter((edge) => edge.source === store.currentStateId).map((edge) => String(edge.data?.event ?? '')))]

  const timers = useMemo(() => {
    if (!store.currentStateId) return []
    return store.edges
      .filter((edge) => edge.source === store.currentStateId && edge.data?.timeout && edge.data.timeout > 0)
      .map((edge) => {
        const deadline = store.stateEnteredAt + (edge.data?.timeout ?? 0)
        return { edge, deadline, remaining: deadline - store.simClock }
      })
      .sort((a, b) => a.deadline - b.deadline)
  }, [store.edges, store.currentStateId, store.stateEnteredAt, store.simClock])

  const earliestDeadline = timers.length ? timers[0].deadline : null

  return (
    <section className="simulation-panel">
      <div className="simulation-head">
        <div>
          <Typography variant="subtitle2">状态模拟器</Typography>
          <Typography variant="caption" color="text.secondary">当前：{current?.data.label ?? '未进入状态'}</Typography>
        </div>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Chip size="small" icon={<TimerOutlined />} label={`虚拟时钟 ${formatDuration(store.simClock)}`} />
          <Chip size="small" label={`事件轨迹 ${store.trace.length}`} />
          <Button size="small" startIcon={<RestartAlt />} onClick={store.resetSimulation}>重置</Button>
        </Stack>
      </div>
      <Stack direction="row" spacing={0.7} sx={{ my: 1, flexWrap: 'wrap' }}>
        {events.map((event) => event && <Button key={event} size="small" variant="contained" startIcon={<PlayArrowOutlined />} onClick={() => store.sendEvent(event)}>{event}</Button>)}
        <TextField size="small" label="自定义事件" value={customEvent} onChange={(event) => setCustomEvent(event.target.value.toUpperCase())} sx={{ width: 150 }} />
        <Button size="small" disabled={!customEvent} onClick={() => { store.sendEvent(customEvent); setCustomEvent('') }}>发送</Button>
      </Stack>

      <Box className="clock-strip">
        <div className="clock-row">
          <Typography variant="caption" color="text.secondary">推进时钟，观察未到点的等待时限</Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="outlined" onClick={() => store.advanceClock(1000)}>+1秒</Button>
            <Button size="small" variant="outlined" onClick={() => store.advanceClock(10000)}>+10秒</Button>
            <Button size="small" variant="outlined" onClick={() => store.advanceClock(60000)}>+1分钟</Button>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={<SkipNextOutlined />}
              disabled={earliestDeadline === null || earliestDeadline <= store.simClock}
              onClick={() => earliestDeadline !== null && store.advanceClock(earliestDeadline - store.simClock)}
            >
              到下一超时点
            </Button>
          </Stack>
        </div>
        {timers.length > 0 ? (
          <div className="timer-list">
            {timers.map(({ edge, deadline, remaining }) => (
              <div key={edge.id} className={`timer-chip ${remaining <= 0 ? 'due' : ''}`}>
                <span className="timer-event">{String(edge.data?.event ?? 'EVENT')}</span>
                <span className="timer-remain">{remaining > 0 ? `剩余 ${formatDuration(remaining)}` : '已到点'}</span>
                <span className="timer-deadline">@{formatDuration(deadline)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Typography variant="caption" color="text.secondary">当前状态无等待时限。</Typography>
        )}
      </Box>

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
            <div key={entry.id} className={`trace-item ${entry.accepted ? 'accepted' : 'rejected'} ${entry.trigger === 'timeout' ? 'timeout' : ''}`}>
              <span className="trace-time">
                <span>{entry.timestamp}</span>
                <span className="trace-simclock">⏱ {formatDuration(entry.simClock)}</span>
              </span>
              <span className="trace-event">
                <strong>{entry.event}</strong>
                <em className={`trace-trigger ${entry.trigger}`}>{entry.trigger === 'timeout' ? '超时' : '事件'}</em>
              </span>
              <span>{from} → {to}</span>
              <small>{entry.reason || [entry.condition, entry.action].filter(Boolean).join(' / ') || '无条件动作'}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}
