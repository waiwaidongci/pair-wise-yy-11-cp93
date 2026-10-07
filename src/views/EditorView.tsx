import {
  AppBar,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  FactCheckOutlined,
  PlayArrowOutlined,
  RestartAlt,
} from '@mui/icons-material'
import { useState } from 'react'
import MachineCanvas from '../components/MachineCanvas'
import MachineInspector from '../components/MachineInspector'
import MachineSidebar from '../components/MachineSidebar'
import SimulationPanel from '../components/SimulationPanel'
import { useMachineStore } from '../stores/machine'
import type { MachineDocument } from '../types/machine'
import { compileMachine, mermaidDiagram, xstateConfig } from '../utils/machine'

export default function EditorView() {
  const store = useMachineStore()
  const [issueOpen, setIssueOpen] = useState(false)

  function download(name: string, content: string, type = 'text/plain') {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
    store.notice = `${name} 已导出`
  }

  function validate() {
    const issues = store.validate()
    setIssueOpen(true)
    if (!issues.length) store.notice = '结构校验通过'
  }

  function exportXState() {
    const config = xstateConfig(store.nodes, store.edges, store.variables)
    try {
      compileMachine(store.nodes, store.edges, store.variables)
      download('machine.xstate.json', JSON.stringify(config, null, 2), 'application/json')
    } catch (error) {
      store.notice = `XState 配置无法编译：${error instanceof Error ? error.message : '未知错误'}`
    }
  }

  function exportJson() {
    const document: MachineDocument = {
      version: 1,
      name: store.name,
      nodes: store.nodes,
      edges: store.edges,
      variables: store.variables,
      savedAt: new Date().toISOString(),
    }
    download(`${store.name}.machine.json`, JSON.stringify(document, null, 2), 'application/json')
  }

  async function importJson(file: File) {
    try {
      const document = JSON.parse(await file.text()) as MachineDocument
      if (!Array.isArray(document.nodes) || !Array.isArray(document.edges)) throw new Error('JSON 缺少 nodes 或 edges')
      store.loadDocument(document)
    } catch (error) {
      store.notice = error instanceof Error ? error.message : '状态机 JSON 无效'
    }
  }

  return (
    <div className="app-shell">
      <AppBar position="static" color="inherit" elevation={0} className="topbar">
        <Toolbar variant="dense">
          <div className="brand-mark">SB</div>
          <div className="brand-copy"><strong>StateBoard</strong><span>状态机可视化编辑器</span></div>
          <TextField
            size="small"
            value={store.name}
            onChange={(event) => store.setName(event.target.value)}
            sx={{ width: 260 }}
          />
          <div style={{ flex: 1 }} />
          <Button size="small" startIcon={<PlayArrowOutlined />} onClick={store.resetSimulation}>回到初始</Button>
          <Button size="small" startIcon={<RestartAlt />} onClick={store.reset}>重置</Button>
          <Button size="small" startIcon={<CloudUploadOutlined />} component="label">
            导入
            <input hidden type="file" accept=".json" onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} />
          </Button>
          <Button size="small" startIcon={<CloudDownloadOutlined />} onClick={exportJson}>导出 JSON</Button>
          <Tooltip title="导出 stateDiagram-v2"><Button size="small" startIcon={<CodeOutlined />} onClick={() => download('machine.mmd', mermaidDiagram(store.nodes, store.edges))}>Mermaid</Button></Tooltip>
          <Button size="small" variant="outlined" startIcon={<FactCheckOutlined />} onClick={validate}>结构校验</Button>
          <Button size="small" color="primary" variant="contained" startIcon={<CodeOutlined />} onClick={exportXState}>导出 XState</Button>
        </Toolbar>
      </AppBar>
      <main className="machine-grid">
        <MachineSidebar />
        <div className="center-column">
          <MachineCanvas />
          <SimulationPanel />
        </div>
        <MachineInspector />
      </main>
      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>状态机结构校验 · {store.issues.length} 个问题</DialogTitle>
        <DialogContent>
          {store.issues.length === 0 ? (
            <Typography color="success.main" sx={{ py: 3 }}>不可达状态、缺失转移、重复事件等检查均已通过。</Typography>
          ) : (
            <List>
              {store.issues.map((issue) => (
                <ListItem key={issue.id} divider onClick={() => {
                  if (issue.nodeId) store.selectNode(issue.nodeId)
                  if (issue.edgeId) store.selectEdge(issue.edgeId)
                  setIssueOpen(false)
                }}>
                  <ListItemText
                    primary={`${issue.severity === 'error' ? '[错误]' : '[警告]'} ${issue.title}`}
                    secondary={issue.detail}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
      <Snackbar open={Boolean(store.notice)} autoHideDuration={2600} message={store.notice} onClose={() => { store.notice = '' }} />
    </div>
  )
}
