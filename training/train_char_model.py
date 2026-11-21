"""
TinyAI A2 - PC 侧字符模型训练（字嵌入版）。

和 A1 的区别只有一处：输入不再是 C 个字的 one-hot（C*V 维），
而是 C 个字的**嵌入向量**首尾拼起来（C*d 维）。

为什么这么做：one-hot 下输入层乘加量 = C*V*H，V 一大就爆；
换成嵌入后输入层只要 C*d*H，省下的预算可以拿来：
  - 上下文从 3 字拉到 8 字（远距离信息真的有用）
  - 词表从 482 拉到 1000（语料覆盖率 84% -> 93%）

手表端仍然是同一个「一层隐藏层 + ReLU + softmax」前馈网络，
只是输入向量由 char_predictor 先做一次嵌入查表拼出来。

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
SPECIALS = ["<s>", "<unk>", "<eos>"]


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
    chars = [ch for ch, _ in counter.most_common() if ch not in SPECIALS]
    if max_vocab > 0:
        chars = chars[:max_vocab]
    if required_chars:
        for ch in required_chars:
            if ch not in SPECIALS and ch not in chars:
                chars.append(ch)
    labels = SPECIALS + chars
    return labels, counter


def make_samples(lines, char_to_index, context_length):
    """每行展开成 (上下文, 下一个字) 样本，行尾额外加一个 <eos> 样本。

    直接写进预分配的 numpy 数组，不经过 Python 列表：
    500 万字语料会产生 500 万条样本，用 list-of-list 装会先吃掉 1.5GB 内存。
    """
    start_index = char_to_index["<s>"]
    unk_index = char_to_index["<unk>"]
    eos_index = char_to_index["<eos>"]
    upper = sum(len(line) + 1 for line in lines)
    contexts = np.empty((upper, context_length), dtype=np.int32)
    targets = np.empty(upper, dtype=np.int32)
    filled = 0
    for line in lines:
        indices = [char_to_index.get(ch, unk_index) for ch in line]
        length = len(indices)
        for position in range(length + 1):
            target = indices[position] if position < length else eos_index
            if target == unk_index:
                continue
            base = position - context_length
            for slot in range(context_length):
                source = base + slot
                contexts[filled, slot] = indices[source] if source >= 0 else start_index
            targets[filled] = target
            filled += 1
    return contexts[:filled], targets[:filled]


def softmax(logits):
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp_values = np.exp(shifted)
    return exp_values / np.sum(exp_values, axis=1, keepdims=True)


def forward_batch(params, contexts):
    emb = params["emb"][contexts]  # (B, C, d)
    flat = emb.reshape(contexts.shape[0], -1)
    hidden_pre = flat @ params["w1"] + params["b1"]
    hidden = np.maximum(hidden_pre, 0.0)
    logits = hidden @ params["w2"] + params["b2"]
    logits -= logits.max(axis=1, keepdims=True)
    np.exp(logits, out=logits)
    normalizer = logits.sum(axis=1, keepdims=True)
    logits /= normalizer
    return flat, hidden_pre, hidden, logits


def evaluate(params, contexts, targets, batch_size=512):
    count = contexts.shape[0]
    hits1 = 0
    hits3 = 0
    total_loss = 0.0
    for start in range(0, count, batch_size):
        batch_contexts = contexts[start : start + batch_size]
        batch_targets = targets[start : start + batch_size]
        _, _, _, probabilities = forward_batch(params, batch_contexts)
        predicted = np.argmax(probabilities, axis=1)
        hits1 += int(np.sum(predicted == batch_targets))
        top3 = np.argpartition(probabilities, -3, axis=1)[:, -3:]
        hits3 += int(np.sum(top3 == batch_targets[:, None]))
        total_loss += float(
            -np.mean(
                np.log(
                    probabilities[np.arange(batch_targets.shape[0]), batch_targets] + 1e-12
                )
            )
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
    emb_dim,
    epochs,
    batch_size,
    learning_rate,
    seed,
    eval_every,
    patience,
):
    rng = np.random.default_rng(seed)
    input_size = context_length * emb_dim
    params = {
        "emb": (rng.normal(0.0, 0.1, (vocab_size, emb_dim))).astype(np.float32),
        "w1": rng.normal(0.0, math.sqrt(2.0 / input_size), (input_size, hidden_size)).astype(
            np.float32
        ),
        "b1": np.zeros(hidden_size, dtype=np.float32),
        "w2": rng.normal(0.0, math.sqrt(2.0 / hidden_size), (hidden_size, vocab_size)).astype(
            np.float32
        ),
        "b2": np.zeros(vocab_size, dtype=np.float32),
    }
    moments = {key: np.zeros_like(value) for key, value in params.items()}
    velocities = {key: np.zeros_like(value) for key, value in params.items()}
    beta1, beta2, epsilon = 0.9, 0.999, 1e-8
    step = 0
    count = contexts.shape[0]
    history = []
    best_val_top1 = -1.0
    best_params = None
    best_epoch = 0
    emb_flat_offsets = np.arange(emb_dim)[None, :]

    for epoch in range(1, epochs + 1):
        # 余弦退火：前期大步走，后期收细。
        progress = (epoch - 1) / max(1, epochs - 1)
        lr = learning_rate * (0.05 + 0.95 * 0.5 * (1.0 + math.cos(math.pi * progress)))
        order = rng.permutation(count)
        epoch_loss = 0.0
        for start in range(0, count, batch_size):
            batch_indices = order[start : start + batch_size]
            batch_contexts = contexts[batch_indices]
            y = targets[batch_indices]
            batch_count = batch_contexts.shape[0]

            flat, hidden_pre, hidden, probabilities = forward_batch(params, batch_contexts)
            epoch_loss += (
                float(
                    -np.mean(
                        np.log(probabilities[np.arange(batch_count), y] + 1e-12)
                    )
                )
                * batch_count
            )

            delta_logits = probabilities
            delta_logits[np.arange(batch_count), y] -= 1.0
            delta_logits /= batch_count

            grad_w2 = hidden.T @ delta_logits
            grad_b2 = np.sum(delta_logits, axis=0)
            delta_hidden = delta_logits @ params["w2"].T
            delta_hidden[hidden_pre <= 0.0] = 0.0
            grad_w1 = flat.T @ delta_hidden
            grad_b1 = np.sum(delta_hidden, axis=0)

            delta_flat = delta_hidden @ params["w1"].T
            delta_emb = delta_flat.reshape(batch_count, context_length, emb_dim)
            grad_emb_flat = np.zeros(vocab_size * emb_dim, dtype=np.float64)
            for position in range(context_length):
                index = batch_contexts[:, position]
                combined = (index[:, None] * emb_dim + emb_flat_offsets).ravel()
                grad_emb_flat += np.bincount(
                    combined, weights=delta_emb[:, position, :].ravel(), minlength=vocab_size * emb_dim
                )
            gradients = {
                "emb": grad_emb_flat.reshape(vocab_size, emb_dim).astype(np.float32),
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
                params[key] -= (lr * moment_hat / (np.sqrt(velocity_hat) + epsilon)).astype(
                    np.float32
                )

        average_loss = epoch_loss / count
        train_top1 = val_top1 = val_top3 = 0.0
        if epoch % eval_every == 0 or epoch == epochs:
            # 训练集指标只抽前 12 万条估个大概，全量评一遍要多花几十秒还吃内存。
            probe = min(120000, contexts.shape[0])
            train_top1, train_top3, _ = evaluate(
                params, contexts[:probe], targets[:probe]
            )
            val_top1, val_top3, _ = evaluate(params, val_contexts, val_targets)
            if val_top1 > best_val_top1:
                best_val_top1 = val_top1
                best_params = {key: value.copy() for key, value in params.items()}
                best_epoch = epoch
            print(
                "epoch %3d  lr %.5f  loss %.4f  train_top1 %.4f  val_top1 %.4f  val_top3 %.4f"
                % (epoch, lr, average_loss, train_top1, val_top1, val_top3),
                flush=True,
            )
            if epoch - best_epoch >= patience:
                print("early stop at epoch %d (best %d)" % (epoch, best_epoch), flush=True)
                break
        else:
            print("epoch %3d  lr %.5f  loss %.4f" % (epoch, lr, average_loss), flush=True)
        history.append(
            {
                "epoch": epoch,
                "loss": round(average_loss, 6),
                "lr": round(lr, 6),
                "train_top1": round(train_top1, 6) if train_top1 else None,
                "val_top1": round(val_top1, 6) if val_top1 else None,
                "val_top3": round(val_top3, 6) if val_top3 else None,
            }
        )

    if best_params is not None:
        params = best_params
        print("restored best checkpoint: epoch %d val_top1 %.4f" % (best_epoch, best_val_top1))
    return params, history


def encode_context(context, char_to_index, context_length):
    indices = []
    for ch in context:
        index = char_to_index.get(ch)
        indices.append(index if isinstance(index, int) else char_to_index["<unk>"])
    encoded = []
    for position in range(context_length):
        source = len(indices) - context_length + position
        encoded.append(indices[source] if source >= 0 else char_to_index["<s>"])
    return np.asarray([encoded], dtype=np.int32)


def predict_one(params, context, char_to_index, index_to_char, context_length, top_k=3):
    _, _, _, probabilities = forward_batch(
        params, encode_context(context, char_to_index, context_length)
    )
    order = np.argsort(probabilities[0])[::-1]
    top = []
    for index in order[: top_k * 3]:
        label = index_to_char[int(index)]
        if label in SPECIALS:
            continue
        top.append({"label": label, "score": float(probabilities[0][int(index)])})
        if len(top) >= top_k:
            break
    return top


def generate(params, seed, char_to_index, index_to_char, context_length, length):
    text = seed
    for _ in range(length):
        top = predict_one(params, text, char_to_index, index_to_char, context_length, 1)
        if not top:
            break
        text += top[0]["label"]
    return text


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default=os.path.join(here, "corpus_dialogue_2m.txt"))
    parser.add_argument("--out", default=os.path.join(here, "out", "char_model_v2.json"))
    parser.add_argument("--context", type=int, default=8)
    parser.add_argument("--hidden", type=int, default=64)
    parser.add_argument("--emb", type=int, default=20)
    parser.add_argument("--vocab", type=int, default=1000)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=0.006)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-ratio", type=float, default=0.06)
    parser.add_argument("--eval-every", type=int, default=2)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--name", default="CHAR_MODEL_DIALOGUE_V2")
    args = parser.parse_args()

    started = time.time()
    lines = load_lines(args.corpus)
    corpus_chars = sum(len(line) for line in lines)
    labels, counter = build_vocab(lines, args.vocab)
    char_to_index = {ch: index for index, ch in enumerate(labels)}
    index_to_char = {index: ch for index, ch in enumerate(labels)}

    shuffled = list(lines)
    random.Random(args.seed).shuffle(shuffled)
    val_count = max(3, int(round(len(shuffled) * args.val_ratio)))
    val_lines = shuffled[:val_count]
    train_lines = shuffled[val_count:]

    train_contexts, train_targets = make_samples(train_lines, char_to_index, args.context)
    val_contexts, val_targets = make_samples(val_lines, char_to_index, args.context)
    if len(train_contexts) < 1000 or len(val_contexts) < 100:
        raise SystemExit("Not enough samples after splitting")

    input_size = args.context * args.emb
    macs = input_size * args.hidden + args.hidden * len(labels)
    print(
        "Corpus: %d lines / %d chars, unique %d" % (len(lines), corpus_chars, len(counter))
    )
    print(
        "Vocab %d  context %d  emb %d  hidden %d  -> input %d, MACs/char %d"
        % (len(labels), args.context, args.emb, args.hidden, input_size, macs)
    )
    print("Samples: train %d, val %d" % (len(train_contexts), len(val_contexts)), flush=True)

    params, history = train(
        train_contexts,
        train_targets,
        val_contexts,
        val_targets,
        vocab_size=len(labels),
        context_length=args.context,
        hidden_size=args.hidden,
        emb_dim=args.emb,
        epochs=args.epochs,
        batch_size=args.batch,
        learning_rate=args.lr,
        seed=args.seed,
        eval_every=args.eval_every,
        patience=args.patience,
    )

    probe = min(200000, train_contexts.shape[0])
    train_top1, train_top3, _ = evaluate(
        params, train_contexts[:probe], train_targets[:probe]
    )
    val_top1, val_top3, _ = evaluate(params, val_contexts, val_targets)

    parameter_count = int(sum(value.size for value in params.values()))
    metadata = {
        "contextLength": args.context,
        "vocabSize": len(labels),
        "hiddenSize": args.hidden,
        "embeddingDim": args.emb,
        "inputSize": input_size,
        "macsPerChar": macs,
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

    model = {
        "format": "tinyai-char-v2",
        "version": 2,
        "name": args.name,
        "trained": True,
        "note": "Trained on a cleaned public Chinese dialogue corpus (LCCC base). Character embedding + one hidden layer, runs fully offline on BlueOS.",
        "dims": {
            "input": input_size,
            "hidden": args.hidden,
            "output": len(labels),
            "embeddingDim": args.emb,
            "contextLength": args.context,
        },
        "labels": labels,
        "weights": {
            "embedding": params["emb"].reshape(-1).tolist(),
            "inputHidden": params["w1"].T.reshape(-1).tolist(),
            "hiddenBias": params["b1"].tolist(),
            "hiddenOutput": params["w2"].T.reshape(-1).tolist(),
            "outputBias": params["b2"].tolist(),
        },
        "meta": metadata,
        "probes": {},
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(model, handle, ensure_ascii=False)

    print("")
    print("Top-1: train %.4f  val %.4f" % (train_top1, val_top1))
    print("Top-3: train %.4f  val %.4f" % (train_top3, val_top3))
    print("Parameters: %d" % parameter_count)
    print("Model written: %s" % args.out)
    print("Training seconds: %.2f" % metadata["trainingSeconds"])

    print("")
    print("=== 生成抽样 ===")
    for seed_text in ["晚安", "在干嘛", "今天好累", "我最近在学", "你吃饭", "下雨了", "老板今天骂"]:
        print("  %s -> %s" % (seed_text, generate(params, seed_text, char_to_index, index_to_char, args.context, 14)))
    return model


if __name__ == "__main__":
    main()
