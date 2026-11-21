<div align="center">

<img src="docs/images/logo.png" width="96" alt="TinyAI">

# TinyAI

[![Release](https://img.shields.io/github/v/release/wor97600-tech/tinyai-watch)](https://github.com/wor97600-tech/tinyai-watch/releases)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

蓝河 OS（BlueOS）手表离线聊天应用 · 自带键盘 · 方屏 / 圆屏

</div>

TinyAI 是装在手表里的聊天应用。所有回答都在手表本地生成，不联网，聊天记录也不会离开手表。

手表内存很小，也没有显卡，所以它用的不是常见的大模型，而是一个几十万参数的小模型，配合内置知识库和规则来回答问题。

## 功能

- **离线聊天**：不联网，断网、飞行模式、不带手机都能用
- **自带键盘**：26 键拼音，打字母就出候选字，同音字可展开翻页，字母页首尾直接放「，」「。」
- **一键换键盘**：顶部按键在「离线键盘」和「手表自带输入法」之间切换，下次打开保持上次的选择
- **能做的事**：算算术、报时间、查内置知识、日常闲聊、写诗接龙、把没说完的话接下去
- **纯模型模式**：说一句「纯模型」切进去，只让模型自己接话；说「正常模式」退回
- **方屏圆屏各一套排版**：方屏按键更大、留白更少，圆屏避开四角
- **体积小**：安装包约 553 KB，装上就能用，不需要额外下载模型

## 安装

从 [Releases](https://github.com/wor97600-tech/tinyai-watch/releases) 下载对应屏幕形态的安装包：

| 屏幕 | 安装包 |
| --- | --- |
| 方屏 | `tinyai-watch-<version>-square.rpk` |
| 圆屏 | `tinyai-watch-<version>-round.rpk` |

用 BlueOS Studio 装到手表即可，安装过程不需要联网。

## 项目结构

```text
TinyAI/
  src/                        应用本体
    app.ux                    应用从这里启动
    manifest.json             应用信息：名字、版本、权限、屏幕类型
    pages/Home/index.ux       主界面：聊天列表、输入框、键盘、屏幕适配
    ai/                       对话相关的代码
      reply_engine.js         决定这句话该怎么回答
      char_predictor.js       让模型把话接下去
      neural_network.js       模型的计算过程
      model_loader.js         读取模型文件
      simple_kb.js            查内置知识库
      matrix.js               数学运算
      benchmark.js            测一下跑得多快
    input/pinyin_engine.js    拼音切成音节，给出候选字
    platform/blueos_io.js     手表上的文件读写
    assets/                   内容与素材
      char_model_q.bin        模型本体
      knowledge_base.js       知识库条目
      daily_kb*.js            日常话题
      chat_patterns.js        闲聊、诗句、接龙素材
      pinyin_index.js         拼音表
  training/                   训练模型用的脚本、语料和产物
  tests/                      自动测试
  scripts/                    打包和图标处理的小工具
```

## 开发

构建、测试与训练流程见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 许可证

[MIT](LICENSE) © 2026 Hahu
