<div align="center">

<img src="docs/images/logo.png" width="104" alt="TinyAI" />

# TinyAI Watch

**一块手表上的离线中文对话模型 + 26 键离线拼音输入法**

不联网 · 不上传 · 不调云端 API · 熄屏即停

[![License](https://img.shields.io/badge/license-MIT-3da639.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-BlueOS%20watch-0ea5e9.svg)](#支持设备)
[![Version](https://img.shields.io/badge/version-0.9.20-6f42c1.svg)](CHANGELOG.md)
[![RPK](https://img.shields.io/badge/RPK-553%20KB-informational.svg)](#模型卡片)
[![Tests](https://img.shields.io/badge/tests-529%20assertions-success.svg)](tests)

</div>

---

## 这是什么

TinyAI 是一个跑在 **BlueOS 智能手表**上的离线中文对话应用。

所有推理都在手表本地完成：没有网络请求，没有云端模型，聊天记录也不会离开设备。
一块手表只有几 MB 可用内存、没有 GPU，所以这里没有跑大模型，而是做了一件事——
**把一个 265K 参数的中文字符模型塞进手表，再用规则和知识库把它撑得像个人。**

任何一句输入都会有回应：要么是查到的答案，要么是接得上话的句子，不会是「我不知道」。

## 特性

| | |
| :-- | :-- |
| 🧠 **本地字符模型** | 20 维字嵌入 + 64 隐藏层 + 3003 字表，int8 量化后 **307 KB**，纯 JavaScript 推理 |
| 💬 **分层对话引擎** | 算术/时间 → 诗句接龙 → 闲聊意图 → 知识库 → 日常短句 → 字符接龙，逐层兜底 |
| ⌨️ **26 键离线拼音** | 自研拼音索引（23 KB），同音字候选、展开翻页、中英切换，全程无系统输入法 |
| 🔁 **双输入源一键切换** | 「离线键盘 / 官方输入法」一个键来回切，选择会被记住 |
| 📐 **方屏 / 圆屏双布局** | 方屏单独排版、按键更大；圆屏按安全区重排，不是简单缩放 |
| 🌙 **生命周期收尾** | 熄屏、切后台自动停流式输出并收起输入法，避免后台空转把整机拖死 |
| 🧪 **529 条断言** | 13 个纯 Node 测试套件，模型、知识库、键盘、输入链路、生命周期全覆盖 |
| 📦 **小体积** | 双设备 RPK 均约 553 KB，含模型权重 |

## 它是怎么回答的

`mermaid
flowchart TD
  A([用户输入]) --> B{纯模型模式?}
  B -->|是| Z[字符模型自回归生成]
  B -->|否| C[算术 / 时间]
  C --> D[诗句 · 接龙 · 梗]
  D --> E[闲聊意图 37 条]
  E --> F[知识库检索 80 条]
  F --> G[日常陈述 178 条]
  G --> H[字符模型接龙兜底]
  H --> I([保底话术 · 永远有话说])
`

每一层都可以「命中即返回」，命中不了才往下走。这样做的原因很实际：
手表上让 3000 词表的小模型回答「今天几号」只会答成梦话，但查表能 1ms 答对。

## 模型卡片

| 项目 | 数值 |
| :-- | :-- |
| 结构 | 字嵌入 20 → 隐藏层 64 (ReLU) → 输出 3003 |
| 参数量 | 265,559 |
| 上下文 | 前 8 个字 |
| 量化 | int8 per-channel，权重文件 307 KB |
| 语料 | LCCC base 清洗后 184,129 行 / 211 万字 |
| 训练 | 20 epoch，CPU 约 21 分钟 |
| 验证集 Top-1 / Top-3 | 23.7% / 36.4% |
| 推理 | 纯 JS 矩阵乘，单字耗时实时显示在消息下方 |

> 这个模型是**接龙模型**，不是问答模型。它的价值在于「话说得顺」，
> 而「答得准」交给知识库和规则层。这也是手表算力下的合理分工。

## 离线键盘

- 26 键全键盘，字母页首尾直接放「，」「。」，符合中文输入习惯
- 输入拼音实时出 3 个同音字候选，展开后 12 个，可翻页
- 拼音串点一下即可整段上屏，不必逐个选字
- 方屏版按键更大、留白更少；圆屏版避开四角安全区
- 顶部一个按键在「离线键盘 / 官方输入法」之间切换，状态持久化

## 支持设备

| 设备 | 说明 |
| :-- | :-- |
| `watch-round` | 圆形表盘，466 设计宽度，按圆形安全区重排 |
| `watch-square` | 方形表盘，独立布局，按键更大 |

## 目录结构

`text
src/
  app.ux                    应用入口
  manifest.json             应用清单（包名、版本、权限、设备类型）
  pages/Home/index.ux       主页面：对话、键盘、设置、生命周期
  ai/
    reply_engine.js         分层对话引擎（1200 行核心逻辑）
    simple_kb.js            轻量 bigram 检索（不建倒排表，省内存）
    char_predictor.js       字符模型推理封装
    neural_network.js       前馈网络前向计算
    matrix.js               手写矩阵运算（Float32Array）
    model_loader.js         解析 TAI2 int8 二进制权重
    benchmark.js            本地速度探针
  assets/
    char_model_q.bin        int8 量化权重
    knowledge_base.js       知识库 80 条
    daily_kb*.js            日常陈述 178 条
    chat_patterns.js        闲聊意图 / 诗句 / 接龙素材
    pinyin_index.js         拼音索引（构建期生成）
  input/pinyin_engine.js    拼音切分与候选
  platform/blueos_io.js     BlueOS 存储 / 文件封装
tests/                      13 个 Node 测试套件
scripts/                    拼音词典构建、图标处理工具
`

## 快速开始

`bash
git clone https://github.com/wor97600-tech/tinyai-watch.git
cd tinyai-watch
npm run check        # 529 条断言，不需要手表
`

用 **BlueOS Studio** 打开本目录即可编译预览；打正式包时选择设备类型
`watch-round` 或 `watch-square`。

## 测试

`bash
npm run check           # 全量
npm run check:char      # 字符模型数值
npm run check:quant     # int8 量化一致性
npm run check:kb        # 知识库
npm run check:qa        # 混合问答
npm run check:reply     # 回复引擎
npm run check:kbd       # 键盘布局与交互
`

测试全部是纯 Node 脚本，直接跑在桌面端，覆盖模型数值、知识库命中、
键盘排版约束、官方输入法链路和熄屏生命周期。

## 设计取舍

- **为什么不用 GRU / RNN**：手表实测带不动，长序列推理会把主线程拖到掉帧甚至整机卡死。改用定长 8 字的定长前向网络，单字耗时可控。
- **为什么模型只有 64 隐藏层**：128 隐藏层在手表上延迟明显，64 层在「说得像人话」和「不卡」之间更平衡。
- **为什么知识库不做 TF-IDF 倒排**：250 条条目建完整索引会直接 OOM，改成查询时现算 bigram 命中。
- **为什么坚持不联网**：离线是产品前提，也是这个项目存在的理由。

## 已知限制

- 字符模型 Top-1 约 24%，句子级连贯性有限，长回答会出现重复用字
- 知识库只覆盖预设话题，超出范围时走接龙或日常短句
- 官方输入法依赖固件行为，不同固件版本表现可能不同

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE) © 2026 Hahu
