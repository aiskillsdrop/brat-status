// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: star;
// ─────────────────────────────────────────────
//  Младший Брат — виджет статуса (Scriptable)
//  Источник: github.com/aiskillsdrop/brat-status
// ─────────────────────────────────────────────

const BASE = "https://raw.githubusercontent.com/aiskillsdrop/brat-status/main/";
const REPO_URL = "https://github.com/aiskillsdrop/brat-status";
// тап по виджету открывает этот скрипт в Scriptable → анимация
const APP_URL = "https://grok.com/";
const OPEN_URL = "scriptable:///run/" + encodeURIComponent(Script.name());
const REFRESH_MIN = 5;
const API_STATUS = "https://api.github.com/repos/aiskillsdrop/brat-status/contents/status.json";

const C = {
  bgTop: new Color("#3b2a55"),
  bgBottom: new Color("#2a1f3d"),
  gold: new Color("#f2c46d"),
  goldDim: new Color("#f2c46d", 0.75),
  text: new Color("#ffffff"),
  textDim: new Color("#ffffff", 0.62),
  pill: new Color("#f2c46d", 0.18),
  card: new Color("#ffffff", 0.07),
};

const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "mladshiy-brat");
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const STATUS_FILE = fm.joinPath(dir, "status.json");

// ---------- data ----------
async function loadStatus() {
  try {
    let s;
    try {
      // GitHub API отдаёт свежий файл сразу после пуша (raw-CDN кэширует до ~5 мин)
      const a = new Request(API_STATUS + "?t=" + Date.now());
      a.headers = { "Accept": "application/vnd.github.raw+json" };
      a.timeoutInterval = 8;
      s = await a.loadJSON();
      if (!s || s.now === undefined) throw new Error("api");
    } catch (_) {
      const r = new Request(BASE + "status.json?t=" + Date.now());
      r.timeoutInterval = 10;
      s = await r.loadJSON();
    }
    if (!s || typeof s !== "object" || s.now === undefined) throw new Error("bad json");
    fm.writeString(STATUS_FILE, JSON.stringify(s));
    return { s, offline: false };
  } catch (e) {
    if (fm.fileExists(STATUS_FILE)) {
      try { return { s: JSON.parse(fm.readString(STATUS_FILE)), offline: true }; } catch (_) {}
    }
    return {
      s: { now: "Нет данных", done_today: 0, waiting: 0, waiting_items: [], recent: [], mood: "idle", updated: "" },
      offline: true,
    };
  }
}

async function loadMascot(mood) {
  // позы по настроению: work / wait / idle; каждая кэшируется, обновление раз в сутки
  const m = ["work", "wait", "idle"].includes(mood) ? mood : "work";
  const file = fm.joinPath(dir, "mascot_" + m + "_v3.png");
  if (fm.fileExists(file)) {
    const age = Date.now() - fm.modificationDate(file).getTime();
    if (age < 24 * 3600 * 1000) return fm.readImage(file);
  }
  try {
    const r = new Request(BASE + "mascot_" + m + ".png?t=" + Math.floor(Date.now() / 86400000));
    r.timeoutInterval = 10;
    const img = await r.loadImage();
    fm.writeImage(file, img);
    return img;
  } catch (e) {
    if (fm.fileExists(file)) return fm.readImage(file);
    const any = ["work", "wait", "idle"].map(x => fm.joinPath(dir, "mascot_" + x + "_v3.png")).find(f => fm.fileExists(f));
    return any ? fm.readImage(any) : null;
  }
}

function hhmm(iso) {
  // время уже записано в часовом поясе Киева (+02:00/+03:00) — берём как есть
  const m = /T(\d{2}):(\d{2})/.exec(iso || "");
  return m ? m[1] + ":" + m[2] : "--:--";
}

function footerText(s, offline) {
  return (offline ? "нет связи · " : "") + "обновлено " + hhmm(s.updated);
}

