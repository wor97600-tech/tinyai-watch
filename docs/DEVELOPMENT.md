# 开发说明

构建、测试与训练相关的内容。功能与目录说明见 [README](../README.md)。

## 构建

在项目根目录执行，产物位于 `dist/<deviceType>/release/`：

```powershell
node "<BlueOS Studio 安装目录>\resources\app\extensions\blueos-debugger\node_modules\blueos-pack\bin\index.js" release --device-type watch-round
node "<BlueOS Studio 安装目录>\resources\app\extensions\blueos-debugger\node_modules\blueos-pack\bin\index.js" release --device-type watch-square
```

打包器按 `src/manifest.json` 的 `deviceTypeList` 与 `config.designWidth` 生成对应屏型的包，页面逻辑与样式共用同一份源码，差异由运行时宽度判断处理。

## 在 BlueOS Studio 中运行

1. 用 BlueOS Studio 打开本项目根目录
2. 选择设备类型 `watch-square`（390×450）或 `watch-round`（466×466）
3. 编译预览，模拟器自动加载 `dist/<deviceType>/debug/*.rpk`

## 测试

```powershell
npm run check           # 全量，13 个套件 / 529 条断言
npm run check:char      # 字符模型数值
npm run check:quant     # int8 量化一致性
npm run check:kb        # 知识库
npm run check:qa        # 混合问答
npm run check:reply     # 回复引擎
npm run check:kbd       # 键盘布局与交互
```

测试为纯 Node 脚本，运行在桌面端，覆盖模型数值、量化一致性、知识库命中、键盘排版约束、官方输入法链路与熄屏生命周期，无需连接手表。

## 模型参数

| 项目 | 数值 |
| --- | --- |
| 结构 | 字嵌入 20 → 隐藏层 64（ReLU）→ 输出 3003 |
| 参数量 | 265,559 |
| 上下文长度 | 前 8 个字 |
| 量化 | int8 per-channel，权重文件 307 KB |
| 训练语料 | LCCC base 清洗后 184,129 行 / 211 万字 |
| 训练 | 20 epoch，CPU 约 21 分钟 |
| 验证集 Top-1 / Top-3 | 23.7% / 36.4% |

## 复现训练

```bash
pip install -r training/requirements.txt
python training/train_char_model.py \
  --corpus training/data/corpus_mix_v3000.txt \
  --context 8 --emb 20 --hidden 64 --vocab 3000 --epochs 20 \
  --out training/out/char_model_c8_v3000_h64.json
```

训练输出 float32 参数，按 `src/ai/model_loader.js` 的 TAI2 格式量化后替换 `src/assets/char_model_q.bin` 即可，手表端推理代码无需修改。
