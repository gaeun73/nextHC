/* ============================================================
   악플각도기 - 로직
   ============================================================ */
const CONFIG = {
  API_URL: "",          // 예: "https://example.com/api/analyze" (비어 있으면 규칙 기반만 사용)
  API_TIMEOUT_MS: 10000
};

/* ---------- 유틸 ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

/* ---------- 사전 매칭 (겹치는 구간 병합) ---------- */
function findHits(text) {
  const spans = [];
  DATA.dict.forEach((d) => {
    const re = new RegExp(d.re, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      spans.push({ s: m.index, e: m.index + m[0].length, w: d.w, c: d.c, t: m[0] });
    }
  });
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  const merged = [];
  spans.forEach((sp) => {
    const last = merged[merged.length - 1];
    if (last && sp.s < last.e) {
      if (sp.e > last.e) { last.e = sp.e; }
      if (sp.w > last.w) { last.w = sp.w; last.c = sp.c; }
      last.t = text.slice(last.s, last.e);
    } else merged.push({ ...sp });
  });
  return merged;
}

/* ---------- 규칙 기반 분석 (결정적) ---------- */
function analyze(input) {
  const D = DATA;
  const text = input.text || "";
  const extras = input.extras || [];
  const info = input.info || {};
  const hits = findHits(text);

  const insultW = hits.filter((h) => h.c === "insult").reduce((a, h) => a + h.w, 0);
  const sexualDetected = hits.some((h) => h.c === "sexual") || extras.includes("sexual");
  const threatDetected = hits.some((h) => h.c === "threat") || extras.includes("threat");
  const defame = extras.includes("defame");
  const repeat = extras.includes("repeat");

  // 요건 판단
  const pubStatus = { public: "ok", group: "warn", dm: "no" }[input.place] || "no";
  const specStatus = { direct: "ok", context: "warn", unsure: "warn" }[input.target] || "warn";
  const insultStatus = insultW >= 2 ? "ok" : insultW === 1 ? "warn" : "no";

  // 점수 (가중치 모델)
  const insultPart = Math.min(1, insultW / 4);
  const specPart = { direct: 1, context: 0.7, unsure: 0.4 }[input.target] ?? 0.4;
  const pubFactor = { public: 1, group: 0.85, dm: 0.25 }[input.place] ?? 0.25;
  let ratio = (0.6 * insultPart + 0.4 * specPart) * pubFactor;
  if (insultW === 0) ratio = Math.min(ratio, 0.15);
  let score = ratio * 180;
  if (repeat) score += 15;
  if (defame) score += 25 * pubFactor;
  if (sexualDetected || threatDetected) score = Math.max(score, 120);
  score = Math.max(0, Math.min(180, Math.round(score)));
  const level = score >= 120 ? "danger" : score >= 60 ? "warn" : "safe";

  // 요건 설명
  const reasonFor = (k, st) => D.elements[k][st];
  const elements = {
    "공연성": { status: pubStatus, reason: reasonFor("공연성", pubStatus) },
    "특정성": { status: specStatus, reason: reasonFor("특정성", specStatus) },
    "모욕성": { status: insultStatus, reason: reasonFor("모욕성", insultStatus) }
  };
  if ((sexualDetected || threatDetected) && pubStatus === "no") {
    elements["공연성"].reason += " (이 건은 성적 표현·협박이 감지되어 별도 죄목으로 판단돼요.)";
  }

  // 죄목
  const crimes = [];
  if (insultStatus !== "no" && pubStatus !== "no" && specStatus !== "no") crimes.push("모욕죄");
  if (defame) crimes.push("명예훼손죄");
  if (sexualDetected) crimes.push("통신매체이용음란죄");
  if (threatDetected) crimes.push("협박죄");

  // 경고
  const warnings = [];
  if (threatDetected) warnings.push(D.warnings.threat);
  if (crimes.includes("모욕죄")) warnings.push(D.warnings.insult);
  if (sexualDetected) warnings.push(D.warnings.sexual);

  // 하이라이트(중복 제거, 등장 순서 유지)
  const highlights = [];
  hits.forEach((h) => { if (!highlights.includes(h.t)) highlights.push(h.t); });

  // 총평 (입력 해시로 문구 선택 → 같은 입력엔 항상 같은 결과)
  const pool = D.summaries[level];
  const strongest = hits.slice().sort((a, b) => b.w - a.w)[0];
  const term = strongest ? strongest.t : "그 발언";
  const summary = pool[hash(text + level) % pool.length].replace("{term}", term);

  // 증거 체크리스트
  const evidence_checklist = D.evidence.slice();
  if (threatDetected) evidence_checklist.unshift(D.evidenceExtra.threat);
  if (sexualDetected) evidence_checklist.unshift(D.evidenceExtra.sexual);
  if (repeat) evidence_checklist.push(D.evidenceExtra.repeat);

  const result = { score, level, summary, highlights, elements, crimes, warnings, evidence_checklist, complaint_draft: "" };
  result.complaint_draft = buildDraft(input, result, hits, text);
  return result;
}

