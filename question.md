# Requirements Summary

**我们在重构什么：**
重新设计移动端侧边栏，从当前的原生弹窗 + 三层全量加载结构，迁移到扁平的、懒加载的、参考 superset.sh 风格的侧边栏导航。

## 目标侧边栏结构

```
┌─────────────────────────┐
│ ● session-xyz (运行中)   │  ← Active Session 纯展示
│   首句prompt · 10:32     │
├─────────────────────────┤
│ ▼ repo-a                │
│   session-1 首句 · 09:15│  ← 元数据：首句 prompt + 时间 + 状态
│   session-2 首句 · 昨天  │
│   [+ New Session]       │  ← 内联创建
│                         │
│ ▶ repo-b                │  ← 收起状态
│                         │
│ ▶ repo-c                │
│                         │
│ [+ Add Repo]            │  ← 底部添加 repo
└─────────────────────────┘
```

## Key Requirements

- **扁平导航**：所有 repo 平铺在侧边栏内，折叠/展开操作，无页面跳转
- **Active Session 置顶**：纯展示当前正在运行的 session（名称 + 首句 prompt + 时间 + 状态），点击可快速回到当前 session
- **懒加载**：repo 收起时不加载 session 列表；展开时加载该 repo 下 session 元数据（首句 prompt + 时间 + 状态）；点进 session 再加载完整内容
- **New Session 流程**：在目标 repo 下方内联点击 → 创建 → 自动切换到新 session
- **Add Repo 流程**：侧边栏底部入口，用户输入绝对路径，**最好可见文件系统树辅助选择**
- **Remove Repo**：可从侧边栏移除，仅移除列表引用，不删除磁盘文件
- **Session 元数据显示**：首句 prompt + 最后活动时间 + 运行状态
- **No search/filter**：不需要
- **No session 删除/重命名**：不需要

## User Stories

- 作为用户，我想在侧边栏一眼看到当前正在运行的 session，以便知道我的工作状态
- 作为用户，我想展开某个 repo 立即看到它的 session 列表（不加载全部 repo 的数据），以便快速切换工作上下文
- 作为用户，我想在侧边栏内联创建新 session 并自动切换，以便无缝开始新对话
- 作为用户，我想通过浏览文件系统树来添加新 repo，以便减少输入绝对路径的出错率
- 作为用户，我想从列表移除不用的 repo 但不删除磁盘文件，以便保持侧边栏整洁

## Out of Scope

- Session 搜索/过滤功能
- Session 删除/重命名
- Session 内容的编辑
- 跨 repo 的批量操作

## Key Decisions Made

- **懒加载而非内存缓存**：展开 repo 时才加载 session 元数据，避免 300MB 全量 IO
- **扁平结构取代三层嵌套**：减少导航深度，提升切换效率
- **文件系统树辅助 Add Repo**：降低用户输入绝对路径的认知负担
- **内联创建取代原生弹窗**：统一交互风格

## Acceptance Criteria

- 侧边栏可在 2-3 个 repo 间频繁切换，无卡顿，无全量重新加载
- 展开一个 repo 只触发该 repo 的 session 元数据加载
- New Session 在侧边栏内联完成，无原生弹窗，创建后自动切换
- Add Repo 可输入路径或浏览文件系统树
- Remove Repo 仅从列表移除，不触发磁盘删除
- Active Session 置顶展示，显示名称 + 首句 prompt + 时间 + 状态

## Open Questions for /research

- 当前 session 元数据（首句 prompt、时间、状态）是存在哪里的？是 session 文件内的字段还是需要解析 session 文件才能获取？
- session 文件格式是什么？（JSON？自定义格式？）这决定元数据提取的成本
- 当前三层结构的渲染逻辑在哪里？侧边栏组件的代码边界清晰吗？
- "Active Session" 的运行状态目前是怎么判断的？有现成的状态管理吗？
- Add Repo 的文件系统树浏览能力——当前技术栈（纯 HTML + JS）是否已有文件系统访问的接口，还是需要新增？
