# StateBoard 状态机可视化编辑器

技术栈：React、TypeScript、Vite、React Flow、XState、MUI、Zustand、React Router。

## 功能

- 在画布上添加普通状态、复合状态、子状态和结束状态，通过连线创建转移。
- 每条转移可配置事件、守卫条件、动作和上下文变量赋值。
- 校验不可达状态、缺少转移、复合状态缺初始子状态、空复合状态和重复事件。
- 模拟面板可按事件逐步执行，实时显示上下文、当前状态和完整事件轨迹。
- 导出可编译的 XState 配置、Mermaid `stateDiagram-v2` 和完整状态机 JSON。

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm build
```
