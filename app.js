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
const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);

/* ---------- 사전 매칭 (겹치는 구간 병합) ---------- */
function findHits(text) {
  const spans = [];
  DATA.dict.forEach((d) => {
    const re = new RegExp(d.re, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      spans.push({ s: m.index, e: m.index + m[0].length, g: d.g, c: d.c, t: m[0] });
    }
  });
  spans.sort((a, b) => a.s - b.s || b.e - a.e);
  const merged = [];
  spans.forEach((sp) => {
    const last = merged[merged.length - 1];
    if (last && sp.s < last.e) {
      if (sp.e > last.e) last.e = sp.e;
      // 협박 > 성적 > 모욕 순으로 분류 우선, 등급은 높은 쪽
      const rank = { threat: 3, sexual: 2, insult: 1 };
      if (rank[sp.c] > rank[last.c]) last.c = sp.c;
      if (sp.g > last.g) last.g = sp.g;
      last.t = text.slice(last.s, last.e);
    } else merged.push({ ...sp });
  });
  return merged;
}

/* ---------- 규칙 기반 분석 (결정적) ----------
   input: { text, place, identity, context, freq, extras[], sexualType, info{} } */
function analyze(input) {
  const D = DATA;
  const text = input.text || "";
  const extras = input.extras || [];
  const hits = findHits(text);
  const many = input.freq === "many";
  const quarrel = input.context === "fight" || input.context === "mutual";
  const refs = { pub: [], ins: [] };

  /* ── [모욕죄] 3요건 ── */
  // 공연성
  const pubStatus = { public: "ok", group: "warn", dm: "no" }[input.place] || "no";
  if (input.place === "dm") refs.pub.push("2020도5813", "2021도15122");
  if (input.place === "group") refs.pub.push("2020도5813");
  // 특정성
  const specStatus = { real: "ok", known: "warn", stranger: "no", none: "no" }[input.identity] || "no";
  // 모욕성: 사전 최고 등급에서 보정
  let grade = hits.filter((h) => h.c !== "threat").reduce((m, h) => Math.max(m, h.g), 0);
  const adjust = [];
  const pronounRe = new RegExp(D.pronounRe);
  const directed = input.identity !== "none" || pronounRe.test(text);
  if (grade > 0 && !directed) { grade--; adjust.push(D.elements["모욕성"].lowerNoTarget); }
  if (grade > 0 && quarrel && !many) {
    grade--; adjust.push(D.elements["모욕성"].lowerQuarrel);
    refs.ins.push("2015도2229", "2024도2131");
  }
  const insultStatus = grade >= 3 ? "ok" : grade === 2 ? "warn" : "no";

  const specReason = specStatus === "no" ? D.elements["특정성"].no[input.identity === "none" ? "none" : "stranger"] : D.elements["특정성"][specStatus];
  const elements = {
    "공연성": { status: pubStatus, reason: D.elements["공연성"][pubStatus], refs: refs.pub.slice() },
    "특정성": { status: specStatus, reason: specReason, refs: [] },
    "모욕성": { status: insultStatus, reason: [D.elements["모욕성"].grade[grade]].concat(adjust).join(" "), refs: refs.ins.slice() }
  };

  // 모욕죄 각도: 가장 낮은 요건이 구간을 결정
  const st = [pubStatus, specStatus, insultStatus];
  const noCnt = st.filter((s) => s === "no").length;
  const okCnt = st.filter((s) => s === "ok").length;
  let insultAngle, insultStat;
  if (noCnt > 0) { insultStat = "no"; insultAngle = Math.min(59, 10 + 15 * (3 - noCnt) + (grade > 0 ? 5 : 0)); }
  else if (okCnt < 3) { insultStat = "warn"; insultAngle = 70 + 15 * okCnt + (many ? 5 : 0); }
  else { insultStat = "ok"; insultAngle = 140 + (many ? 20 : 0); }

  const details = [];
  details.push({ name: "모욕죄", status: insultStat, angle: insultAngle,
    reason: insultStat === "no" ? "3요건 중 부족한 요건이 있어 모욕죄는 어려워요." : D.crimeReason["모욕죄"][insultStat],
    refs: uniq(refs.pub.concat(refs.ins)) });

  /* ── [통신매체이용음란죄] ── */
  const sexChecked = extras.includes("sexual");
  const sexHit = hits.some((h) => h.c === "sexual");
  if (sexChecked || sexHit) {
    const type = sexChecked ? input.sexualType : (quarrel ? "fight" : "unrelated");
    let status = (type === "unrelated" || many) ? "ok" : "warn";
    if (!sexChecked) status = "warn"; // 직접 체크하지 않은 사전 감지는 보수적으로 애매
    const rf = status === "ok" ? ["2023도15984"] : ["2023도17539"];
    details.push({ name: "통신매체이용음란죄", status, angle: status === "ok" ? 130 + (many ? 20 : 0) : 90,
      reason: D.crimeReason["통신매체이용음란죄"][status] + (!sexChecked ? " (직접 체크하지 않아 보수적으로 판단)" : ""), refs: rf });
  }

  /* ── [협박죄] ── */
  const thrChecked = extras.includes("threat");
  const thrHit = hits.some((h) => h.c === "threat");
  if (thrChecked || thrHit) {
    const status = thrChecked ? "ok" : "warn";
    details.push({ name: "협박죄", status, angle: status === "ok" ? 140 + (many ? 20 : 0) : 90,
      reason: D.crimeReason["협박죄"][status], refs: [] });
  }

  /* ── [명예훼손죄] ── */
  if (extras.includes("defame")) {
    const status = (pubStatus === "ok" && specStatus === "ok") ? "ok" : (pubStatus !== "no" && specStatus !== "no") ? "warn" : "no";
    details.push({ name: "명예훼손죄", status, angle: status === "ok" ? 125 + (many ? 15 : 0) : status === "warn" ? 80 : 20,
      reason: status === "no" ? "사실 적시는 체크했지만 공연성·특정성이 부족해 명예훼손죄는 어려워요." : D.crimeReason["명예훼손죄"][status],
      refs: uniq(refs.pub) });
  }

  /* ── 최종: 죄목별 각도 중 최대 ── */
  const score = Math.max(0, Math.min(180, Math.max(...details.map((d) => d.angle))));
  const level = score >= 120 ? "danger" : score >= 60 ? "warn" : "safe";
  const tagged = details.filter((d) => d.status !== "no");
  const crimes = tagged.map((d) => d.name);

  // 경고
  const warnings = [];
  if (thrChecked || thrHit) warnings.push(D.warnings.threat);
  if (tagged.some((d) => d.name === "모욕죄")) warnings.push(D.warnings.insult);
  if (tagged.some((d) => d.name === "통신매체이용음란죄")) warnings.push(D.warnings.sexual);
  if (input.context === "mutual") warnings.push(D.warnings.countersuit);

  // 하이라이트
  const highlights = uniq(hits.map((h) => h.t));

  // 총평 (입력 해시로 문구 선택 → 같은 입력엔 항상 같은 결과)
  const pool = D.summaries[level];
  const strongest = hits.slice().sort((a, b) => b.g - a.g)[0];
  const term = strongest ? strongest.t : "그 발언";
  const summary = pool[hash(text + level) % pool.length].replace("{term}", term);

  // 증거 체크리스트
  const evidence_checklist = D.evidence.slice();
  if (thrChecked || thrHit) evidence_checklist.unshift(D.evidenceExtra.threat);
  if (sexChecked || sexHit) evidence_checklist.unshift(D.evidenceExtra.sexual);
  if (extras.includes("defame")) evidence_checklist.push(D.evidenceExtra.defame);
  if (many) evidence_checklist.push(D.evidenceExtra.repeat);

  const precedents = uniq(details.filter((d) => d.status !== "no").reduce((a, d) => a.concat(d.refs), []).concat(refs.pub, refs.ins));

  const result = { score, level, summary, highlights, elements, crimes, warnings, evidence_checklist,
    complaint_draft: "", crime_details: details, precedents };
  // 60° 미만이면 고소장 초안 대신 가이드
  result.complaint_draft = score >= 60 ? buildDraft(input, result, text) : "";
  return result;
}