// ---------- helpers ----------
function txt(stack, str, size, color, weight, lines) {
  const t = stack.addText(String(str));
  t.textColor = color;
  t.font = weight === "bold" ? Font.boldRoundedSystemFont(size)
         : weight === "semi" ? Font.semiboldRoundedSystemFont(size)
         : Font.regularRoundedSystemFont(size);
  if (lines) t.lineLimit = lines;
  t.minimumScaleFactor = 0.7;
  return t;
}

function mascotImg(stack, img, size, mood) {
  if (!img) { txt(stack, "✨", size * 0.7, C.gold, "bold"); return; }
  const w = stack.addImage(img);
  w.imageSize = new Size(size, size);
  if (mood === "idle") w.imageOpacity = 0.8;
}

function header(w, s, img, mSize, titleSize) {
  const h = w.addStack();
  h.layoutHorizontally();
  h.centerAlignContent();
  mascotImg(h, img, mSize, s.mood);
  h.addSpacer(8);
  const col = h.addStack();
  col.layoutVertically();
  const tr = col.addStack();
  tr.centerAlignContent();
  txt(tr, "Младший Брат", titleSize, C.gold, "bold", 1);
  if (s.mood === "wait") { tr.addSpacer(5); txt(tr, "●", titleSize * 0.7, C.gold, "bold"); }
  return { h, col };
}

function waitingLine(stack, s, size) {
  const n = Number(s.waiting) || 0;
  const p = stack.addStack();
  p.centerAlignContent();
  if (n > 0) {
    p.backgroundColor = C.pill;
    p.cornerRadius = 7;
    p.setPadding(2, 7, 2, 7);
    txt(p, "Ждёт твоего «да»: " + n, size, C.gold, "bold", 1);
  } else {
    txt(p, "Ждёт твоего «да»: 0", size, C.textDim, "regular", 1);
  }
}

function bg(w, s) {
  const g = new LinearGradient();
  g.colors = [C.bgTop, C.bgBottom];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
}

// ---------- home screen ----------
function buildSmall(s, img, offline) {
  const w = new ListWidget();
  bg(w, s);
  w.setPadding(10, 10, 10, 12);
  const top = w.addStack();
  top.centerAlignContent();
  mascotImg(top, img, 76, s.mood);
  top.addSpacer();
  const nums = top.addStack();
  nums.layoutVertically();
  txt(nums, "✓ " + (s.done_today || 0), 15, C.text, "bold", 1);
  txt(nums, "? " + (s.waiting || 0), 15, (s.waiting > 0) ? C.gold : C.textDim, "bold", 1);
  w.addSpacer(4);
  txt(w, s.now, 13, C.text, "semi", 2);
  w.addSpacer();
  txt(w, footerText(s, offline), 9, C.textDim, "regular", 1);
  return w;
}

function buildMedium(s, img, offline) {
  const w = new ListWidget();
  bg(w, s);
  w.setPadding(10, 12, 10, 12);
  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  mascotImg(row, img, 58, s.mood);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  const tr = col.addStack();
  tr.centerAlignContent();
  txt(tr, "Младший Брат", 15, C.gold, "bold", 1);
  if (s.mood === "wait") { tr.addSpacer(5); txt(tr, "●", 11, C.gold, "bold"); }
  col.addSpacer(2);
  txt(col, "Сейчас: " + s.now, 12, C.text, "semi", 1);
  col.addSpacer(2);
  txt(col, "Готово: " + (s.done_today || 0) + "  ·  " + footerText(s, offline), 10, C.textDim, "regular", 1);
  row.addSpacer();
  w.addSpacer(8);
  linkGrid(w, s, "medium");
  return w;
}

