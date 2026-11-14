// Generates buy.html, sell.html, swap.html, bridge.html (HyperFrames compositions) from script.json.
// node build.mjs   then   npx hyperframes render -c ./buy.html -o out/buy.mp4
import { readFileSync, writeFileSync } from "node:fs";

const S = JSON.parse(readFileSync("script.json", "utf8"));
const DUR = JSON.parse(readFileSync("assets/vo/durations.json", "utf8"));

const INTRO = 4.6; // logo intro clip (with its sound)
const OUTRO = 8.6;
const r2 = (n) => Math.round(n * 100) / 100;

const NEAR_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 3.9 14 9.2c-.2.4.2.8.6.5L18.2 6.6c.1-.1.3 0 .3.1v9.6c0 .2-.2.2-.3.1L7.4 3.5C7 3 6.5 2.7 5.9 2.7h-.4C4.7 2.7 4 3.4 4 4.3v15.4c0 .9.7 1.6 1.5 1.6.6 0 1.1-.3 1.4-.8L10.5 15c.2-.4-.2-.8-.6-.5l-3.6 3.1c-.1.1-.3 0-.3-.1V7.9c0-.2.2-.2.3-.1l10.8 12.9c.3.4.9.6 1.4.6h.4c.9 0 1.5-.7 1.5-1.6V4.3c0-.9-.7-1.6-1.5-1.6-.6 0-1.1.3-1.3.8z"/></svg>`;
const MARK = (c) => `<svg viewBox="0 0 100 100"><circle cx="32" cy="50" r="30" fill="${c}"/><path d="M68 20a30 30 0 0 1 0 60z" fill="${c}"/></svg>`;

const GLYPH = { buy: "₦", sell: "₦", swap: "$", bridge: "◎", ask: "✦", agent: "{}" };

function cardHtml(kind) {
  const k = (t) => `<span class="ck">${t}</span>`, st = (t) => `<span class="cs">${t}</span>`, cm = (t) => `<span class="cc">${t}</span>`;
  if (kind === "code-quote")
    return `<div class="code"><div class="bar"><i></i><i></i><i></i><span>quote.sh</span></div><pre>${k("curl")} ${st('"paya-render.onrender.com/<br>  wallet/quote?account=agent.near<br>  &amp;from=near&amp;to=usdc&amp;amount=1"')}

${cm("// response")}
{
  "amountOut": ${st("3.31")},
  "minOut":    ${st("3.27")},
  "route":     ${st('"NEAR Intents"')}
}</pre></div>`;
  if (kind === "code-swap")
    return `<div class="code"><div class="bar"><i></i><i></i><i></i><span>agent.ts</span></div><pre>${k("const")} s = ${k("await")} paya(${st('"/wallet/swap"')}, {
  account: ${st('"agent.near"')},
  from: ${st('"near"')}, to: ${st('"usdc"')},
  amount: ${st("1")},
});

${cm("// your key, your signature")}
${k("const")} hash = ${k("await")} signAll(s.transactions);

${k("await")} paya(${st('"/wallet/swap/submit"')},
  { depositAddress: s.depositAddress,
    txHash: hash });</pre></div>`;
  if (kind === "terminal")
    return `<div class="code term"><div class="bar"><i></i><i></i><i></i><span>terminal</span></div><pre><span class="cc">$</span> npx tsx agent.ts rebalance 50
Total $1,049.45 · USDC $120.50
Target $524.73
Swapping 114.3 NEAR → ~404.2 USDC
Result: ${st("done ✓")}

<span class="cc">$</span> npx tsx agent.ts bridge usdc sol:USDC 5 G3bw…
Bridging 5 USDC → ~4.98 USDC on sol
Result: ${st("done ✓")}</pre></div>`;
  if (kind === "swapped")
    return `<div class="fake"><div class="tick">✓</div><h3>Swap complete</h3><p>87.94 USDC is in your balance.</p><div class="row"><span class="tok d">${NEAR_SVG}</span><span class="arrow">→</span><span class="tok u">$</span></div><div class="btn">Done</div></div>`;
  if (kind === "chains")
    return `<div class="fake chains">${["Solana", "Ethereum", "Base", "Arbitrum", "Optimism", "BNB Chain", "Polygon", "Avalanche", "Bitcoin", "Tron"].map((c, i) => `<span class="chip" style="--i:${i}">${c}</span>`).join("")}</div>`;
  if (kind === "arrived")
    return `<div class="fake"><div class="tick">✓</div><h3>Bridge complete</h3><p>14.12 NEAR arrived from Ethereum.</p><div class="row"><span class="tok u">$</span><span class="arrow">→</span><span class="tok d">${NEAR_SVG}</span></div><div class="btn">Done</div></div>`;
  return "";
}