/* ---------- 고소장 초안 ---------- */
function buildDraft(input, r, text) {
  const L = DATA.labels, info = input.info || {};
  const blank = "[        ]";
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hitLines = lines.filter((l) => findHits(l).length).slice(0, 6);
  const quoteSrc = hitLines.length ? hitLines : lines.slice(0, 3);
  const quotes = quoteSrc.map((l) => '     - "' + l.trim() + '"').join("\n") || "     - [        ]";

  const tagged = r.crime_details.filter((d) => d.status !== "no").map((d) => d.name);
  const reasonText = tagged.map((n) => DATA.draftReasons[n]).join(" ");

  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const dateStr = info.date ? info.date.replace(/-(\d+)-(\d+)/, (_, m, d) => `년 ${+m}월 ${+d}일`) : blank;

  const map = {
    nick: info.nick || blank,
    game: info.game || blank,
    date: dateStr,
    crimes: tagged.join(", "),
    placeLabel: L.place[input.place] || blank,
    quotes,
    targetLabel: L.target[input.identity] || "",
    reasons: reasonText,
    repeatLine: input.freq === "many" ? "위와 같은 행위는 일회성이 아니라 여러 차례 반복되었습니다." : "위와 같은 행위로 고소인은 정신적 고통을 입었습니다.",
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
    identity: radio("identity"),
    context: radio("context"),
    freq: radio("freq"),
    extras: [...document.querySelectorAll("input[name=extra]:checked")].map((c) => c.value),
    sexualType: radio("sexualType") || "",
    info: { game: $("infoGame").value.trim(), nick: $("infoNick").value.trim(), date: $("infoDate").value, capture: $("infoCapture").value }
  };
}

/* ---------- 렌더링 ---------- */
const LEVEL_TXT = { safe: "각 안 나옴", warn: "애매한 각", danger: "고소각" };
const ST_TXT = { ok: "✅ 충족", warn: "⚠️ 애매", no: "❌ 부족" };
const CRIME_ST = { ok: "가능성 높음", warn: "애매" };