function buildLarge(s, img, offline) {
  const w = new ListWidget();
  bg(w, s);
  w.setPadding(16, 16, 14, 16);
  const row = w.addStack();
  row.centerAlignContent();
  mascotImg(row, img, 84, s.mood);
  row.addSpacer(12);
  const col = row.addStack();
  col.layoutVertically();
  const tr = col.addStack();
  tr.centerAlignContent();
  txt(tr, "Младший Брат", 18, C.gold, "bold", 1);
  if (s.mood === "wait") { tr.addSpacer(5); txt(tr, "●", 12, C.gold, "bold"); }
  col.addSpacer(3);
  txt(col, "Сейчас: " + s.now, 14, C.text, "semi", 2);
  row.addSpacer();

  w.addSpacer(10);
  const stats = w.addStack();
  stats.centerAlignContent();
  const d = stats.addStack();
  d.backgroundColor = C.card; d.cornerRadius = 7; d.setPadding(2, 7, 2, 7);
  txt(d, "Готово сегодня: " + (s.done_today || 0), 13, C.text, "semi", 1);
  stats.addSpacer(8);
  waitingLine(stats, s, 13);
  stats.addSpacer();

  const items = (s.waiting_items || []).slice(0, 3);
  if (items.length) {
    w.addSpacer(10);
    txt(w, "Ждёт твоего «да»", 12, C.gold, "bold", 1);
    w.addSpacer(3);
    for (const it of items) { txt(w, "•  " + it, 13, C.text, "regular", 1); w.addSpacer(2); }
  }
  const rec = (s.recent || []).slice(0, 3);
  if (rec.length) {
    w.addSpacer(10);
    txt(w, "Недавно сделал", 12, C.goldDim, "bold", 1);
    w.addSpacer(3);
    for (const it of rec) { txt(w, "✓  " + it, 13, C.textDim, "regular", 1); w.addSpacer(2); }
  }
  w.addSpacer();
  linkRow(w, s, 7, 11);
  w.addSpacer(6);
  txt(w, footerText(s, offline), 10, C.textDim, "regular", 1);
  return w;
}

// ---------- lock screen ----------
function buildRect(s, img, offline) {
  const w = new ListWidget();
  const row = w.addStack();
  row.centerAlignContent();
  if (img) { const i = row.addImage(img); i.imageSize = new Size(40, 40); row.addSpacer(6); }
  const col = row.addStack();
  col.layoutVertically();
  txt(col, s.now, 13, Color.white(), "semi", 2);
  txt(col, "✓ " + (s.done_today || 0) + "   да? " + (s.waiting || 0) + (s.waiting > 0 ? " ●" : ""), 12, Color.white(), "bold", 1);
  txt(col, (offline ? "нет связи · " : "") + hhmm(s.updated), 10, new Color("#ffffff", 0.7), "regular", 1);
  return w;
}

function buildInline(s, offline) {
  const w = new ListWidget();
  const n = Number(s.waiting) || 0;
  txt(w, (n > 0 ? "● " : "✓" + (s.done_today || 0) + " · ") + (n > 0 ? "ждёт «да»: " + n + " · " : "") + s.now, 12, Color.white(), "semi", 1);
  return w;
}

function buildCircular(s, img, offline) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  const n = Number(s.waiting) || 0;
  w.addSpacer();
  const top = w.addStack(); top.addSpacer();
  txt(top, n > 0 ? String(n) : "✓" + (s.done_today || 0), n > 0 ? 22 : 17, Color.white(), "bold", 1);
  top.addSpacer();
  const bot = w.addStack(); bot.addSpacer();
  txt(bot, n > 0 ? "да?" : "брат", 10, Color.white(), "semi", 1);
  bot.addSpacer();
  w.addSpacer();
  return w;
}

