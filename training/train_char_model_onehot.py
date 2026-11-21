"""
TinyAI A1 - PC 侧字符模型训练（对话语料版）。

运行时目标：BlueOS 手表上纯 JavaScript 推理。本脚本只训练并导出参数，
永远不参与打包。语料来自 training/corpus_dialogue.txt（LCCC 清洗后的纯汉字对话）。

和旧版（诗词语料）的区别：
  - 语料是日常对话，模型学的是口语接字，不再动辄背诗；
  - 词表封顶 480（默认），参数量约 8.7 万，int8 约 88KB，手表还能跑；
  - 训练改成“按批现做 one-hot”，25 万样本也不会一次吃掉 1.7GB 内存；
  - 每 5 轮在验证集上评一次，保留验证集最好的一版权重；
  - 演示种子从日常上下文里自动挑选，保证上下文在语料里真实出现过。

Requires: Python 3.10+ and numpy (PC only).
"""

import argparse
import json
import math
import os
import random
import re
import time
from collections import Counter

import numpy as np


CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# 候选演示上下文：都是日常对话里常见的说法，训练后从中挑 4 个
# 模型确实接对、且置信度足够高的（低置信度的预测会被 int8 量化翻转，
# 所以要求 top1 比 top2 高出至少 DEMO_MARGIN）。
DEMO_MARGIN = 0.05
DEMO_CANDIDATES = [
    "你吃饭",
    "你是谁",
    "下雪了",
    "在不在",
    "别难过",
    "慢慢来",
    "你干嘛",
    "谢谢你",
    "到家了",
    "放假了",
    "我觉得",
    "不知道",
    "怎么了",
    "今天天气",
]


def load_lines(corpus_path):
    with open(corpus_path, "r", encoding="utf-8") as handle:
        raw_lines = handle.read().splitlines()
    lines = []
    for raw in raw_lines:
        cleaned = "".join(CJK_RE.findall(raw))
        if cleaned:
            lines.append(cleaned)
    return lines


def build_vocab(lines, max_vocab, required_chars=None):
    counter = Counter()
    for line in lines:
        counter.update(line)
    specials = ["<s>", "<unk>"]
    chars = [ch for ch, _ in counter.most_common() if ch not in specials]
    if max_vocab > 0:
        chars = chars[:max_vocab]
    if required_chars:
        for ch in required_chars:
            if ch not in specials and ch not in chars:
                chars.append(ch)
    labels = specials + chars
    return labels, counter


def make_samples(lines, char_to_index, context_length):
    start_index = char_to_index["<s>"]
    unk_index = char_to_index["<unk>"]
    contexts = []
    targets = []
    for line in lines:
        indices = [char_to_index.get(ch, unk_index) for ch in line]
        for position, target in enumerate(indices):
            # 词表外的字不参与训练，避免模型把大量样本学成 <unk>。
            if target == unk_index:
                continue
            context = []
            for offset in range(context_length, 0, -1):
                source = position - offset
                context.append(indices[source] if source >= 0 else start_index)
            contexts.append(context)
            targets.append(target)
    return (
        np.asarray(contexts, dtype=np.int32).reshape(-1, context_length),
        np.asarray(targets, dtype=np.int32),
    )


def one_hot_batch(contexts, vocab_size, context_length):
    """把一批 (B, C) 的字符下标变成 (B, C*V) 的 one-hot，只占一批的内存。"""
    count = contexts.shape[0]
    inputs = np.zeros((count, context_length * vocab_size), dtype=np.float32)
    rows = np.arange(count)[:, None]
    cols = np.arange(context_length)[None, :] * vocab_size + contexts
    inputs[rows, cols] = 1.0
    return inputs


def softmax(logits):
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values, axis=1, keepdims=True)


def accuracy(probabilities, targets, top_k=1):
    if top_k == 1:
        predicted = np.argmax(probabilities, axis=1)
        return float(np.mean(predicted == targets))
    top_indices = np.argsort(probabilities, axis=1)[:, -top_k:]
    hits = 0
    for row in range(targets.shape[0]):
        if targets[row] in top_indices[row]:
            hits += 1
    return hits / max(1, targets.shape[0])


