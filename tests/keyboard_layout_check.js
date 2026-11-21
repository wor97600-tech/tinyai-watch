// 键盘版式检查：圆屏 466x466 与方屏 390x450 各验一遍。
//
// 关键前提：manifest 里 designWidth = 466，官方文档写明「根据实际设备宽度来缩放
// 元素大小」。所以 CSS 里写的 px 会被乘上 设备宽/466：
//   圆屏 466 宽 -> 缩放 1.000 -> 画布 466 x 466
//   方屏 390 宽 -> 缩放 0.837 -> 画布 466 x 537.7（物理 390x450）
// 百分比按画布宽度（466）算，和缩放无关。下面全部在「画布坐标」里比较。
import fs from "node:fs";

const DESIGN_WIDTH = 466;
const source = fs.readFileSync("./src/pages/Home/index.ux", "utf8");
const style = source.slice(source.indexOf("<style>"), source.indexOf("</style>"));

const failures = [];
let checks = 0;
function check(name, ok, detail) {
  checks++;
  if (ok) {
    console.log("PASS  " + name + (detail ? "  (" + detail + ")" : ""));
  } else {
    failures.push(name + (detail ? ": " + detail : ""));
    console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
  }
}

// ---- 把样式拆成「基础规则」+「@media 覆盖规则」 ----
function parseRules(css) {
  const map = new Map();
  const re = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const cls = m[1];
    const decls = map.get(cls) || {};
    m[2].split(";").forEach(function (line) {
      const i = line.indexOf(":");
      if (i < 0) return;
      decls[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    map.set(cls, decls);
  }
  return map;
}

// 抽出所有 @media 块（花括号配对）
const mediaBlocks = [];
let baseCss = "";
{
  let i = 0;
  while (i < style.length) {
    const at = style.indexOf("@media", i);
    if (at < 0) {
      baseCss += style.slice(i);
      break;
    }
    baseCss += style.slice(i, at);
    const open = style.indexOf("{", at);
    let depth = 0;
    let j = open;
    for (; j < style.length; j++) {
      if (style[j] === "{") depth++;
      else if (style[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const condition = style.slice(at + 6, open).trim();
    const body = style.slice(open + 1, j);
    mediaBlocks.push({ condition: condition, rules: parseRules(body) });
    i = j + 1;
  }
}

check("has a square-screen @media block", mediaBlocks.length === 1, "count=" + mediaBlocks.length);
check(
  "square block keys on aspect-ratio or height",
  mediaBlocks.length === 1 && /aspect-ratio/.test(mediaBlocks[0].condition) && /height/.test(mediaBlocks[0].condition),
  mediaBlocks.length ? mediaBlocks[0].condition : "-"
);

const baseRules = parseRules(baseCss);
const squareRules = mediaBlocks.length ? mediaBlocks[0].rules : new Map();

function rulesFor(isSquare) {
  const merged = new Map();
  baseRules.forEach(function (decls, cls) {
    merged.set(cls, Object.assign({}, decls));
  });
  if (isSquare) {
    squareRules.forEach(function (decls, cls) {
      merged.set(cls, Object.assign({}, merged.get(cls) || {}, decls));
    });
  }
  return merged;
}

function size(value, canvasW, fallback) {
  if (!value) return fallback;
  const text = String(value);
  const pct = text.match(/^([\d.]+)%$/);
  if (pct) return (canvasW * parseFloat(pct[1])) / 100;
  const px = text.match(/^(-?[\d.]+)px$/);
  return px ? parseFloat(px[1]) : fallback;
}
function pxOnly(value, fallback) {
  if (!value) return fallback;
  const m = String(value).match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : fallback;
}

const devices = [
  { name: "round 466", physical: [466, 466], circle: true },
  { name: "square 390", physical: [390, 450], circle: false },
];

const stackSpec = [
  ["draft preview", "kb-draft-wrap"],
  ["pinyin bar", "kb-typed"],
  ["candidates", "kb-cand-row"],
  ["row1 q-p", "kb-row1"],
  ["row2 a-l", "kb-row2"],
  ["row3 z-m", "kb-row3"],
  ["tools", "kb-tools"],
  ["close", "kb-close-row"],
];

// 展开同音字时，候选条 / 三行键 / 工具行 / 收起行必须隐藏，否则总高溢出
{
  const tpl = source;
  const guarded = [
    ['kb-cand-row', /<div class="kb-cand-row" if="\{\{ !candExpanded \}\}">/],
    ['kb-row1', /<div class="kb-row kb-row1" if="\{\{ !candExpanded && kbPage === 'letters' \}\}">/],
    ['kb-tools', /<div class="kb-row kb-tools" if="\{\{ !candExpanded \}\}">/],
    ['kb-close-row', /<div class="kb-row kb-close-row" if="\{\{ !candExpanded \}\}">/],
  ];
  for (const [name, re] of guarded) {
    check("expanded mode hides " + name, re.test(tpl), "");
  }
}

const metrics = {};

for (const dev of devices) {
  const isSquare = !dev.circle;
  const rules = rulesFor(isSquare);
  const scale = dev.physical[0] / DESIGN_WIDTH;
  const canvasW = DESIGN_WIDTH;
  const canvasH = dev.physical[1] / scale;

  const get = function (cls, prop, fallback) {
    const r = rules.get(cls) || {};
    return r[prop] === undefined ? fallback : r[prop];
  };

  const topMargin = pxOnly(get("kb-draft-wrap", "margin-top", "32px"), 32);
  let y = topMargin;
  const blocks = [];
  for (const item of stackSpec) {
    const h = pxOnly(get(item[1], "height", "0px"), 0);
    const w = size(get(item[1], "width", "100%"), canvasW, canvasW);
    blocks.push({ name: item[0], cls: item[1], top: y, bottom: y + h, w: w, h: h });
    y += h;
  }
  metrics[isSquare ? "square" : "round"] = { blocks: blocks, total: y, canvasH: canvasH, rules: rules, get: get };

  const R = canvasW / 2;
  const chord = function (yy) {
    if (!dev.circle) return canvasW;
    const dy = Math.abs(R - yy);
    if (dy >= R) return 0;
    return 2 * Math.sqrt(R * R - dy * dy);
  };

  check(
    dev.name + " canvas",
    Math.abs(canvasH - (isSquare ? 537.7 : 466)) < 1,
    "scale=" + scale.toFixed(3) + " canvas=" + canvasW + "x" + canvasH.toFixed(1)
  );
  check(dev.name + " fits height", y <= canvasH, "total=" + Math.round(y) + "px of " + Math.round(canvasH));
  check(dev.name + " slack at bottom", canvasH - y >= 8, "slack=" + Math.round(canvasH - y) + "px");

  for (const b of blocks) {
    const limit = Math.min(chord(b.top), chord(b.bottom));
    check(
      dev.name + " width fits " + b.name,
      b.w <= limit + 0.5,
      "width=" + Math.round(b.w) + " limit=" + Math.round(limit)
    );
  }

  // 候选槽：3 个候选 + 「更多」按钮，4 字词要放得下
  const candW = size(get("kb-cand-row", "width", "100%"), canvasW, canvasW);
  const candFont = pxOnly(get("kb-cand-text", "font-size", "22px"), 22);
  const moreW = pxOnly(get("kb-cand-more", "width", "52px"), 52);
  const slot = (candW - 3 * 4 - moreW - 4) / 3;
  check(
    dev.name + " four-char candidate fits slot",
    slot >= candFont * 4,
    "slot=" + Math.round(slot) + "px need=" + Math.round(candFont * 4) + "px"
  );

  // 展开面板：4 行 x 3 个 + 收起，替换掉候选条和键盘行
  const panelW = size(get("kb-more-panel", "width", "100%"), canvasW, canvasW);
  const chipFont = pxOnly(get("kb-more-text", "font-size", "22px"), 22);
  const chipSlot = (panelW - 3 * 6) / 3;
  check(
    dev.name + " expanded chip fits 4 chars",
    chipSlot >= chipFont * 4,
    "slot=" + Math.round(chipSlot) + "px need=" + Math.round(chipFont * 4) + "px"
  );
  const moreRowH = pxOnly(get("kb-more-row", "height", "52px"), 52);
  const backH = pxOnly(get("kb-more-back", "height", "40px"), 40);
  const backGap = pxOnly(get("kb-more-back", "margin-top", "8px"), 8);
  const panelGap = pxOnly(get("kb-more-panel", "margin-top", "0px"), 0);
  const panelH = 4 * moreRowH + backGap + backH;
  const panelTop =
    topMargin +
    pxOnly(get("kb-draft-wrap", "height", "26px"), 26) +
    pxOnly(get("kb-typed", "height", "30px"), 30) +
    panelGap;
  // 展开时候选条、三行字母键、工具行、收起行全部隐藏，只剩 标题区 + 面板
  const expandedTotal = panelTop + panelH;
  check(
    dev.name + " expanded panel fits height",
    expandedTotal <= canvasH,
    "total=" + Math.round(expandedTotal) + "px of " + Math.round(canvasH)
  );
  // 圆屏底部被圆弧吃掉，留白是必要的；方屏要尽量填满
  if (!dev.circle) {
    check(
      dev.name + " expanded panel fills screen",
      canvasH - expandedTotal <= 60,
      "slack=" + Math.round(canvasH - expandedTotal) + "px"
    );
  }
  check(
    dev.name + " expanded panel fits width",
    panelW <= Math.min(chord(panelTop), chord(panelTop + panelH)) + 0.5,
    "width=" + Math.round(panelW) + " limit=" + Math.round(Math.min(chord(panelTop), chord(panelTop + panelH)))
  );

  // 顶部预览一行放得下：尾部 10 字 + 省略号
  const draftW = size(get("kb-draft-wrap", "width", "100%"), canvasW, canvasW);
  const draftFont = pxOnly(get("kb-draft", "font-size", "16px"), 16);
  check(
    dev.name + " draft preview fits one line",
    draftFont * 11 <= draftW,
    "need=" + Math.round(draftFont * 11) + "px have=" + Math.round(draftW) + "px"
  );

  // 按键别太窄
  const row1W = size(get("kb-row1", "width", "100%"), canvasW, canvasW);
  const keyW = (row1W - 10 * 4) / 10;
  check(dev.name + " letter key is tappable", keyW >= 30, "key=" + Math.round(keyW) + "px wide");
}

// ---- 方屏必须比圆屏大一圈（不是原样照搬） ----
const roundKeyH = pxOnly(metrics.round.get("kb-key", "height", "50px"), 50);
const squareKeyH = pxOnly(metrics.square.get("kb-key", "height", "50px"), 50);
check("square keys are taller than round", squareKeyH >= roundKeyH + 12, "round=" + roundKeyH + " square=" + squareKeyH);
const roundKeyFont = pxOnly(metrics.round.get("kb-key-text", "font-size", "26px"), 26);
const squareKeyFont = pxOnly(metrics.square.get("kb-key-text", "font-size", "26px"), 26);
check("square key font is larger", squareKeyFont >= roundKeyFont + 2, "round=" + roundKeyFont + " square=" + squareKeyFont);
const roundRowW = size(metrics.round.get("kb-row1", "width", "88%"), DESIGN_WIDTH, 410);
const squareRowW = size(metrics.square.get("kb-row1", "width", "88%"), DESIGN_WIDTH, 410);
check("square rows are wider", squareRowW > roundRowW, "round=" + Math.round(roundRowW) + " square=" + Math.round(squareRowW));

console.log("");
console.log("Checks: " + checks + ", failures: " + failures.length);
if (failures.length > 0) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
console.log("ALL KEYBOARD LAYOUT CHECKS PASSED");