/* ---------- 고소장 초안 ---------- */
function buildDraft(input, r, hits, text) {
  const L = DATA.labels, info = input.info || {};
  const blank = "[        ]";
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hitLines = lines.filter((l) => findHits(l).length).slice(0, 6);
  const quoteSrc = hitLines.length ? hitLines : lines.slice(0, 3);
  const quotes = quoteSrc.map((l) => '     - "' + l.trim() + '"').join("\n") || "     - [        ]";

  const reasons = [];
  if (r.elements["모욕성"].status !== "no") reasons.push("경멸적 표현으로 고소인의 사회적 평가를 저하시키는 것이고");
  if (input.place !== "dm") reasons.push("불특정 또는 다수인이 인식할 수 있는 상태에서 이루어졌습니다.");
  const reasonText = reasons.length ? reasons.join(" ").replace(/고$/, "고") : "[구체적 사유 기재]";

  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const dateStr = info.date ? info.date.replace(/-(\d+)-(\d+)/, (_, m, d) => `년 ${+m}월 ${+d}일`) : blank;

  const map = {
    nick: info.nick || blank,
    game: info.game || blank,
    date: dateStr,
    crimes: r.crimes.length ? r.crimes.join(", ") : "모욕 등 [죄명 검토 필요]",
    placeLabel: L.place[input.place] || blank,
    quotes,
    targetLabel: L.target[input.target] || "",
    reasons: reasonText,
    repeatLine: (input.extras || []).includes("repeat") ? "위와 같은 행위는 일회성이 아니라 여러 차례 반복되었습니다." : "위와 같은 행위로 고소인은 정신적 고통을 입었습니다.",
    captureLine: info.capture === "yes" ? "보유 중" : info.capture === "no" ? "아직 확보하지 못함 (확보 후 제출 예정)" : blank,
    today: todayStr
  };
  return DATA.complaintTemplate.replace(/\{(\w+)\}/g, (_, k) => (map[k] !== undefined ? map[k] : blank));
}

/* ---------- 외부 API → 실패 시 규칙 기반 ---------- */
function validResult(r) {
  return r && typeof r.score === "number" && ["safe", "warn", "danger"].includes(r.level) &&
    typeof r.summary === "string" && Array.isArray(r.highlights) && r.elements &&
    ["공연성", "특정성", "모욕성"].every((k) => r.elements[k] && r.elements[k].status) &&
    Array.isArray(r.crimes) && Array.isArray(r.warnings) &&
    Array.isArray(r.evidence_checklist) && typeof r.complaint_draft === "string";
}
async function getResult(input) {
  if (CONFIG.API_URL) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.API_TIMEOUT_MS);
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: ctrl.signal
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!validResult(data)) throw new Error("형식 오류");
      data.score = Math.max(0, Math.min(180, Math.round(data.score)));
      return data;
    } catch (e) {
      console.warn("API 실패, 규칙 기반으로 전환:", e);
    } finally { clearTimeout(timer); }
  }
  return analyze(input);
}

/* ---------- 입력 수집 ---------- */
function collect() {
  const radio = (n) => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
  return {
    text: $("text").value.trim(),
    place: radio("place"),
    target: radio("target"),
    extras: [...document.querySelectorAll("input[name=extra]:checked")].map((c) => c.value),
    info: { game: $("infoGame").value.trim(), nick: $("infoNick").value.trim(), date: $("infoDate").value, capture: $("infoCapture").value }
  };
}

/* ---------- 렌더링 ---------- */
const LEVEL_TXT = { safe: "각 안 나옴", warn: "애매한 각", danger: "고소각" };
const ST_TXT = { ok: "✅ 충족", warn: "⚠️ 애매", no: "❌ 부족" };

function drawTicks() {
  const g = $("ticks"); let h = "";
  for (let a = 0; a <= 180; a += 10) {
    const big = a % 60 === 0, rad = a * Math.PI / 180;
    const r1 = big ? 98 : 104, r2 = 112;
    const x1 = 150 - r1 * Math.cos(rad), y1 = 150 - r1 * Math.sin(rad);
    const x2 = 150 - r2 * Math.cos(rad), y2 = 150 - r2 * Math.sin(rad);
    h += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#fff" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) {
      const xl = 150 - 84 * Math.cos(rad), yl = 150 - 84 * Math.sin(rad) + 4;
      h += `<text class="tick-label" x="${xl.toFixed(1)}" y="${yl.toFixed(1)}">${a}°</text>`;
    }
  }
  g.innerHTML = h;
}

function renderHighlight(text, hits) {
  let out = "", pos = 0;
  hits.forEach((h) => {
    out += esc(text.slice(pos, h.s)) + `<mark class="${h.c}">${esc(text.slice(h.s, h.e))}</mark>`;
    pos = h.e;
  });
  return out + esc(text.slice(pos));
}