function refsHtml(ids) {
  if (!ids || !ids.length) return "";
  const P = DATA.precedents;
  return '<span class="refs">근거 판례: ' + ids.map((id) =>
    `<span title="${esc(P[id] ? P[id].point : "")}">${esc(P[id] ? P[id].short : id)}</span>`).join("") + "</span>";
}

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

function showsDraft(r) { return r.score >= 60 && !!r.complaint_draft; }

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
    return `<div class="card el ${e.status}"><div class="card-inner"><h3>${k}</h3><div class="st">${ST_TXT[e.status]}</div><p>${esc(e.reason || "")}</p>${refsHtml(e.refs)}</div></div>`;
  }).join("");

  // 죄목
  const tagged = (r.crime_details || r.crimes.map((c) => ({ name: c, status: "ok", reason: "", refs: [] }))).filter((d) => d.status !== "no");
  $("crimes").innerHTML = tagged.length
    ? tagged.map((d) => `<div class="crime"><span class="tag ${d.status}" title="${esc(DATA.crimeInfo[d.name] || "")}">${esc(d.name)} · ${CRIME_ST[d.status] || ""}</span><p>${esc(d.reason || "")}</p>${refsHtml(d.refs)}</div>`).join("")
    : '<div class="tags"><span class="tag none">해당 가능성 낮음</span></div>';
  $("crimeNote").textContent = DATA.crimeNote;

  // 경고
  $("warnings").innerHTML = r.warnings.map((w) =>
    `<div class="banner ${w.startsWith("🚨") ? "" : "yellow"}">${esc(w)}</div>`).join("");

  // 체크리스트
  $("checklist").innerHTML = r.evidence_checklist.map((t) =>
    `<li><label><input type="checkbox"><span>${esc(t)}</span></label></li>`).join("");

  // 고소장 초안 또는 가이드
  $("draft").textContent = r.complaint_draft || "";
  const G = DATA.guide;
  $("guideTitle").textContent = G.title;
  $("guideLead").textContent = G.lead;
  $("guideSteps").innerHTML = G.steps.map((s) => `<li><b>${esc(s.t)}</b><br>${esc(s.d)}</li>`).join("");

  // 마무리
  $("closingMsg").textContent = DATA.closing[r.level];
  $("resultNotice").textContent = DATA.resultNotice;
  $("helps").innerHTML = DATA.helps.map((h) =>
    `<li><b>${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.name)}</a>` : esc(h.name)}</b> - ${esc(h.desc)}</li>`).join("");
  $("precList").innerHTML = Object.keys(DATA.precedents).map((id) =>
    `<li><b>${esc(DATA.precedents[id].short)}</b> - ${esc(DATA.precedents[id].point)}</li>`).join("");
  $("precNote").textContent = DATA.precedentNote;
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
  ids.push("rsEvidence", showsDraft(r) ? "rsDraft" : "rsGuide", "rsClosing");
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

/* ---------- 예시 / 폼 ---------- */
let running = false;

function setRadio(name, value) {
  document.querySelectorAll(`input[name=${name}]`).forEach((r) => { r.checked = r.value === value; });
}
function syncSexualSub() { $("sexualSub").hidden = !$("chkSexual").checked; }

function loadSample(id) {
  const note = $("sampleNote");
  const s = (DATA.samples || []).find((x) => x.id === id);
  if (!s) { note.hidden = true; return; }
  $("text").value = s.text;
  setRadio("place", s.place); setRadio("identity", s.identity);
  setRadio("context", s.context); setRadio("freq", s.freq);
  document.querySelectorAll("input[name=extra]").forEach((c) => { c.checked = s.extras.includes(c.value); });
  syncSexualSub();
  setRadio("sexualType", s.sexualType || "");
  note.textContent = s.result; note.hidden = false;
  $("err").hidden = true;
}

async function runInput(input) {
  const [r] = await Promise.all([getResult(input), sleep(1500)]);
  fill(r, input);
  $("scan").hidden = true;
  await reveal(r);
  return r;
}

async function onSubmit(e) {
  e.preventDefault();
  if (running) return;
  const input = collect();
  const miss = [];
  if (!input.text) miss.push("대화 내용");
  if (!input.place) miss.push("Q1");
  if (!input.identity) miss.push("Q2");
  if (!input.context) miss.push("Q3");
  if (!input.freq) miss.push("Q4");
  if (input.extras.includes("sexual") && !input.sexualType) miss.push("성적인 말 하위 질문");
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
    await runInput(input);
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
  const sel = $("sampleSelect");
  sel.innerHTML = '<option value="">예시 불러오기 ▾</option>' +
    DATA.samples.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
  sel.addEventListener("change", () => loadSample(sel.value));
  $("chkSexual").addEventListener("change", syncSexualSub);
  $("form").addEventListener("submit", onSubmit);
  $("btnCopy").addEventListener("click", copyDraft);
  $("btnDown").addEventListener("click", downloadDraft);
  $("btnReset").addEventListener("click", () => {
    $("result").hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
