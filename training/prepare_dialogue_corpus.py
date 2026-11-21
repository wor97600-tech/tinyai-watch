"""
TinyAI A1 - 把公开中文对话语料清洗成字符模型训练用的纯汉字语料。

数据来源：LCCC（Large-scale Cleaned Chinese Conversation corpus，THU-coai）
  https://huggingface.co/datasets/silver/lccc
仓库只把 LCCC base 的 valid/test 分片（约 1.6MB）和 train 分片的头部 80MB
（用 HTTP Range 截取，够统计词频和取样）放在 training/data/。原语料不进包，
只把清洗后的纯汉字文本写入 training/corpus_dialogue.txt。

流程：
  1. 流式解压、逐条对话清洗成纯汉字语句（去标点/数字/英文，过滤短句和噪声）；
  2. 在一个较大的语料池（默认 1200 万字）上统计字频，取词表前 N 个字（默认 480）；
  3. 只保留所有字都在词表内的语句，保证训练样本的标签 100% 可学；
  4. 随机抽样到目标字数（默认 25 万字），写训练语料。

用法：
  python training/prepare_dialogue_corpus.py --target-chars 500000
"""

import argparse
import codecs
import json
import os
import random
import re
import zlib

CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# 少量明显不适合放上手表闲聊的词；LCCC 已经过滤过敏感内容，这里只做兜底。
BAD_TERMS = [
    "色情",
    "裸聊",
    "约炮",
    "做爱",
    "性交",
    "自慰",
    "强奸",
    "卖淫",
    "吸毒",
    "赌博",
    "赌场",
    "博彩",
    "六合彩",
    "刷卡",
    "套现",
    "传销",
    "邪教",
    "法轮",
    "暴恐",
    "恐怖袭击",
    "自杀",
    "杀人",
    "砍死",
    "操你",
    "傻逼",
    "他妈的",
    "妈的",
    "滚蛋",
    "去死",
]


def clean(text):
    """只保留汉字；数字、英文、标点全部去掉，和原训练管线保持一致。"""
    return "".join(CJK_RE.findall(text))


def bad_line(text):
    if len(text) < 4 or len(text) > 60:
        return True
    # 超过 6 个相同汉字连刷的，多半是“哈哈哈哈哈哈”“啊啊啊啊”这类噪音。
    run = 1
    for i in range(1, len(text)):
        if text[i] == text[i - 1]:
            run += 1
            if run >= 7:
                return True
        else:
            run = 1
    for term in BAD_TERMS:
        if term in text:
            return True
    return False