def predict_metrics(params, contexts, targets, vocab_size, context_length, batch_size=2048):
    """分批评测，返回 (top1, top3, 平均loss)。"""
    count = contexts.shape[0]
    hits1 = 0
    hits3 = 0
    total_loss = 0.0
    for start in range(0, count, batch_size):
        batch_contexts = contexts[start : start + batch_size]
        batch_targets = targets[start : start + batch_size]
        x = one_hot_batch(batch_contexts, vocab_size, context_length)
        hidden = np.maximum(x @ params["w1"] + params["b1"], 0.0)
        probabilities = softmax(hidden @ params["w2"] + params["b2"])
        predicted = np.argmax(probabilities, axis=1)
        hits1 += int(np.sum(predicted == batch_targets))
        top3 = np.argpartition(probabilities, -3, axis=1)[:, -3:]
        hits3 += int(np.sum(top3 == batch_targets[:, None]))
        total_loss += float(
            -np.mean(np.log(probabilities[np.arange(batch_targets.shape[0]), batch_targets] + 1e-12))
        ) * batch_targets.shape[0]
    return hits1 / count, hits3 / count, total_loss / count


def train(
    contexts,
    targets,
    val_contexts,
    val_targets,
    vocab_size,
    context_length,
    hidden_size,
    epochs,
    batch_size,
    learning_rate,
    seed,
    eval_every,
):
    rng = np.random.default_rng(seed)
    input_size = context_length * vocab_size
    scale1 = math.sqrt(2.0 / input_size)
    scale2 = math.sqrt(2.0 / hidden_size)
    params = {
        "w1": rng.normal(0.0, scale1, (input_size, hidden_size)).astype(np.float32),
        "b1": np.zeros(hidden_size, dtype=np.float32),
        "w2": rng.normal(0.0, scale2, (hidden_size, vocab_size)).astype(np.float32),
        "b2": np.zeros(vocab_size, dtype=np.float32),
    }
    moments = {key: np.zeros_like(value) for key, value in params.items()}
    velocities = {key: np.zeros_like(value) for key, value in params.items()}
    beta1 = 0.9
    beta2 = 0.999
    epsilon = 1e-8
    step = 0
    count = contexts.shape[0]
    history = []
    best_val_top1 = -1.0
    best_params = None

    for epoch in range(1, epochs + 1):
        order = rng.permutation(count)
        epoch_loss = 0.0
        for start in range(0, count, batch_size):
            batch_indices = order[start : start + batch_size]
            x = one_hot_batch(contexts[batch_indices], vocab_size, context_length)
            y = targets[batch_indices]
            batch_count = x.shape[0]

            hidden_pre = x @ params["w1"] + params["b1"]
            hidden = np.maximum(hidden_pre, 0.0)
            logits = hidden @ params["w2"] + params["b2"]
            probabilities = softmax(logits)

            loss = -np.mean(np.log(probabilities[np.arange(batch_count), y] + 1e-12))
            epoch_loss += float(loss) * batch_count

            delta_logits = probabilities
            delta_logits[np.arange(batch_count), y] -= 1.0
            delta_logits /= batch_count

            grad_w2 = hidden.T @ delta_logits
            grad_b2 = np.sum(delta_logits, axis=0)
            delta_hidden = delta_logits @ params["w2"].T
            delta_hidden[hidden_pre <= 0.0] = 0.0
            grad_w1 = x.T @ delta_hidden
            grad_b1 = np.sum(delta_hidden, axis=0)

            gradients = {
                "w1": grad_w1,
                "b1": grad_b1,
                "w2": grad_w2,
                "b2": grad_b2,
            }
            step += 1
            for key in params:
                grad = gradients[key]
                moments[key] = beta1 * moments[key] + (1.0 - beta1) * grad
                velocities[key] = beta2 * velocities[key] + (1.0 - beta2) * grad * grad
                moment_hat = moments[key] / (1.0 - beta1**step)
                velocity_hat = velocities[key] / (1.0 - beta2**step)
                params[key] -= learning_rate * moment_hat / (np.sqrt(velocity_hat) + epsilon)

        average_loss = epoch_loss / count
        train_top1 = 0.0
        val_top1 = 0.0
        val_top3 = 0.0
        if epoch % eval_every == 0 or epoch == epochs:
            train_top1, train_top3, _ = predict_metrics(
                params, contexts, targets, vocab_size, context_length
            )
            val_top1, val_top3, _ = predict_metrics(
                params, val_contexts, val_targets, vocab_size, context_length
            )
            if val_top1 > best_val_top1:
                best_val_top1 = val_top1
                best_params = {key: value.copy() for key, value in params.items()}
            print(
                "epoch %3d  loss %.4f  train_top1 %.4f  val_top1 %.4f  val_top3 %.4f"
                % (epoch, average_loss, train_top1, val_top1, val_top3)
            )
        else:
            print("epoch %3d  loss %.4f" % (epoch, average_loss))
        history.append(
            {
                "epoch": epoch,
                "loss": round(average_loss, 6),
                # 只有评测轮才有准确率；其余轮留 None，避免元数据里出现误导性的 0。
                "train_top1": round(train_top1, 6) if train_top1 else None,
                "val_top1": round(val_top1, 6) if val_top1 else None,
                "val_top3": round(val_top3, 6) if val_top3 else None,
            }
        )

    if best_params is not None:
        params = best_params
        print("restored best checkpoint: val_top1 %.4f" % best_val_top1)
    return params, history


