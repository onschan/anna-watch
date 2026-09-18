'use strict';
// state.json → docs/index.html + docs/status.json (GitHub Pages용 현황 페이지)

const fs = require('fs');
const path = require('path');

// ── 여기만 바꾸면 페이지 문구가 바뀝니다 ──────────────────────────
const SITE = {
  title: '전설의 안나 입고 현황',
  subtitle: 'Yumiko Anna Duo · Silver · L',
  message: '입고되면 여기가 제일 먼저 바뀌어요. 1시간마다 자동으로 확인 중 🩰',
};
// ─────────────────────────────────────────────────────────────

// 페이지에 보여줄 샵. key는 check.js의 source key와 같아야 한다.
const SHOPS = [
  { key: 'nisarat', name: '니사라트', price: '148,000원', where: '온라인 · 매장', url: 'https://nisarat.shop/product/detail.html?product_no=2936&cate_no=141&display_group=1' },
  { key: 'eballetshop', name: '이발레샵', price: '159,000원', where: '온라인 · 분당', noAlert: true, url: 'https://www.eballetshop.com/goods/goods_view.php?goodsNo=9199' },
  { key: 'toptoe', name: '탑토', price: '172,000원', where: '온라인 · 왕십리', url: 'http://toptoe.kr/shop/shopdetail.html?branduid=12256184' },
];
const LISTS = [
  { key: 'toptoe-category', name: '탑토 신규 실버' },
  { key: 'vdenie', name: '브이데니에' },
  { key: 'renverse', name: '랑베르쎄' },
  { key: 'yumiko-rtw', name: 'Yumiko 공식 기성품' },
];
const ALWAYS = [
  { name: 'Yumiko 일본 공식몰 주문제작', price: '¥25,500 + 배송·관세 ≈ 28~31만 원', note: '직접 주문 · 6~8주 제작', url: 'https://jp.yumiko.com/products/anna-duo-1' },
  { name: '자르켓 (네이버 구매대행)', price: '249,000원', note: '전설의 안나 구성 그대로 대행 · 관세 포함 · 6~8주', url: 'https://smartstore.naver.com/jarket' },
  { name: '텐노가와 (네이버 구매대행)', price: '175,000원 + 배송 25,000원', note: 'Anna 단색 주문제작 대행', url: 'https://smartstore.naver.com/tennokawa' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function kst(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function buildStatus(state) {
  const s = state.sources || {};
  const shops = SHOPS.map((sh) => ({ ...sh, status: s[sh.key]?.status || 'unknown', detail: s[sh.key]?.detail || '', checkedAt: s[sh.key]?.lastChecked }));
  const lists = LISTS.map((l) => ({ ...l, detail: s[l.key]?.detail || '', ok: s[l.key] && !s[l.key].error, checkedAt: s[l.key]?.lastChecked }));
  const checkedAt = Object.values(s).map((x) => x.lastChecked).filter(Boolean).sort().pop() || null;
  const available = shops.filter((x) => x.status === 'in_stock');
  return { title: SITE.title, subtitle: SITE.subtitle, checkedAt, available: available.map((x) => x.name), shops, lists, always: ALWAYS };
}

function render(st) {
  const any = st.available.length > 0;
  const hero = any
    ? `<div class="hero yes"><div class="big">🎉 지금 살 수 있어요!</div><div class="sub">${esc(st.available.join(', '))}에 L 사이즈 있음 — 서둘러요</div>
      ${st.shops.filter((x) => x.status === 'in_stock').map((x) => `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}에서 바로 구매 →</a>`).join('')}</div>`
    : `<div class="hero no"><div class="big">아직 품절이에요</div><div class="sub">국내 3곳 모두 L 사이즈 품절 · 들어오면 바로 바뀌어요</div></div>`;

  const shopCards = st.shops
    .map((sh) => {
      const cls = sh.status === 'in_stock' ? 'ok' : sh.status === 'sold_out' ? 'out' : 'unk';
      const label = sh.status === 'in_stock' ? '구매 가능' : sh.status === 'sold_out' ? '품절' : '확인 안 됨';
      return `<a class="card ${cls}" href="${esc(sh.url)}" target="_blank" rel="noopener">
        <div class="row"><div class="name">${esc(sh.name)}</div><div class="badge">${label}</div></div>
        <div class="meta">${esc(sh.price)} · ${esc(sh.where)}</div>
        ${/\[품절\]/.test(sh.detail) ? `<div class="detail">사이즈: ${esc(sh.detail)}</div>` : ''}
        <div class="go">${sh.status === 'in_stock' ? '바로 구매하기 →' : sh.noAlert ? '상품 페이지 · 상품문의로 재입고 문의 →' : '상품 페이지 · 재입고 알림 신청 →'}</div>
      </a>`;
    })
    .join('\n');

  const listRows = st.lists
    .map((l) => `<div class="mini"><span>${esc(l.name)}</span><span class="${l.ok ? '' : 'warn'}">${esc(l.ok ? l.detail : '확인 실패')}</span></div>`)
    .join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(st.title)}</title>
<meta property="og:title" content="${esc(st.title)}">
<meta property="og:description" content="${any ? '🎉 지금 살 수 있어요!' : '아직 품절 — 1시간마다 자동 확인 중'}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🩰</text></svg>">
<style>
  :root { --bg:#f6f3f8; --card:#fff; --ink:#2b2633; --muted:#7d7588; --line:#e8e2ee; --silver:linear-gradient(135deg,#e9e9ee,#c9c9d3 40%,#f3f3f7 60%,#b9b9c6); --ok:#1f8a4c; --okbg:#e6f6ec; --out:#a04a5c; --outbg:#fbe9ee; --unk:#8a6d1f; --unkbg:#fff4d6; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif; line-height:1.5 }
  .wrap { max-width:520px; margin:0 auto; padding:28px 18px 48px }
  header { text-align:center; margin-bottom:22px }
  .swatch { width:84px; height:84px; margin:0 auto 14px; border-radius:26px; background:var(--silver); box-shadow:0 10px 30px rgba(120,110,140,.25), inset 0 1px 0 #fff; display:grid; place-items:center; font-size:40px }
  h1 { font-size:22px; margin:0 0 4px; letter-spacing:-.01em }
  .subtitle { color:var(--muted); font-size:14px; margin:0 }
  .hero { border-radius:18px; padding:20px; text-align:center; margin:18px 0 22px }
  .hero.no { background:#ece7f1; color:#4a4258 }
  .hero.yes { background:#dff5e7; color:#0f5f33; animation:pulse 1.6s ease-in-out infinite }
  @keyframes pulse { 0%,100%{ box-shadow:0 0 0 0 rgba(31,138,76,.25) } 50%{ box-shadow:0 0 0 12px rgba(31,138,76,0) } }
  .big { font-size:20px; font-weight:700 }
  .sub { font-size:14px; margin-top:4px; opacity:.85 }
  h2 { font-size:13px; color:var(--muted); font-weight:600; letter-spacing:.06em; text-transform:uppercase; margin:22px 0 10px }
  .card { display:block; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 16px; margin-bottom:10px; text-decoration:none; color:inherit; transition:transform .12s }
  .card:active { transform:scale(.985) }
  .row { display:flex; justify-content:space-between; align-items:center; gap:10px }
  .name { font-weight:700; font-size:16px }
  .badge { font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px }
  .card.ok .badge { background:var(--okbg); color:var(--ok) } .card.ok { border-color:#bfe6cd }
  .card.out .badge { background:var(--outbg); color:var(--out) }
  .card.unk .badge { background:var(--unkbg); color:var(--unk) }
  .meta { color:var(--muted); font-size:13px; margin-top:4px }
  .detail { color:var(--muted); font-size:12px; margin-top:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .mini { display:flex; justify-content:space-between; gap:12px; font-size:13px; padding:8px 2px; border-bottom:1px dashed var(--line); color:var(--muted) }
  .mini span:last-child { text-align:right } .warn { color:var(--unk) }
  .mto { background:linear-gradient(135deg,#fff,#f3eef8); }
  .go { margin-top:10px; font-size:13px; font-weight:700; color:#6b5b85 }
  .card.ok .go { color:var(--ok) }
  .btn { display:inline-block; margin-top:12px; margin-right:6px; background:var(--ok); color:#fff; font-weight:700; padding:10px 16px; border-radius:12px; text-decoration:none; font-size:14px }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:28px; line-height:1.7 }
  footer .msg { color:var(--ink); font-size:13px; margin-bottom:6px }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="swatch">🩰</div>
    <h1>${esc(st.title)}</h1>
    <p class="subtitle">${esc(st.subtitle)}</p>
  </header>

  ${hero}

  <h2>국내 샵 · 새 제품</h2>
  ${shopCards}

  <h2>다른 곳도 보고 있어요</h2>
  ${listRows}

  <h2>기다리기 싫으면 (항상 주문 가능)</h2>
  ${st.always.map((a) => `<a class="card mto" href="${esc(a.url)}" target="_blank" rel="noopener">
    <div class="row"><div class="name">${esc(a.name)}</div><div class="badge" style="background:#ece7f1;color:#5a4d6b">항상 가능</div></div>
    <div class="meta">${esc(a.price)}</div>
    <div class="detail">${esc(a.note)}</div>
    <div class="go">주문하러 가기 →</div>
  </a>`).join('\n')}

  <footer>
    <div class="msg">${esc(SITE.message)}</div>
    마지막 확인 ${esc(kst(st.checkedAt))} (KST)
  </footer>
</div>
</body>
</html>
`;
}

function buildSite(state, outDir) {
  const st = buildStatus(state);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'status.json'), JSON.stringify(st, null, 2));
  fs.writeFileSync(path.join(outDir, 'index.html'), render(st));
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  return st;
}

module.exports = { buildSite };