// ---------- animation (in-app) ----------
function esc(x) {
  return String(x == null ? "" : x).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function animHTML(s, imgSrc, offline) {
  const mood = ["work", "wait", "idle"].includes(s.mood) ? s.mood : "work";
  const n = Number(s.waiting) || 0;
  const waitList = (s.waiting_items || []).slice(0, 5).map(i => `<li>${esc(i)}</li>`).join("");
  const recList = (s.recent || []).slice(0, 3).map(i => `<li>${esc(i)}</li>`).join("");
  const moodLabel = { work: "в работе", wait: "жду тебя", idle: "отдыхаю" }[mood];
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden;background:#1a1228;color:#fff;font-family:ui-rounded,-apple-system,"SF Pro Rounded","Nunito","Noto Sans",sans-serif}
body{background:radial-gradient(120% 80% at 50% 25%,#4a3470 0%,#3b2a55 35%,#2a1f3d 65%,#160f22 100%)}
body.idle{filter:saturate(.8) brightness(.85)}
#fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
.wrap{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;
 padding:calc(env(safe-area-inset-top) + 18px) 18px calc(env(safe-area-inset-bottom) + 14px)}
.stage{position:relative;width:min(72vw,300px);height:min(72vw,300px);margin-top:4px;flex-shrink:0}
.glow{position:absolute;inset:6%;border-radius:50%;background:radial-gradient(circle,rgba(255,214,120,.75) 0%,rgba(242,196,109,.32) 38%,rgba(242,196,109,0) 70%);
 animation:pulse var(--pd) ease-in-out infinite;will-change:transform,opacity}
.hero{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;animation:float var(--fd) ease-in-out infinite;will-change:transform;
 filter:drop-shadow(0 0 18px rgba(255,200,100,.55))}
.bang{position:absolute;right:2%;top:4%;width:46px;height:46px;border-radius:50%;background:#f2c46d;color:#2a1f3d;font-weight:900;font-size:30px;
 display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 0 rgba(242,196,109,.7);animation:bang 1.1s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(calc(var(--fa) * -1)) rotate(1.5deg)}}
@keyframes pulse{0%,100%{transform:scale(.88);opacity:.65}50%{transform:scale(1.08);opacity:1}}
@keyframes bang{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(242,196,109,.7)}50%{transform:scale(1.18);box-shadow:0 0 0 16px rgba(242,196,109,0)}}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
h1{margin-top:6px;font-size:26px;font-weight:800;color:#f2c46d;letter-spacing:.3px;text-shadow:0 0 18px rgba(242,196,109,.45)}
.mood{margin-top:2px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:rgba(242,196,109,.75)}
.card{width:100%;max-width:440px;margin-top:14px;padding:16px 16px 12px;border-radius:22px;background:rgba(255,255,255,.07);
 border:1px solid rgba(242,196,109,.22);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:rise .7s ease-out both}
.lbl{font-size:12px;color:rgba(242,196,109,.8);font-weight:700;text-transform:uppercase;letter-spacing:1px}
.now{margin-top:4px;font-size:19px;font-weight:700;line-height:1.25}
.chips{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.chip{padding:6px 11px;border-radius:12px;background:rgba(255,255,255,.08);font-size:14px;font-weight:600}
.chip.gold{background:rgba(242,196,109,.2);color:#f2c46d;box-shadow:0 0 14px rgba(242,196,109,.25)}
ul{list-style:none;margin-top:6px}
li{font-size:15px;line-height:1.35;padding:3px 0 3px 22px;position:relative}
.w li::before{content:"●";position:absolute;left:4px;color:#f2c46d;font-size:11px;top:6px}
.r li{color:rgba(255,255,255,.72)}.r li::before{content:"✓";position:absolute;left:3px;color:#f2c46d}
.sec{margin-top:12px}
.foot{margin-top:auto;padding-top:10px;font-size:12px;color:rgba(255,255,255,.5);text-align:center}
.foot a{color:rgba(242,196,109,.75);text-decoration:none}
</style></head>
<body class="${mood}" style="--fd:${mood === "idle" ? "5.5s" : mood === "wait" ? "1.8s" : "2.6s"};--fa:${mood === "idle" ? "8px" : "16px"};--pd:${mood === "idle" ? "5s" : mood === "wait" ? "1.1s" : "2s"}">
<canvas id="fx"></canvas>
<div class="wrap">
 <div class="stage"><div class="glow"></div>${imgSrc ? `<img class="hero" src="${imgSrc}">` : ""}${mood === "wait" || n > 0 ? '<div class="bang">!</div>' : ""}</div>
 <h1>Младший Брат</h1><div class="mood">${moodLabel}</div>
 <div class="card">
  <div class="lbl">Сейчас</div><div class="now">${esc(s.now)}</div>
  <div class="chips"><div class="chip">Готово сегодня: ${Number(s.done_today) || 0}</div><div class="chip ${n > 0 ? "gold" : ""}">Ждёт твоего «да»: ${n}</div></div>
  ${waitList ? `<div class="sec w"><div class="lbl">Ждёт твоего «да»</div><ul>${waitList}</ul></div>` : ""}
  ${recList ? `<div class="sec r"><div class="lbl">Недавно сделал</div><ul>${recList}</ul></div>` : ""}
 </div>
 <div class="foot">${offline ? "нет связи · " : ""}обновлено ${hhmm(s.updated)}</div>
</div>
<script>
(function(){
const MOOD=${JSON.stringify(mood)};
const cfg={work:{n:90,sp:1.0,bolt:520,a:1},wait:{n:60,sp:.7,bolt:1400,a:.9},idle:{n:28,sp:.3,bolt:0,a:.55}}[MOOD];
const cv=document.getElementById('fx'),ctx=cv.getContext('2d');let W,H,dpr=Math.min(window.devicePixelRatio||1,2);
function rs(){W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}rs();addEventListener('resize',rs);
const rnd=(a,b)=>a+Math.random()*(b-a);
function mk(init){return{x:rnd(0,W),y:init?rnd(0,H):H+10,r:rnd(.8,2.8),vy:rnd(.25,1.1)*cfg.sp,vx:rnd(-.25,.25),ph:rnd(0,6.28),tw:rnd(.02,.06)}}
const P=[];for(let i=0;i<cfg.n;i++)P.push(mk(true));
let bolts=[],lastBolt=0;
function stageBox(){const r=document.querySelector('.stage').getBoundingClientRect();return r}
function bolt(){const b=stageBox(),side=Math.random()<.5?-1:1,cx=b.left+b.width/2,cy=b.top+b.height*rnd(.35,.8);
 let x=cx+side*b.width*rnd(.28,.42),y=cy-rnd(20,50);const pts=[[x,y]];const segs=7+(Math.random()*5|0);
 for(let i=0;i<segs;i++){x+=side*rnd(2,12);y+=rnd(6,14);x+=rnd(-9,9);pts.push([x,y])}
 bolts.push({pts,life:1,w:rnd(1.2,2.4)})}
function frame(t){
 ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';
 for(const p of P){p.y-=p.vy;p.x+=p.vx+Math.sin(t/1400+p.ph)*.15;p.ph+=p.tw;
  if(p.y<-10)Object.assign(p,mk(false));
  const a=cfg.a*(.45+.55*Math.abs(Math.sin(p.ph)));
  const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);g.addColorStop(0,'rgba(255,224,150,'+a+')');g.addColorStop(1,'rgba(242,196,109,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r*4,0,6.283);ctx.fill()}
 if(cfg.bolt&&t-lastBolt>cfg.bolt*rnd(.5,1.5)){bolt();if(MOOD==='work'&&Math.random()<.5)bolt();lastBolt=t}
 for(const b of bolts){ctx.strokeStyle='rgba(255,215,120,'+b.life+')';ctx.lineWidth=b.w;ctx.shadowColor='rgba(255,200,90,'+b.life+')';ctx.shadowBlur=14;
  ctx.beginPath();b.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();
  b.life-=Math.random()<.3?.25:.07}
 ctx.shadowBlur=0;bolts=bolts.filter(b=>b.life>0);
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();
</script></body></html>`;
}


// ---------- ссылки на проекты (можно переопределить полем "links" в status.json) ----------
const DEFAULT_LINKS = [
  { t: "Сайт", n: "Market Plus", u: "https://marketplus-news.github.io/" },
  { t: "X.com", n: "X @MarketPulseGold", u: "https://x.com/MarketPulseGold" },
  { t: "Patreon", n: "Patreon (шаблоны)", u: "https://www.patreon.com/DmitryZhuk" },
  { t: "Pins", n: "Pinterest", u: "https://www.pinterest.com/dmitryzhuktemplates/" },
  { t: "GitHub", n: "GitHub aiskillsdrop", u: "https://github.com/aiskillsdrop" },
  { t: "Gumroad", n: "Gumroad", u: "https://dmitrysheets.gumroad.com" },
  { t: "Fiverr", n: "Fiverr", u: "https://www.fiverr.com/dmitrysheets" }
];
function getLinks(s) {
  return (s && Array.isArray(s.links) && s.links.length) ? s.links : DEFAULT_LINKS;
}
function linkRow(w, s, max, size) {
  const r = w.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  getLinks(s).slice(0, max).forEach((l, i) => {
    if (i) r.addSpacer(5);
    const c = r.addStack();
    c.setPadding(3, 6, 3, 6);
    c.cornerRadius = 7;
    c.backgroundColor = new Color("#ffffff", 0.12);
    c.url = l.u;
    if (String(l.t).length < 4) c.size = new Size(40, 0); // короткие кнопки (X) шире, чтобы палец попадал
    txt(c, l.t, size, C.gold, "semi", 1);
  });
  r.addSpacer();
}
function linkGrid(w, s, fam) {
  // настройки можно менять из status.json полем link_style без вставки скрипта
  const st = Object.assign({ per_row: 3, w: 98, h: 28, font: 14, rows: 2 }, (s && s.link_style && s.link_style[fam]) || {});
  const L = getLinks(s).slice(0, st.per_row * st.rows);
  for (let r = 0; r * st.per_row < L.length; r++) {
    if (r) w.addSpacer(5);
    const row = w.addStack();
    row.layoutHorizontally();
    row.addSpacer();
    L.slice(r * st.per_row, (r + 1) * st.per_row).forEach((l, i) => {
      if (i) row.addSpacer(6);
      const c = row.addStack();
      c.size = new Size(st.w, st.h);
      c.cornerRadius = 9;
      c.backgroundColor = new Color("#ffffff", 0.16);
      c.centerAlignContent();
      c.url = l.u;
      const t = c.addText(String(l.t));
      t.font = Font.semiboldRoundedSystemFont(st.font);
      t.textColor = C.gold;
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.7;
    });
    row.addSpacer();
  }
}
async function linksMenu(s) {
  const a = new Alert();
  a.title = "Младший Брат";
  a.message = "Куда открыть?";
  const L = getLinks(s);
  a.addAction("💬 Чат с Братом");
  L.forEach(l => a.addAction(l.n));
  a.addAction("✨ Анимация");
  a.addCancelAction("Закрыть");
  const i = await a.presentSheet();
  if (i < 0) return "close";
  if (i === 0) { Safari.open((s && s.tap_url) || APP_URL); return "close"; }
  if (i <= L.length) { Safari.open(L[i - 1].u); return "close"; }
  return "anim";
}

// ---------- main ----------
const { s, offline } = await loadStatus();
const family = config.runsInWidget ? (config.widgetFamily || "medium") : "app";
const needImg = !["accessoryInline", "accessoryCircular"].includes(family);
const img = needImg ? await loadMascot(s.mood) : null;

if (!config.runsInWidget) {
  // открыто в приложении → меню ссылок, потом (по выбору) анимированная сцена
  const choice = await linksMenu(s);
  if (choice === "anim") {
  const src = img ? "data:image/png;base64," + Data.fromPNG(img).toBase64String() : "";
  const wv = new WebView();
  await wv.loadHTML(animHTML(s, src, offline), REPO_URL);
  await wv.present(true);
  }
  Script.complete();
} else {
  let widget;
  switch (family) {
    case "small": widget = buildSmall(s, img, offline); break;
    case "large": case "extraLarge": widget = buildLarge(s, img, offline); break;
    case "accessoryRectangular": widget = buildRect(s, img, offline); break;
    case "accessoryInline": widget = buildInline(s, offline); break;
    case "accessoryCircular": widget = buildCircular(s, img, offline); break;
    default: widget = buildMedium(s, img, offline);
  }
  widget.url = (s && typeof s.tap_url === 'string' && s.tap_url) ? s.tap_url : APP_URL;
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MIN * 60 * 1000);
  Script.setWidget(widget);
  Script.complete();
}