def iter_jsonl(path):
    """流式解压 gzip（允许文件被 Range 截断）并逐行产出 JSON。"""
    opener = open
    if path.endswith(".gz"):
        inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
        decoder = codecs.getincrementaldecoder("utf-8")("ignore")
        buffer = ""
        with opener(path, "rb") as handle:
            while True:
                chunk = handle.read(4 * 1024 * 1024)
                if not chunk:
                    break
                try:
                    plain = inflater.decompress(chunk)
                except zlib.error:
                    break
                buffer += decoder.decode(plain)
                lines = buffer.split("\n")
                buffer = lines.pop()
                for line in lines:
                    yield line
        # 截断文件最后一行可能不完整，直接丢弃。
        return

    with opener(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            yield line


def iter_utterances(path):
    for raw in iter_jsonl(path):
        raw = raw.strip()
        if not raw:
            continue
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            continue
        # HF 上的 lccc 分片每行就是一个说话轮次列表；也兼容 {"dialog": [...]} 的写法。
        dialog = row.get("dialog") if isinstance(row, dict) else row
        if not isinstance(dialog, list):
            continue
        for utterance in dialog:
            if isinstance(utterance, str):
                yield utterance


def collect_pool(paths, pool_budget):
    pool = []
    total = 0
    raw_utterances = 0
    for path in paths:
        if not os.path.exists(path):
            raise SystemExit("缺少语料文件：" + path)
        for utterance in iter_utterances(path):
            raw_utterances += 1
            text = clean(utterance)
            if bad_line(text):
                continue
            pool.append(text)
            total += len(text)
            if total >= pool_budget:
                return pool, total, raw_utterances
    return pool, total, raw_utterances


def char_frequency(lines):
    counter = {}
    for line in lines:
        for ch in line:
            counter[ch] = counter.get(ch, 0) + 1
    return sorted(counter.items(), key=lambda item: -item[1])


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(here, "data")
    default_inputs = [
        os.path.join(data_dir, "lccc_base_train_partial.jsonl.gz"),
        os.path.join(data_dir, "lccc_base_valid.jsonl.gz"),
        os.path.join(data_dir, "lccc_base_test.jsonl.gz"),
    ]
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", nargs="*", default=default_inputs)
    parser.add_argument("--out", default=os.path.join(here, "corpus_dialogue.txt"))
    parser.add_argument(
        "--report", default=os.path.join(data_dir, "corpus_report.json")
    )
    parser.add_argument("--target-chars", type=int, default=500000)
    parser.add_argument(
        "--pool-chars",
        type=int,
        default=12000000,
        help="统计词频/取样的语料池上限（汉字数）",
    )
    parser.add_argument("--vocab-cap", type=int, default=480)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    pool, pool_chars, raw_utterances = collect_pool(args.inputs, args.pool_chars)
    if pool_chars < args.target_chars:
        raise SystemExit(
            "语料池只有 %d 字，不够目标 %d 字" % (pool_chars, args.target_chars)
        )

    ranked = char_frequency(pool)
    vocab = set(ch for ch, _ in ranked[: args.vocab_cap])
    covered = sum(count for _, count in ranked[: args.vocab_cap])
    coverage = covered / pool_chars

    # 只保留全部字都在词表内的句子，训练时不会出现 <unk> 标签。
    candidates = [line for line in pool if all(ch in vocab for ch in line)]
    candidate_chars = sum(len(line) for line in candidates)

    rng = random.Random(args.seed)
    rng.shuffle(candidates)
    selected = []
    total = 0
    for line in candidates:
        if total >= args.target_chars:
            break
        selected.append(line)
        total += len(line)
    if total < args.target_chars:
        raise SystemExit(
            "词表过滤后只有 %d 字，不够目标 %d 字" % (total, args.target_chars)
        )
    selected.sort()

    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(selected) + "\n")

    report = {
        "source": "LCCC base (THU-coai), https://huggingface.co/datasets/silver/lccc",
        "license": "MIT",
        "inputs": [os.path.basename(path) for path in args.inputs],
        "rawUtterances": raw_utterances,
        "poolChars": pool_chars,
        "poolLines": len(pool),
        "uniqueChars": len(ranked),
        "vocabCap": args.vocab_cap,
        "vocabCoverage": round(coverage, 6),
        "candidateLines": len(candidates),
        "candidateChars": candidate_chars,
        "selectedLines": len(selected),
        "selectedChars": total,
        "avgLineChars": round(total / len(selected), 3),
        "topChars": "".join(ch for ch, _ in ranked[:30]),
        "seed": args.seed,
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    print("原始对话轮数: %d" % raw_utterances)
    print("语料池: %d 行 / %d 字, 不同汉字 %d" % (len(pool), pool_chars, len(ranked)))
    print(
        "词表前 %d 覆盖率: %.2f%%" % (args.vocab_cap, coverage * 100)
    )
    print(
        "词表内句子: %d 行 / %d 字" % (len(candidates), candidate_chars)
    )
    print(
        "写入: %d 行 / %d 字, 平均每行 %.2f 字"
        % (len(selected), total, total / len(selected))
    )
    print("输出: " + args.out)
    print("报告: " + args.report)


if __name__ == "__main__":
    main()
