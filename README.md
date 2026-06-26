# 9-Slice Scaling

Figma / MasterGo 双平台九宫缩放插件。插件会读取当前选中图层的图片填充，按用户设置的 `top`、`right`、`bottom`、`left` 切片值生成一个可缩放组件。

## 功能

- 支持 Figma 和 MasterGo 双平台运行。
- 选中一个带图片填充的图层后，在 UI 中显示切线预览。
- 使用 canvas 按原图像素裁切 9 个区域。
- 生成一个组件，组件内包含 9 个图片矩形。
- 四角固定，边缘单向拉伸，中间双向拉伸。

## 使用方式

1. 在 Figma 或 MasterGo 中选中一个带图片填充的图层。
2. 运行插件。
3. 设置 `Top`、`Right`、`Bottom`、`Left` 切片值。
4. 点击 `Create Component`。
5. 插件会在原图层右侧生成 `原图层名 / 9-Slice` 组件。

## 开发

```bash
npm install
npm run build
```

常用命令：

```bash
npm run typecheck
npm test
npm run build
npm run watch
```

构建产物位于 `dist/`：

- `dist/code.js`
- `dist/ui.html`
- `dist/manifest.json`
- `dist/manifest.mastergo.json`

## 本地导入

Figma 使用仓库根目录的 `manifest.json`，它指向 `dist/code.js` 和 `dist/ui.html`。

MasterGo 使用构建后的 `dist/manifest.mastergo.json`，其中入口为 `./code.js` 和 `./ui.html`。

## 项目结构

- `src/code.ts`：插件主线程入口和消息分发。
- `src/ui.ts`：插件 UI、预览和 canvas 裁切。
- `src/nine-slice.ts`：平台无关的切片校验、区域计算和约束语义。
- `src/platform/figma.ts`：Figma 平台适配器。
- `src/platform/mastergo.ts`：MasterGo 平台适配器。
- `src/platform/types.ts`：平台适配器契约。
- `.github/workflows/ci.yml`：CI 构建验证。
- `.github/workflows/release.yml`：tag release 打包。

## 规则同步

`CLAUDE.md` 是项目规则源。修改后运行：

```bash
node .cursor/skills/sync-rules/scripts/generate.mjs
```

会生成 `.cursor/rules/*.mdc`。

## 版本历史

| 版本 | 说明 |
| --- | --- |
| [v1.0.2](releases/v1.0.2.md) | 正方形自适应预览区，`ResizeObserver` 动态重绘 |
| [v1.0.1](releases/v1.0.1.md) | 默认切片策略、元数据读写与平台适配改进 |
| [v1.0.0](releases/v1.0.0.md) | 首次公开发布，Figma / MasterGo 双平台九宫缩放 |

## 已知限制

- Figma 与 MasterGo 都没有原生 `border-image` 式九宫缩放属性，本插件通过 9 个图片矩形和约束模拟。
- 某些缩放比例或原型播放环境下可能出现 1px 接缝，需要结合实际平台渲染继续调优。
- 当前默认处理选中图层的第一个图片填充。