function build(name) {
  const v = S[name];
  const id = `paya-${name}`;
  // Scene timing: title (step 0), 4 steps, outro.
  const scenes = [];
  let t = INTRO;
  v.steps.forEach((st, i) => {
    const d = r2(Math.max(i === 0 ? 3.6 : 3.2, DUR[`${name}-${i}`] + 0.9));
    scenes.push({ ...st, i, start: r2(t), dur: d });
    t += d;
  });
  const outroStart = r2(t);
  const total = r2(t + OUTRO);
  const [title0, steps] = [scenes[0], scenes.slice(1)];
  const stepsStart = steps[0].start;
  const stepsEnd = outroStart;

  const vo = scenes
    .map((s) => `<audio class="clip" id="vo${s.i}" src="assets/vo/${name}-${s.i}.mp3" data-start="${r2(s.start + 0.25)}" data-duration="${DUR[`${name}-${s.i}`]}" data-volume="1"></audio>`)
    .join("\n      ");

  const shots = steps
    .map((s, k) =>
      s.shot
        ? `<img class="shot" id="shot${k}" src="assets/shots/${s.shot}.jpg" style="transform-origin:${s.focus[0] * 100}% ${s.focus[1] * 100}%" />`
        : `<div class="shot fakewrap" id="shot${k}">${cardHtml(s.card)}</div>`,
    )
    .join("\n            ");

  const rail = v.rail.map((r, k) => `<div class="rail-item" id="rail${k}"><span class="ghost">${r}</span><span class="solid">${r}</span></div>`).join("");

  // GSAP timeline (absolute times).
  const A = [];
  const at = (x) => r2(x);
  // Title scene
  const T = title0.start;
  A.push(`tl.fromTo("#flash", {opacity:1}, {opacity:0, duration:0.35, ease:"power2.out", immediateRender:false}, ${at(T)});`);
  A.push(`tl.fromTo(".tword", {opacity:0, scale:1.5, filter:"blur(18px)", y:40}, {opacity:1, scale:1, filter:"blur(0px)", y:0, duration:0.55, ease:"power4.out", stagger:0.18}, ${at(T + 0.1)});`);
  A.push(`tl.fromTo("#coin", {rotationY:-540, scale:0.3, opacity:0}, {rotationY:0, scale:1, opacity:1, duration:1.4, ease:"power3.out"}, ${at(T + 0.2)});`);
  A.push(`tl.to("#coin", {rotationY:360, duration:${r2(title0.dur - 1.4)}, ease:"none"}, ${at(T + 1.6)});`);
  A.push(`tl.fromTo(".float", {opacity:0, y:120, rotation:-25}, {opacity:1, y:0, rotation:0, duration:0.9, ease:"back.out(1.6)", stagger:0.08}, ${at(T + 0.3)});`);
  A.push(`tl.fromTo(".float", {y:0}, {y:-40, duration:${r2(title0.dur - 1.2)}, ease:"none", immediateRender:false}, ${at(T + 1.2)});`);
  A.push(`tl.to("#title-scene", {rotationX:85, scale:0.7, opacity:0, duration:0.45, ease:"power3.in"}, ${at(T + title0.dur - 0.45)});`);

  // Steps scene
  A.push(`tl.fromTo("#flash", {opacity:0.9}, {opacity:0, duration:0.3, immediateRender:false}, ${at(stepsStart)});`);
  A.push(`tl.fromTo("#device", {rotationY:-75, rotationX:18, scale:0.6, opacity:0, x:300}, {rotationY:-12, rotationX:4, scale:1, opacity:1, x:0, duration:1.0, ease:"power4.out"}, ${at(stepsStart)});`);
  A.push(`tl.to("#device", {rotationY:8, rotationX:-2, duration:${r2(stepsEnd - stepsStart - 1)}, ease:"sine.inOut"}, ${at(stepsStart + 1)});`);
  A.push(`tl.fromTo("#rail", {opacity:0, x:-80}, {opacity:1, x:0, duration:0.7, ease:"power3.out"}, ${at(stepsStart + 0.1)});`);
  steps.forEach((s, k) => {
    const st = s.start;
    // screen swap: spin through edge-on
    if (k > 0) {
      A.push(`tl.to("#screen", {rotationY:90, duration:0.18, ease:"power2.in"}, ${at(st - 0.18)});`);
      A.push(`tl.set("#shot${k - 1}", {opacity:0}, ${at(st)});`);
      A.push(`tl.fromTo("#screen", {rotationY:-90}, {rotationY:0, duration:0.32, ease:"back.out(1.4)", immediateRender:false}, ${at(st)});`);
      A.push(`tl.fromTo("#flash", {opacity:0.55}, {opacity:0, duration:0.25, immediateRender:false}, ${at(st)});`);
    }
    A.push(`tl.set("#shot${k}", {opacity:1}, ${at(st)});`);
    if (s.shot) A.push(`tl.fromTo("#shot${k}", {scale:1}, {scale:1.32, duration:${r2(s.dur)}, ease:"sine.inOut"}, ${at(st + 0.2)});`);
    else A.push(`tl.fromTo("#shot${k} .fake > *, #shot${k} .chip", {opacity:0, y:30, scale:0.8}, {opacity:1, y:0, scale:1, duration:0.5, ease:"back.out(1.8)", stagger:0.06}, ${at(st + 0.15)});`);
    // rail: roll so the active item sits on the focus line, ghost -> solid sweep
    A.push(`tl.to("#rail-track", {y:${-k * 118}, duration:0.55, ease:"power3.inOut"}, ${at(st - (k ? 0.25 : 0))});`);
    A.push(`tl.fromTo("#rail${k} .solid", {"--p":"-20%"}, {"--p":"120%", duration:0.8, ease:"power2.out"}, ${at(st + 0.2)});`);
    if (k > 0) A.push(`tl.to("#rail${k - 1} .solid", {opacity:0.0, duration:0.3}, ${at(st)});`);
    A.push(`tl.set("#num", {textContent:"STEP ${k + 1} OF 4"}, ${at(st)});`);
    A.push(`tl.set("#cap${k}", {opacity:1}, ${at(st)});`);
    A.push(`tl.fromTo("#cap${k} .solid", {"--p":"-20%"}, {"--p":"120%", duration:0.9, ease:"power2.out"}, ${at(st + 0.35)});`);
    A.push(`tl.fromTo("#cap${k} .ghost", {opacity:0}, {opacity:0.18, duration:0.3}, ${at(st + 0.1)});`);
    A.push(`tl.to("#cap${k}", {opacity:0, duration:0.2}, ${at(st + s.dur - 0.2)});`);
  });
  A.push(`tl.to("#steps-scene", {scale:1.25, opacity:0, filter:"blur(12px)", duration:0.4, ease:"power3.in"}, ${at(stepsEnd - 0.4)});`);

  // Outro
  const O = outroStart;
  A.push(`tl.fromTo("#flash", {opacity:1}, {opacity:0, duration:0.4, immediateRender:false}, ${at(O)});`);
  A.push(`tl.fromTo(".oword", {opacity:0, y:80, rotationX:-90}, {opacity:1, y:0, rotationX:0, duration:0.45, ease:"back.out(1.7)", stagger:0.22}, ${at(O + 0.1)});`);
  A.push(`tl.to("#owords", {opacity:0, scale:0.85, filter:"blur(10px)", duration:0.35}, ${at(O + 2.3)});`);
  A.push(`tl.fromTo(".disc", {y:-400, opacity:0, rotationX:70}, {y:0, opacity:1, rotationX:70, duration:0.6, ease:"bounce.out", stagger:0.12}, ${at(O + 2.4)});`);
  A.push(`tl.to("#stack", {rotationY:360, duration:3.5, ease:"none"}, ${at(O + 2.5)});`);
  A.push(`tl.fromTo("#endlogo", {opacity:0, scale:0.8}, {opacity:1, scale:1, duration:0.6, ease:"power3.out"}, ${at(O + 2.9)});`);
  A.push(`tl.fromTo("#endline .solid", {"--p":"-20%"}, {"--p":"120%", duration:0.9}, ${at(O + 3.3)});`);
  A.push(`tl.fromTo("#endline .ghost", {opacity:0}, {opacity:0.2, duration:0.3}, ${at(O + 3.1)});`);
  A.push(`tl.fromTo("#endurl", {opacity:0, y:20}, {opacity:1, y:0, duration:0.5}, ${at(O + 3.8)});`);

  const caps = steps
    .map((s, k) => `<div class="cap" id="cap${k}"><span class="ghost">${s.caption}</span><span class="solid">${s.caption}</span></div>`)
    .join("\n        ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,700;14..32,800;14..32,900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
    <style>
      :root { --ink:#0d0d0f; --ground:#f3f3f4; --muted:#8a8a90; }
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:1920px; height:1080px; overflow:hidden; background:#000; font-family:Inter, sans-serif; }
      #root { position:relative; width:1920px; height:1080px; overflow:hidden; }
      .clip { position:absolute; inset:0; }
      #flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; z-index:50; }
      /* reveal: faint ghost, then solid sweeps across */
      .ghost, .solid { display:block; white-space:nowrap; }
      .solid { position:absolute; inset:0; --p:-20%; -webkit-mask-image:linear-gradient(90deg,#000 calc(var(--p) - 20%),transparent var(--p)); mask-image:linear-gradient(90deg,#000 calc(var(--p) - 20%),transparent var(--p)); }
      .ghost { opacity:.16; }
      /* title */
      #title-scene { background:#000; display:flex; align-items:center; justify-content:center; perspective:1400px; }
      #title { text-align:center; color:#fff; font-weight:900; font-size:230px; line-height:.86; letter-spacing:-10px; position:relative; z-index:2; }
      .tword { display:block; }
      .tword.l2 { color:#b9b9be; font-size:150px; letter-spacing:-6px; margin-top:14px; }
      #coinwrap { position:absolute; right:250px; top:150px; perspective:900px; z-index:1; }
      #coin { width:260px; height:260px; border-radius:50%; background:radial-gradient(circle at 32% 26%, #8a8a8a 0%, #2a2a2a 42%, #050505 100%); box-shadow:0 50px 90px rgba(0,0,0,.6), inset 0 -14px 30px rgba(0,0,0,.5), inset 0 14px 26px rgba(255,255,255,.35); display:grid; place-items:center; color:#f2f2f2; transform-style:preserve-3d; }
      #coin svg { width:46%; height:46%; }
      .float { position:absolute; border-radius:50%; display:grid; place-items:center; font-weight:800; color:#2b2b2b; background:radial-gradient(circle at 32% 26%, #fff 0%, #d7d7d7 45%, #8d8d8d 100%); box-shadow:0 30px 60px rgba(0,0,0,.45), inset 0 -8px 18px rgba(0,0,0,.25); }
      .float.dark { background:radial-gradient(circle at 32% 26%, #6a6a6a 0%, #222 45%, #050505 100%); color:#eee; }
      /* steps */
      #steps-scene { background:#fff; }
      #brand { position:absolute; left:110px; top:80px; display:flex; align-items:center; gap:14px; font-weight:800; font-size:38px; letter-spacing:-1.2px; color:var(--ink); }
      #brand svg { width:46px; height:46px; }
      #num { position:absolute; left:110px; top:250px; font-weight:800; font-size:30px; color:var(--muted); letter-spacing:2px; }
      #rail { position:absolute; left:110px; top:300px; width:880px; height:460px; overflow:hidden; -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 18%,#000 62%,transparent 100%); mask-image:linear-gradient(180deg,transparent 0,#000 18%,#000 62%,transparent 100%); }
      #rail-track { position:absolute; left:0; top:90px; }
      .rail-item { position:relative; height:118px; font-weight:800; font-size:96px; letter-spacing:-4px; color:var(--ink); line-height:118px; }
      .rail-item .ghost { opacity:.13; }
      .cap { position:absolute; left:112px; top:800px; right:auto; bottom:auto; width:900px; height:60px; font-size:40px; font-weight:500; color:#56565c; letter-spacing:-.8px; opacity:0; }
      .cap .solid { color:#2b2b30; }
      #stage { position:absolute; right:150px; top:90px; width:600px; height:900px; perspective:1600px; }
      #device { position:absolute; inset:0; border-radius:56px; background:#0b0b0c; padding:14px; box-shadow:0 70px 120px rgba(0,0,0,.28), 0 0 0 2px rgba(255,255,255,.6) inset; transform-style:preserve-3d; }
      #screen { position:relative; width:100%; height:100%; border-radius:44px; overflow:hidden; background:#fafafa; transform-style:preserve-3d; }
      .shot { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:50% 0; opacity:0; }
      .fakewrap { display:grid; place-items:center; background:#fafafa; }
      .fake { width:84%; text-align:center; font-family:Inter; }
      .fake .tick { width:110px; height:110px; margin:0 auto; border-radius:50%; background:#0d0d0f; color:#fff; font-size:64px; line-height:110px; font-weight:700; }
      .fake h3 { margin-top:34px; font-size:48px; letter-spacing:-1.5px; }
      .fake p { margin-top:12px; font-size:26px; color:#6b6b72; }
      .fake .row { margin-top:44px; display:flex; align-items:center; justify-content:center; gap:26px; }
      .tok { width:110px; height:110px; border-radius:50%; display:grid; place-items:center; font-size:54px; font-weight:800; color:#fff; box-shadow:0 20px 40px rgba(0,0,0,.25); }
      .tok.d { background:radial-gradient(circle at 32% 26%, #777, #1b1b1b 50%, #000); } .tok.d svg { width:50%; height:50%; }
      .tok.u { background:radial-gradient(circle at 32% 26%, #9cc3ff, #2775ca 50%, #0e3c7a); }
      .arrow { font-size:54px; color:#9a9aa0; }
      .fake .btn { margin:46px auto 0; width:100%; padding:26px 0; border-radius:26px; background:#0d0d0f; color:#fff; font-size:28px; font-weight:600; }
      .code { width:92%; border-radius:26px; background:#0d0d0f; color:#e8e8ea; text-align:left; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,.25); }
      .code .bar { display:flex; align-items:center; gap:9px; padding:18px 22px; border-bottom:1px solid #222; }
      .code .bar i { width:13px; height:13px; border-radius:50%; background:#3a3a3e; display:block; }
      .code .bar span { margin-left:10px; font:500 18px Inter; color:#8a8a90; }
      .code pre { margin:0; padding:26px 26px 30px; font:500 21px/1.55 "JetBrains Mono", monospace; white-space:pre-wrap; }
      .ck { color:#ffffff; font-weight:700; } .cs { color:#b9b9be; } .cc { color:#6b6b72; }
      .fakewrap .code { background:#0d0d0f; }
      .chains { display:flex; flex-wrap:wrap; gap:16px; justify-content:center; }
      .chip { padding:16px 26px; border-radius:999px; background:#0d0d0f; color:#fff; font-size:28px; font-weight:600; }
      /* outro */
      #outro { background:#000; display:flex; align-items:center; justify-content:center; perspective:1200px; }
      #owords { display:flex; gap:40px; color:#fff; font-weight:900; font-size:150px; letter-spacing:-6px; }
      .oword { display:inline-block; } .oword:nth-child(even) { color:#9d9da3; }
      #stackwrap { position:absolute; left:50%; top:200px; margin-left:-150px; width:300px; height:300px; perspective:900px; }
      #stack { position:relative; width:300px; height:300px; transform-style:preserve-3d; }
      .disc { position:absolute; left:0; width:300px; height:300px; border-radius:50%; box-shadow:0 18px 0 rgba(0,0,0,.35); }
      #endlogo { position:absolute; left:0; right:0; top:560px; display:flex; justify-content:center; align-items:center; gap:24px; color:#fff; font-weight:800; font-size:110px; letter-spacing:-4px; }
      #endlogo svg { width:110px; height:110px; }
      #endline { position:absolute; left:0; right:0; top:720px; display:flex; justify-content:center; }
      #endline > div { position:relative; color:#d4d4d8; font-size:46px; font-weight:500; letter-spacing:-1px; }
      #endurl { position:absolute; left:0; right:0; top:810px; text-align:center; color:#8f8f95; font-size:34px; font-weight:500; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${id}" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
      <video class="clip" id="intro" src="assets/intro.mp4" data-start="0" data-duration="${INTRO}" data-has-audio="true" data-volume="1" style="width:1920px;height:1080px;object-fit:cover"></video>
      <audio class="clip" id="music" src="assets/music.mp3" data-start="${INTRO - 0.2}" data-duration="${r2(total - INTRO + 0.2)}" data-volume="0.16" data-fade-in="0.8" data-fade-out="1.6"></audio>
      ${vo}

      <div class="clip" id="title-scene" data-start="${title0.start}" data-duration="${title0.dur}">
        <div class="float dark" style="left:170px;top:170px;width:130px;height:130px;font-size:56px">${GLYPH[name]}</div>
        <div class="float" style="left:300px;top:760px;width:100px;height:100px;font-size:44px">$</div>
        <div class="float dark" style="left:1490px;top:740px;width:150px;height:150px"><span style="width:46%;height:46%;display:grid;color:#eee">${NEAR_SVG}</span></div>
        <div class="float" style="left:1640px;top:520px;width:80px;height:80px;font-size:34px">₦</div>
        <div id="coinwrap"><div id="coin">${NEAR_SVG}</div></div>
        <div id="title"><span class="tword">${v.title[0]}</span><span class="tword l2">${v.title[1]}</span></div>
      </div>

      <div class="clip" id="steps-scene" data-start="${stepsStart}" data-duration="${r2(stepsEnd - stepsStart)}">
        <div id="brand">${MARK("#0d0d0f")}Paya</div>
        <div id="num">STEP 1 OF 4</div>
        <div id="rail"><div id="rail-track">${rail}</div></div>
        <div id="stage"><div id="device"><div id="screen">
            ${shots}
        </div></div></div>
        ${caps}
      </div>

      <div class="clip" id="outro" data-start="${outroStart}" data-duration="${OUTRO}">
        <div id="owords"><span class="oword">BUY</span><span class="oword">SELL</span><span class="oword">SWAP</span><span class="oword">BRIDGE</span></div>
        <div id="stackwrap"><div id="stack">
          <div class="disc" style="top:90px;background:#3a3a3e"></div>
          <div class="disc" style="top:60px;background:#7a7a80"></div>
          <div class="disc" style="top:30px;background:#c9c9cd"></div>
          <div class="disc" style="top:0;background:#fff;display:grid;place-items:center"><div style="width:44%;height:44%">${MARK("#0d0d0f")}</div></div>
        </div></div>
        <div id="endlogo">${MARK("#fff")}Paya</div>
        <div id="endline"><div><span class="ghost">NEAR to your bank. And back.</span><span class="solid">NEAR to your bank. And back.</span></div></div>
        <div id="endurl">usepaya.xyz · @usepaya</div>
      </div>
      <audio class="clip" id="vo-outro" src="assets/vo/outro.mp3" data-start="${r2(outroStart + 2.4)}" data-duration="${DUR.outro}" data-volume="1"></audio>

      <div id="flash"></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${A.join("\n      ")}
      window.__timelines["${id}"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
  writeFileSync(`${name}.html`, html);
  return { name, total, scenes: scenes.map((s) => [s.start, s.dur]), outroStart };
}

const only = process.argv.slice(2);
for (const n of only.length ? only : ["buy", "sell", "swap", "bridge", "ask", "agent"]) console.log(JSON.stringify(build(n)));
