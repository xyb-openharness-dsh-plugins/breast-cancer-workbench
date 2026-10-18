# 小粉宝品牌素材

用户于 2026-10-17 提供小粉宝 Logo，明确要求保存到 assets 并作为 UI 色系基准。原件位于 [brand/pinkypal-logo-original.jpg](brand/pinkypal-logo-original.jpg)，1920×1920 JPEG；未裁切、重绘或变形。使用授权范围为本次工作台 UI 设计，不推断公开商用许可证。

SHA-256：`a6dc5639fae1319be0a4aac523abe04f74ade158082d17d13a2296f1a5cf9767`。

原型色系以 Logo 柔粉和橙色为视觉依据，不声称为官方色值提取。正文与按钮使用更深的语义色保证对比度；Logo 原件完整展示。

## 页面实际引用的派生图

原件 298 KB / 1920px，直接用于 48px 图标既浪费带宽也看不出细节，所以做了裁剪与缩放。**派生图必须放在引用它的页面目录内**（见下），不能靠 `../../` 跨目录引用。

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `prototypes/v0.3/assets/brand/pinkypal-mark-96.png` | 96×96 | 侧栏图标 1x |
| `prototypes/v0.3/assets/brand/pinkypal-mark-192.png` | 192×192 | 侧栏图标 2x（`srcset`） |
| `prototypes/v0.3/assets/brand/pinkypal-logo-full.png` | 560 宽 | 「关于」弹窗的完整竖版（含品牌字） |
| `prototypes/v0.3/assets/brand/apple-touch-icon.png` | 180×180 | 桌面 / 收藏图标 |

裁剪方式：从原件取图形区（约 `cropOffset 180 390`、`1120×1120`），保留机器人 + 爱心，去掉下方文字；缩放用 macOS `sips`，未做滤镜、未改色。完整竖版只做等比缩放，保留原有文字。

## 硬约束

- **相对路径不越界**：`../../assets/brand/...` 在 `file://` 下能显示，但经过 HTTP 预览服务会被规范化到根外并返回 404——v0.3 的「logo 显示不出来」就是这个原因。页面只允许引用同目录或子目录。
- 显示尺寸 48×48，`object-fit: contain`，不裁成圆形、不加投影、不叠色块。
- 加载失败时降级为「粉」字圆标（`.brand.no-mark`），不留破图；不得用 emoji 代替。
- 同一标识在侧栏与「关于」弹窗必须同源；需要竖版用 `logo-full`，不得拉伸方图。
- 新尺寸/新格式（如 webp、SVG）加入时，先在本文件登记用途与尺寸，再改页面。