function fill(r, input) {
  // 게이지
  const gauge = $("rsGauge");
  gauge.classList.remove("lv-safe", "lv-warn", "lv-danger");
  gauge.classList.add("lv-" + r.level);
  $("scoreNum").textContent = "0";
  $("needle").style.transform = "rotate(0deg)";
  $("levelBadge").textContent = LEVEL_TXT[r.level];
  $("summary").textContent = r.summary;

  // 하이라이트
  const hits = findHits(input.text);
  $("hlText").innerHTML = renderHighlight(input.text, hits);
  $("hlEmpty").hidden = hits.length > 0;

  // 요건
  $("elements").innerHTML = ["공연성", "특정성", "모욕성"].map((k) => {
    const e = r.elements[k];
    return `<div class="card el ${e.status}"><div class="card-inner"><h3>${k}</h3><div class="st">${ST_TXT[e.status]}</div><p>${esc(e.reason)}</p></div></div>`;
  }).join("");

  // 죄목
  $("crimes").innerHTML = r.crimes.length
    ? r.crimes.map((c) => `<span class="tag" title="${esc(DATA.crimeInfo[c] || "")}">${esc(c)}</span>`).join("")
    : '<span class="tag none">해당 가능성 낮음</span>';
  $("crimeNote").textContent = DATA.crimeNote;

  // 경고
  $("warnings").innerHTML = r.warnings.map((w, i) =>
    `<div class="banner ${w.startsWith("🚨") ? "" : "yellow"}">${esc(w)}</div>`).join("");

  // 체크리스트
  $("checklist").innerHTML = r.evidence_checklist.map((t) =>
    `<li><label><input type="checkbox"><span>${esc(t)}</span></label></li>`).join("");

  // 고소장
  $("draft").textContent = r.complaint_draft;

  // 마무리
  $("closingMsg").textContent = DATA.closing[r.level];
  $("helps").innerHTML = DATA.helps.map((h) =>
    `<li><b>${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.name)}</a>` : esc(h.name)}</b> - ${esc(h.desc)}</li>`).join("");
}

function countUp(el, to, ms) {
  const t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

async function reveal(r) {
  const ids = ["rsGauge", "rsHighlight", "rsElements", "rsCrimes"];
  if (r.warnings.length) ids.push("rsWarn");
  ids.push("rsEvidence", "rsDraft", "rsClosing");
  document.querySelectorAll(".rs").forEach((s) => s.classList.remove("show"));
  $("result").hidden = false;
  for (let i = 0; i < ids.length; i++) {
    const el = $(ids[i]);
    el.classList.add("show");
    if (i === 0) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      await sleep(250);
      $("needle").style.transform = `rotate(${r.score}deg)`;
      countUp($("scoreNum"), r.score, 1600);
      await sleep(1800);
    } else {
      await sleep(650);
    }
  }
}

/* ---------- 이벤트 ---------- */
let running = false, lastResult = null;

function loadSample() {
  const s = DATA.sample;
  $("text").value = s.text;
  document.querySelector(`input[name=place][value=${s.place}]`).checked = true;
  document.querySelector(`input[name=target][value=${s.target}]`).checked = true;
  document.querySelectorAll("input[name=extra]").forEach((c) => { c.checked = s.extras.includes(c.value); });
  $("infoGame").value = s.info.game; $("infoNick").value = s.info.nick;
  $("infoDate").value = s.info.date; $("infoCapture").value = s.info.capture;
  $("infoBox").open = true;
  $("err").hidden = true;
}

async function onSubmit(e) {
  e.preventDefault();
  if (running) return;
  const input = collect();
  const miss = [];
  if (!input.text) miss.push("대화 내용");
  if (!input.place) miss.push("Q1(어디서 들은 말인지)");
  if (!input.target) miss.push("Q2(나를 향한 말인지)");
  const err = $("err");
  if (miss.length) {
    err.textContent = "먼저 입력해 주세요: " + miss.join(", ");
    err.hidden = false;
    return;
  }
  err.hidden = true;
  running = true; $("btnRun").disabled = true;
  $("result").hidden = true;
  $("scan").hidden = false;
  $("scan").scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    const [r] = await Promise.all([getResult(input), sleep(1500)]);
    lastResult = r;
    fill(r, input);
    $("scan").hidden = true;
    await reveal(r);
  } catch (ex) {
    console.error(ex);
    $("scan").hidden = true;
    err.textContent = "판독 중 문제가 생겼어요. 다시 시도해 주세요.";
    err.hidden = false;
  } finally {
    running = false; $("btnRun").disabled = false;
  }
}

async function copyDraft() {
  const t = $("draft").textContent, b = $("btnCopy");
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
  }
  b.textContent = ok ? "복사됨 ✓" : "복사 실패 - 직접 선택해 주세요";
  setTimeout(() => (b.textContent = "복사"), 1800);
}

function downloadDraft() {
  const blob = new Blob(["﻿" + $("draft").textContent], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "고소장_초안.txt";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  drawTicks();
  $("disclaimer").textContent = DATA.disclaimer;
  $("btnSample").addEventListener("click", loadSample);
  $("form").addEventListener("submit", onSubmit);
  $("btnCopy").addEventListener("click", copyDraft);
  $("btnDown").addEventListener("click", downloadDraft);
  $("btnReset").addEventListener("click", () => {
    $("result").hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
