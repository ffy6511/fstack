# Excalidraw 场景

顶层写成：

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "appState": {
    "viewBackgroundColor": "transparent",
    "theme": "light",
    "gridSize": 20
  },
  "files": {},
  "elements": []
}
```

以 `src/content/shorts/figures/transformer.excalidraw` 里同类型的一个元素为样板，改 `id`、位置、尺寸、文字和颜色。保留样板里的 `seed`、`version`、`versionNonce`、`index`、`updated`、`isDeleted`、`groupIds`、`frameId`、`link`、`locked`。`isDeleted` 保持 `false`。不要把已删除元素写进文件。

坐标落在 20 的网格上。`fillStyle` 用 `solid`，`opacity` 用 `100`。框、菱形、箭头和线用手绘抖动，跟 `src/content/blog/2026/10/figures/ageval-durable/` 里的图一样：`roughness` 为 `1`，`strokeWidth` 为 `2`。文字保持平整：`roughness` 为 `0`，`fontFamily` 为 `2`，`strokeWidth` 为 `1.5`。样板 `transformer.excalidraw` 只提供字段结构，它的平整线条不作为博客结构图的线型。

矩形的 `type` 是 `rectangle`，写清 `x`、`y`、`width`、`height`。圆角沿用样板的 `"roundness": { "type": 3 }`。

文字的 `type` 是 `text`。`fontFamily` 用 `2`。标题字号约 22，正文约 16。`textAlign` 用 `center` 或 `left`。中文宽度按字号乘以字数估算，再加一截余量。高度约是字号的 1.25 倍。`containerId` 用 `null`，文字自己占一块。

箭头和线的 `points` 相对元素自己的 `x`、`y`。竖箭头写成 `[[0, 0], [0, 高度]]`，横线写成 `[[0, 0], [宽度, 0]]`。`startBinding` 和 `endBinding` 用 `null`，让终点落在目标边缘。绑错时箭头会离开框。

`id` 在这一张图里唯一，用英文短名，例如 `enc-frame`、`enc-label`。

阅读顺序从左到右，或从上到下。重复的层画一次，旁边标 `N×`。输入放在进入的一端，输出放在离开的一端。颜色有含义才用，并在正文里说这层颜色是什么。同一含义全篇用同一个色值。

## 亮暗配色

每张图只写一份亮色 JSON。`appState.theme` 用 `light`，`viewBackgroundColor` 用 `transparent`。页面预览器统一使用白色画布，文件中的自定义画布色也会被统一；节点自己的 `backgroundColor` 保留。

文字、默认边框、连线和箭头用 `#1e1e1e`。黑色的 `#000`、`#000000` 和 `black` 会在预览时归一到这个墨色。次要线和框线沿用样板的柔和灰色，有含义的彩色文字和填充继续写亮色值。同一含义全篇保持同色。

`src/client/excalidraw-view.ts` 使用 Excalidraw 的原生主题转换：暗色下画布约为 `#121212`，默认墨色约为 `#d4d4d4`；彩色线条与填充经同一套 `invert(93%) hue-rotate(180deg)` 转换。写稿时从亮色原稿选色，暗色显示由组件确定性计算。原文件中的颜色保持不变，反复切换主题得到相同的配色。

改完后在浏览器里检查：

- 亮暗两种主题下的文字、框线、箭头、填充与标签均清晰可辨。
- 文章内画布和放大弹窗显示一致，已缓存的弹窗再次打开后跟随当前主题。
- 连续切换主题后缩放、平移和画布节点保持，默认缩放下仍能读清整张图。