def predict_one(params, context, char_to_index, index_to_char, context_length, vocab_size, top_k=3):
    indices = []
    for ch in context:
        index = char_to_index.get(ch)
        indices.append(index if isinstance(index, int) else char_to_index["<unk>"])
    encoded = []
    for position in range(context_length):
        source = len(indices) - context_length + position
        encoded.append(indices[source] if source >= 0 else char_to_index["<s>"])
    x = np.zeros((1, context_length * vocab_size), dtype=np.float32)
    for position, index in enumerate(encoded):
        x[0, position * vocab_size + index] = 1.0
    hidden = np.maximum(x @ params["w1"] + params["b1"], 0.0)
    probabilities = softmax(hidden @ params["w2"] + params["b2"])[0]
    order = np.argsort(probabilities)[::-1]
    top = []
    for index in order[:top_k]:
        label = index_to_char[int(index)]
        if label in ("<s>", "<unk>"):
            continue
        top.append({"label": label, "score": float(probabilities[int(index)])})
    return top


def next_char_distribution(lines, context_length):
    """统计语料里每个三字上下文的后续字（用于挑演示种子）。"""
    distribution = {}
    for line in lines:
        for position in range(context_length, len(line)):
            key = line[position - context_length : position]
            followers = distribution.setdefault(key, Counter())
            followers[line[position]] += 1
    return distribution


def choose_demo_seeds(lines, char_to_index, index_to_char, params, context_length, vocab_size, limit=4):
    distribution = next_char_distribution(lines, context_length)
    seeds = []

    def predict_top2(context):
        return predict_one(
            params, context, char_to_index, index_to_char, context_length, vocab_size, 2
        )

    def margin_of(top):
        if len(top) < 2:
            return 1.0
        return top[0]["score"] - top[1]["score"]

    def candidate_context(candidate):
        context = candidate[-context_length:]
        if len(context) < context_length:
            return ""
        if any(ch not in char_to_index for ch in context):
            return ""
        if context not in distribution:
            return ""
        return context

    # 第一轮：语料里多数明确、模型接对、且 top1 领先 top2 足够多（防止 int8 翻转）。
    for candidate in DEMO_CANDIDATES:
        context = candidate_context(candidate)
        if not context:
            continue
        most_common = distribution[context].most_common(1)[0]
        expected = most_common[0]
        if most_common[1] < 3 or expected not in char_to_index:
            continue
        top = predict_top2(context)
        if not top or top[0]["label"] != expected:
            continue
        if margin_of(top) < DEMO_MARGIN:
            continue
        seeds.append({"context": context, "expectedLabel": expected})
        if len(seeds) >= limit:
            return seeds

    # 兜底：放宽置信度要求，但仍要求模型接对且上下文在语料里出现过。
    for min_margin in (0.02, 0.0):
        for candidate in DEMO_CANDIDATES:
            context = candidate_context(candidate)
            if not context:
                continue
            if any(seed["context"] == context for seed in seeds):
                continue
            top = predict_top2(context)
            if not top:
                continue
            expected = top[0]["label"]
            if expected not in char_to_index:
                continue
            if distribution[context].get(expected, 0) < 2:
                continue
            if margin_of(top) < min_margin:
                continue
            seeds.append({"context": context, "expectedLabel": expected})
            if len(seeds) >= limit:
                return seeds
    return seeds


