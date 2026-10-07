# StateBoard 状态机可视化编辑器

技术栈：React、TypeScript、Vite、React Flow、XState、MUI、Zustand、React Router。

## 功能

- 在画布上添加普通状态、复合状态、子状态和结束状态，通过连线创建转移。
- 每条转移可配置事件、守卫条件、动作和上下文变量赋值。
- 转移可配置等待时限：进入源状态即计时，时限内匹配事件到达则取消计时照常转移，一直无人处理才在到点后走超时转移。
- 校验不可达状态、缺少转移、复合状态缺初始子状态、空复合状态和重复事件。
- 模拟面板可按事件逐步执行，实时显示上下文、当前状态和完整事件轨迹。
- 模拟器内置虚拟时钟，可推快时间、跳到下一到点并查看还没到点的计时；超时与事件同时到点时超时先执行，轨迹按序号写清先后顺序。
- 改动结构或转移后，等待中的计时自动作废并按当前状态重算。
- 导出可编译的 XState 配置（超时转移导出为 `after`）、Mermaid `stateDiagram-v2` 和完整状态机 JSON；旧版 JSON 导入后无时限的转移照旧可用。

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm build
```
