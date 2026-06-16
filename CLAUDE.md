# 项目工作约束

本文件是本仓库的规则源，`.cursor/rules/` 由 `.cursor/skills/sync-rules` 生成。

## 1. 中文输出

对话中面向用户的关键信息使用中文（方案说明、设计决策、确认提问、变更总结等）。除此之外不强制语言要求。

## 2. 方案完成后统一构建

完成一轮代码、配置或构建脚本修改后，必须统一执行一次构建，确认编译通过后再交付或进入下一轮方案。

1. 完成本轮修改
2. 运行 `npm run build`
3. 构建成功后交付或继续下一轮方案
4. 构建失败时先修复编译错误，再回到步骤 2

共享算法变更还必须运行 `npm test`。平台类型或 typings 相关变更还必须运行 `npm run typecheck`。

## 3. 日志与调试约束

禁止在业务代码中散落 `console.*`、临时文件写入或第三方日志库。

- 主线程和平台适配器使用 `src/logger.ts` 的 `logger.info()` / `logger.warn()` / `logger.error()`。
- 主线程日志通过 `api.ui.postMessage` 发送到 UI。
- UI iframe 如需接入本地调试服务，必须集中封装转发函数，不要在业务流程中散落临时 `fetch()`。

排查图片裁切、1px 接缝、约束失效或平台差异时，优先记录这些可复现信息：平台名、输入图片尺寸、切片参数、九宫区域、目标组件尺寸、生成的子节点数量和失败节点名。

## 4. 平台同步修改（Figma ↔ MasterGo）

本项目通过 `src/platform/figma.ts` 与 `src/platform/mastergo.ts` 两个对称适配器支持双平台。对任一平台行为的修改，除平台 API 差异外，必须检查并同步另一个平台。

### 范围

- 主要文件：`src/platform/figma.ts`、`src/platform/mastergo.ts`、`src/platform/types.ts`。
- 涉及选择读取、图片 bytes 获取、图片填充、组件创建、约束映射、错误处理、节点命名等改动，都适用本规则。

### 平台差异参考

| 维度 | Figma | MasterGo |
| --- | --- | --- |
| 全局对象 | `figma` | `mg` |
| 图片读取 | `figma.getImageByHash(imageHash)` | `mg.getImageByHref(imageRef)` |
| 图片创建 | `figma.createImage(bytes).hash` | `await mg.createImage(bytes)` / `href` |
| 填充字段 | `imageHash` | `imageRef` |
| 尺寸 | `node.resize(w, h)` | `safeResize()` 兼容 `resize` 或 `width/height` |
| 约束 | `MIN` / `MAX` / `STRETCH` | `START` / `END` / `STARTANDEND` |

除这些差异外，两侧实现应在结构、命名、错误文案和边界处理上保持一致。

## 5. 九宫组件一致性

Figma 与 MasterGo 生成的九宫组件必须保持同一语义：

1. 同一输入图片尺寸和切片参数应得到相同的 9 个区域坐标。
2. 子节点命名使用同一组 key：`topLeft`、`top`、`topRight`、`left`、`center`、`right`、`bottomLeft`、`bottom`、`bottomRight`。
3. 四角固定，边缘单向拉伸，中间双向拉伸。
4. 校验逻辑、默认切片值和错误文案来自共享层，不在平台适配器里复制分叉。
5. 某个平台必须使用替代实现时，需要在代码注释或变更说明中说明原因。

## 6. Git 提交信息

提交信息只保留一行英文简介（Conventional Commits 风格，如 `feat: ...` / `fix: ...`），不要写多行正文、中文说明或 `Co-Authored-By` 尾注。

## 7. 代码检索路由

理解或定位代码时，先按问题性质选对工具，少做盲目的全文件读取。

- 结构性问题（谁调用 X、改 X 影响什么、X 怎么实现）优先用代码智能层或精确符号搜索。
- 概念性问题（为什么这么设计、哪个模块表达某个领域概念）优先用语义搜索。
- 新仓库没有本地索引时，再退回 `rg`、`Glob` 和定向 `ReadFile`。
- 大文件先定位符号或小范围，再精读相关片段。