def choose_test_cases(
    lines,
    char_to_index,
    index_to_char,
    params,
    context_length,
    vocab_size,
    limit=6,
):
    cases = []
    seen = set()
    for line in lines:
        if len(line) <= context_length:
            continue
        for position in range(context_length, len(line)):
            context = line[position - context_length : position]
            target = line[position]
            if context in seen:
                continue
            if any(ch not in char_to_index for ch in context):
                continue
            if target not in char_to_index:
                continue
            top = predict_one(
                params, context, char_to_index, index_to_char, context_length, vocab_size, 1
            )
            if not top or top[0]["label"] != target:
                continue
            seen.add(context)
            cases.append({"context": context, "expectedLabel": target})
            if len(cases) >= limit:
                return cases
    return cases


def export_model(
    output_path,
    labels,
    params,
    context_length,
    metadata,
    test_cases,
    demo_seeds,
):
    model = {
        "format": "tinyai-char-v1",
        "version": 1,
        "name": "CHAR_MODEL_DIALOGUE_V1",
        "trained": True,
        "note": "Trained on a cleaned public Chinese dialogue corpus (LCCC base). A tiny local-proof character model, not a general language model.",
        "dims": {
            "input": context_length * len(labels),
            "hidden": int(params["w1"].shape[1]),
            "output": len(labels),
        },
        "labels": labels,
        "weights": {
            "inputHidden": params["w1"].T.reshape(-1).tolist(),
            "hiddenBias": params["b1"].tolist(),
            "hiddenOutput": params["w2"].T.reshape(-1).tolist(),
            "outputBias": params["b2"].tolist(),
        },
        "meta": metadata,
        "testCases": test_cases,
        "demoSeeds": demo_seeds,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(model, handle, ensure_ascii=False, indent=2)
    return model


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--corpus",
        default=os.path.join(here, "corpus_dialogue.txt"),
        help="清洗后的纯汉字对话语料（scripts/prepare_dialogue_corpus.py 生成）",
    )
    parser.add_argument("--out", default=os.path.join(here, "out", "char_model.json"))
    parser.add_argument("--context", type=int, default=3)
    parser.add_argument("--hidden", type=int, default=48)
    parser.add_argument("--vocab", type=int, default=480)
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=0.005)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--eval-every", type=int, default=5)
    args = parser.parse_args()

    started = time.time()
    random.seed(args.seed)
    np.random.seed(args.seed)

    lines = load_lines(args.corpus)
    if len(lines) < 10:
        raise SystemExit("Corpus is too small: %d lines" % len(lines))
    corpus_chars = sum(len(line) for line in lines)
    required_chars = set("".join(DEMO_CANDIDATES))
    labels, counter = build_vocab(lines, args.vocab, required_chars)
    char_to_index = {ch: index for index, ch in enumerate(labels)}
    index_to_char = {index: ch for index, ch in enumerate(labels)}

    shuffled = list(lines)
    random.shuffle(shuffled)
    # 演示候选上下文所在的句子必须留在训练集，否则验证集会把它抽走。
    demo_windows = set(candidate[-args.context :] for candidate in DEMO_CANDIDATES)

    def is_demo_line(line):
        for window in demo_windows:
            if window in line:
                return True
        return False

    demo_lines = [line for line in shuffled if is_demo_line(line)]
    other_lines = [line for line in shuffled if not is_demo_line(line)]
    val_count = max(3, int(round(len(other_lines) * args.val_ratio)))
    val_lines = other_lines[:val_count]
    train_lines = demo_lines + other_lines[val_count:]

    train_contexts, train_targets = make_samples(train_lines, char_to_index, args.context)
    val_contexts, val_targets = make_samples(val_lines, char_to_index, args.context)
    if len(train_contexts) < 1000 or len(val_contexts) < 100:
        raise SystemExit("Not enough samples after splitting")

    print(
        "Corpus: %d lines / %d chars, unique chars %d"
        % (len(lines), corpus_chars, len(counter))
    )
    print(
        "Vocab: %d (cap %d), hidden: %d, context: %d"
        % (len(labels), args.vocab, args.hidden, args.context)
    )
    print(
        "Samples: train %d, val %d"
        % (len(train_contexts), len(val_contexts))
    )

    params, history = train(
        train_contexts,
        train_targets,
        val_contexts,
        val_targets,
        vocab_size=len(labels),
        context_length=args.context,
        hidden_size=args.hidden,
        epochs=args.epochs,
        batch_size=args.batch,
        learning_rate=args.lr,
        seed=args.seed,
        eval_every=args.eval_every,
    )

    train_top1, train_top3, _ = predict_metrics(
        params, train_contexts, train_targets, len(labels), args.context
    )
    val_top1, val_top3, _ = predict_metrics(
        params, val_contexts, val_targets, len(labels), args.context
    )

    parameter_count = int(
        params["w1"].size + params["b1"].size + params["w2"].size + params["b2"].size
    )
    metadata = {
        "contextLength": args.context,
        "vocabSize": len(labels),
        "hiddenSize": args.hidden,
        "corpusSource": "LCCC base (THU-coai), cleaned dialogue",
        "corpusLines": len(lines),
        "corpusChars": corpus_chars,
        "corpusUniqueChars": len(counter),
        "trainSamples": int(len(train_contexts)),
        "valSamples": int(len(val_contexts)),
        "trainTop1": round(train_top1, 6),
        "trainTop3": round(train_top3, 6),
        "valTop1": round(val_top1, 6),
        "valTop3": round(val_top3, 6),
        "epochs": args.epochs,
        "batchSize": args.batch,
        "learningRate": args.lr,
        "seed": args.seed,
        "parameterCount": parameter_count,
        "trainedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "trainingSeconds": round(time.time() - started, 2),
        "history": history,
    }

    demo_seeds = choose_demo_seeds(
        train_lines,
        char_to_index,
        index_to_char,
        params,
        args.context,
        len(labels),
    )
    if len(demo_seeds) < 4:
        raise SystemExit("Could not find 4 demo seeds, got: %s" % json.dumps(demo_seeds, ensure_ascii=False))

    test_cases = choose_test_cases(
        train_lines,
        char_to_index,
        index_to_char,
        params,
        args.context,
        len(labels),
        6,
    )

    model = export_model(
        args.out,
        labels,
        params,
        args.context,
        metadata,
        test_cases,
        demo_seeds,
    )

    print("")
    print("Top-1 accuracy: train %.4f, val %.4f" % (train_top1, val_top1))
    print("Top-3 accuracy: train %.4f, val %.4f" % (train_top3, val_top3))
    print("Parameters: %d" % parameter_count)
    print("Model written: %s" % args.out)
    print("Demo seeds: %s" % json.dumps(demo_seeds, ensure_ascii=False))
    print("Test cases: %s" % json.dumps(test_cases, ensure_ascii=False))
    print("Training seconds: %.2f" % metadata["trainingSeconds"])

    for seed in demo_seeds:
        top = predict_one(
            params, seed["context"], char_to_index, index_to_char, args.context, len(labels), 1
        )
        print(
            "  %s -> %s (%.4f), expected %s"
            % (
                seed["context"],
                top[0]["label"] if top else "?",
                top[0]["score"] if top else 0.0,
                seed["expectedLabel"],
            )
        )

    return model


if __name__ == "__main__":
    main()
