import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { Add, DeleteOutline, FlagOutlined, PlayArrowOutlined, StopOutlined } from '@mui/icons-material'
import { useMachineStore } from '../stores/machine'

export default function MachineSidebar() {
  const store = useMachineStore()
  const selected = store.nodes.find((node) => node.id === store.selectedNodeId)
  const parentId = selected?.data.kind === 'compound' ? selected.id : null

  return (
    <aside className="side-panel">
      <Typography variant="subtitle2">状态组件</Typography>
      <Typography variant="caption" color="text.secondary">添加到根节点，或添加到当前选中的复合状态</Typography>
      <Stack spacing={0.8} sx={{ my: 1.4 }}>
        <Button variant="outlined" startIcon={<FlagOutlined />} onClick={() => store.addState('simple', parentId)}>普通状态</Button>
        <Button variant="outlined" startIcon={<PlayArrowOutlined />} onClick={() => store.addState('compound', null)}>复合状态 / 子状态容器</Button>
        <Button variant="outlined" startIcon={<StopOutlined />} onClick={() => store.addState('final', parentId)}>结束状态</Button>
      </Stack>
      <Box className="sidebar-tip">
        <strong>连线即转移</strong>
        <span>拖拽端口创建转移，然后配置事件、条件和动作。</span>
      </Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2, mb: 1 }}>
        <Typography variant="subtitle2">上下文变量</Typography>
        <IconButton size="small" onClick={store.addVariable}><Add fontSize="small" /></IconButton>
      </Stack>
      <Stack spacing={1}>
        {store.variables.map((variable) => (
          <Box key={variable.name} className="variable-card">
            <TextField
              size="small"
              value={variable.name}
              onChange={(event) => store.updateVariable(variable.name, { name: event.target.value })}
            />
            <Stack direction="row" spacing={0.6}>
              <TextField
                select
                size="small"
                value={variable.type}
                onChange={(event) => store.updateVariable(variable.name, { type: event.target.value as typeof variable.type })}
              >
                <MenuItem value="number">number</MenuItem>
                <MenuItem value="string">string</MenuItem>
                <MenuItem value="boolean">boolean</MenuItem>
              </TextField>
              <TextField
                size="small"
                value={String(variable.initial)}
                onChange={(event) => {
                  const raw = event.target.value
                  const value = variable.type === 'number' ? Number(raw) : variable.type === 'boolean' ? raw === 'true' : raw
                  store.updateVariable(variable.name, { initial: value })
                }}
              />
              <IconButton size="small" color="error" onClick={() => store.removeVariable(variable.name)}><DeleteOutline fontSize="small" /></IconButton>
            </Stack>
          </Box>
        ))}
      </Stack>
    </aside>
  )
}
