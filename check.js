#!/usr/bin/env node
// "전설의 안나" (Yumiko Anna Duo, CV-Silver top / N-Silver bottom, size L) 재입고 감시.
// 외부 패키지 없음. Node 18+ (내장 fetch) 필요.
//
//   node check.js            상태 확인 + 변화 있으면 알림 + docs/ 갱신 후 GitHub 푸시
//   node check.js --dry      알림·푸시 없이 현황만 출력 (docs/는 갱신)
//   node check.js --no-push  알림은 하되 푸시는 안 함
//   node check.js --test     테스트 알림 한 번 보내기

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildSite } = require('./site');

const ROOT = __dirname;

// .env (KEY=VALUE 한 줄씩) → process.env. 이미 있는 값은 덮지 않음. 알림 설정용.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const STATE_FILE = path.join(ROOT, 'state.json');
const LOG_FILE = path.join(ROOT, 'watch.log');
const DOCS_DIR = path.join(ROOT, 'docs');
const WANT_SIZE = process.env.WANT_SIZE || 'L';
const DRY = process.argv.includes('--dry');
const NO_PUSH = DRY || process.argv.includes('--no-push');

const UA = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

// ---------- utils ----------

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

async function fetchText(url, { encodingFallback = 'euc-kr' } = {}) {
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  // makeshop 계열(탑토, 브이데니에)은 EUC-KR
  if (/�/.test(text.slice(0, 20000))) text = new TextDecoder(encodingFallback).decode(buf);
  return text;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { ...UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sources: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- notify ----------

function notifyMac(title, message) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    execFileSync('osascript', [
      '-e',
      `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`,
    ]);
  } catch (e) {
    log(`macOS 알림 실패: ${e.message}`);
  }
}

async function notifySlack(title, message, url) {
  const hook = process.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${title}*\n${message}\n${url || ''}` }),
    });
  } catch (e) {
    log(`Slack 알림 실패: ${e.message}`);
  }
}

// 이메일: macOS 내장 curl로 SMTP(TLS) 전송. 외부 패키지 없음.
// 필요 env: EMAIL_TO, SMTP_USER, SMTP_PASS (앱 비밀번호), 선택 SMTP_HOST(기본 smtp.gmail.com), SMTP_PORT(기본 465)
function notifyEmail(title, message, url) {
  const { EMAIL_TO, SMTP_USER, SMTP_PASS } = process.env;
  if (!EMAIL_TO || !SMTP_USER || !SMTP_PASS) return;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT || '465';
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const mail = [
    `From: anna-watch <${SMTP_USER}>`,
    `To: ${EMAIL_TO}`,
    `Subject: =?UTF-8?B?${b64(title)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(`${title}\n\n${message}\n\n${url || ''}\n\n— anna-watch (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`),
    '',
  ].join('\r\n');
  const tmp = path.join(ROOT, '.mail.tmp');
  try {
    fs.writeFileSync(tmp, mail);
    execFileSync('curl', [
      '-sS', '--ssl-reqd', '--url', `smtps://${host}:${port}`,
      '--mail-from', SMTP_USER, '--mail-rcpt', EMAIL_TO,
      '--user', `${SMTP_USER}:${SMTP_PASS}`, '--upload-file', tmp, '--max-time', '30',
    ], { stdio: 'pipe' });
    log(`이메일 발송: ${EMAIL_TO}`);
  } catch (e) {
    log(`이메일 실패: ${(e.stderr || e.message).toString().trim().split('\n').pop()}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function notify(title, message, url) {
  log(`🔔 ${title} — ${message} ${url || ''}`);
  if (DRY) return;
  notifyMac(title, message);
  notifyEmail(title, message, url);
  await notifySlack(title, message, url);
}

// ---------- sources ----------
// 각 source는 { key, label, url, check() } 이고 check()는
// { status: 'in_stock' | 'sold_out' | 'unknown', detail, items?: [{id, name, url, price}] } 를 돌려준다.

const sources = [
  {
    key: 'nisarat',
    label: '니사라트 ANNA - SILVER',
    url: 'https://nisarat.shop/product/detail.html?product_no=2936&cate_no=141&display_group=1',
    async check() {
      const html = await fetchText(this.url);
      const text = strip(html);
      if (!/ANNA - SILVER/.test(text)) return { status: 'unknown', detail: '상품명 못 찾음' };
      // cafe24: 사이즈 옵션이 <option>으로 있으면 품절 옵션엔 "(품절)"이 붙는다
      const opts = [...html.matchAll(/<option[^>]*>([^<]{1,40})<\/option>/g)].map((m) => m[1].trim());
      const sizeOpt = opts.find((o) => new RegExp(`^${WANT_SIZE}\\b`).test(o));
      if (sizeOpt) {
        const soldOut = /품절|sold\s*out/i.test(sizeOpt);
        return { status: soldOut ? 'sold_out' : 'in_stock', detail: `옵션 "${sizeOpt}"` };
      }
      const soldOut = /Out of stock|재입고 알림|품절/i.test(text);
      return { status: soldOut ? 'sold_out' : 'in_stock', detail: soldOut ? '품절 표시' : '구매 가능 표시' };
    },
  },
  {
    key: 'eballetshop',
    label: '이발레샵 Yumiko - Anna (Silver)',
    url: 'https://www.eballetshop.com/goods/goods_view.php?goodsNo=9199',
    async check() {
      const text = strip(await fetchText(this.url));
      if (!/Yumiko - Anna \(Silver\)/.test(text)) return { status: 'unknown', detail: '상품명 못 찾음' };
      // 고도몰: "옵션 : 가격 = XS S [품절] M [품절] L [품절] 총 상품금액"
      const m = text.match(/옵션[^=]*=\s*([\s\S]{0,200}?)총 상품금액/);
      if (!m) return { status: 'unknown', detail: '옵션 영역 못 찾음' };
      const seg = m[1];
      const sizeRe = new RegExp(`(^|\\s)${WANT_SIZE}(\\s*\\[품절\\])?(?=\\s|$)`);
      const sm = seg.match(sizeRe);
      if (!sm) return { status: 'unknown', detail: `옵션에 ${WANT_SIZE} 없음: ${seg.trim()}` };
      return { status: sm[2] ? 'sold_out' : 'in_stock', detail: seg.trim() };
    },
  },
  {
    key: 'toptoe',
    label: '탑토 전설의 안나♪',
    url: 'http://toptoe.kr/shop/shopdetail.html?branduid=12256184',
    async check() {
      const text = strip(await fetchText(this.url));
      if (!/Anna\(MNG\)\(Cap\)\(N-Silver\)\(CV-Silver\)/.test(text)) return { status: 'unknown', detail: '상품명 못 찾음' };
      // makeshop: 구매 버튼 영역이 "품절"이면 품절, 아니면 "장바구니/바로구매"
      const m = text.match(/총 상품 금액[\s\S]{0,120}/);
      const seg = m ? m[0] : text;
      const soldOut = /품절/.test(seg) && !/바로\s*구매|장바구니 담기/.test(seg);
      return { status: soldOut ? 'sold_out' : 'in_stock', detail: soldOut ? '품절 표시' : '구매 버튼 있음' };
    },
  },
  {
    key: 'toptoe-category',
    label: '탑토 Anna 카테고리 (실버 신규 상품)',
    url: 'http://toptoe.kr/shop/shopbrand.html?xcode=002&type=M&mcode=003&scode=002',
    async check() {
      const html = await fetchText(this.url);
      const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
        .map((m) => m[1])
        .filter((s) => /shopdetail\.html/.test(s))
        .map((s) => {
          const id = (s.match(/branduid=(\d+)/) || [])[1];
          const name = (s.match(/alt="([^"]*Yumiko[^"]*)"/) || s.match(/(Yumiko_Anna[^<]{0,80})/) || [])[1] || strip(s).slice(0, 80);
          return { id, name: name.trim(), url: `http://toptoe.kr/shop/shopdetail.html?branduid=${id}` };
        })
        .filter((i) => i.id && /Silver/i.test(i.name));
      if (!/Anna/.test(html)) return { status: 'unknown', detail: '카테고리 파싱 실패' };
      return { status: 'list', detail: `실버 상품 ${items.length}개`, items };
    },
  },
  {
    key: 'vdenie',
    label: '브이데니에 유미코 카테고리 (Anna)',
    url: 'https://www.vdenie.co.kr/shop/shopbrand.html?type=N&xcode=002&mcode=001',
    async check() {
      const html = await fetchText(this.url);
      // makeshop 리스트: <ul class="item"> ... branduid=... <li class="prd-name">이름</li> ... </ul>
      const items = html
        .split('<ul class="item">')
        .slice(1)
        .filter((s) => /branduid=/.test(s) && /prd-name">[^<]*Anna/i.test(s))
        .map((s) => {
          const id = (s.match(/branduid=(\d+)/) || [])[1];
          const name = ((s.match(/prd-name">([^<]+)</) || [])[1] || '').trim();
          const t = strip(s);
          const price = (t.match(/([\d,]+)원/) || [])[1];
          return { id, name, url: `https://www.vdenie.co.kr/shop/shopdetail.html?branduid=${id}`, price, soldOut: /품절/.test(t) };
        })
        .filter((i) => i.id);
      if (!/Yumiko/.test(html)) return { status: 'unknown', detail: '카테고리 파싱 실패' };
      // 상세 페이지에서 L 옵션 확인
      for (const it of items) {
        try {
          const d = await fetchText(it.url);
          const opts = [...d.matchAll(/<option[^>]*>([^<]{1,20})<\/option>/g)].map((m) => m[1].trim());
          it.sizes = opts.filter((o) => /^(XS|S|M|L|XL|XXL)\b/.test(o));
          it.hasSize = it.sizes.some((o) => new RegExp(`^${WANT_SIZE}\\b`).test(o) && !/품절/.test(o));
        } catch {}
      }
      return { status: 'list', detail: `Anna ${items.length}개`, items };
    },
  },
  {
    key: 'renverse',
    label: '랑베르쎄 유미코 (안나 신규)',
    url: 'https://www.renverse.shop/yumiko_leotard',
    async check() {
      const html = await fetchText(this.url);
      const names = [...new Set([...html.matchAll(/\[유미코\][^<"]{0,80}/g)].map((m) => m[0].trim()))];
      if (names.length === 0) return { status: 'unknown', detail: '상품 목록 파싱 실패' };
      const items = names
        .filter((n) => /안나|Anna/i.test(n))
        .map((n) => ({ id: n, name: n, url: this.url }));
      return { status: 'list', detail: `유미코 ${names.length}개 중 안나 ${items.length}개`, items };
    },
  },
  {
    key: 'yumiko-rtw',
    label: 'Yumiko 공식 Ready to Wear (JP/US/EU)',
    url: 'https://jp.yumiko.com/collections/women-ready-to-wear',
    async check() {
      const hosts = ['jp.yumiko.com', 'www.yumiko.com', 'eu.yumiko.com'];
      const items = [];
      let ok = 0;
      for (const h of hosts) {
        try {
          const j = await fetchJson(`https://${h}/collections/women-ready-to-wear/products.json?limit=250`);
          ok++;
          for (const p of j.products || []) {
            const blob = `${p.title} ${p.handle} ${(p.tags || []).join(' ')} ${p.variants.map((v) => v.title).join(' ')}`;
            if (!/anna/i.test(blob) || !/silver/i.test(blob)) continue;
            const avail = p.variants.filter((v) => v.available).map((v) => v.title);
            items.push({
              id: `${h}:${p.id}`,
              name: `${p.title} (${h})`,
              url: `https://${h}/products/${p.handle}`,
              price: p.variants[0]?.price,
              hasSize: avail.some((t) => new RegExp(`(^|\\W)${WANT_SIZE}(\\W|$)`).test(t)),
              sizes: avail,
            });
          }
        } catch (e) {
          log(`yumiko ${h}: ${e.message}`);
        }
      }
      if (ok === 0) return { status: 'unknown', detail: '세 리전 모두 조회 실패' };
      return { status: 'list', detail: `${ok}/3 리전 조회, Anna 실버 ${items.length}개`, items };
    },
  },
];

// ---------- main ----------

async function main() {
  if (process.argv.includes('--test')) {
    await notify('전설의 안나 감시 테스트', '알림이 정상적으로 동작합니다.', 'https://nisarat.shop');
    return;
  }

  const state = loadState();
  state.sources ||= {};
  const rows = [];

  for (const src of sources) {
    const prev = state.sources[src.key] || { status: null, seen: [], error: false };
    let result;
    try {
      result = await src.check();
    } catch (e) {
      result = { status: 'unknown', detail: e.message };
    }

    const next = { ...prev, lastChecked: new Date().toISOString(), detail: result.detail };

    if (result.status === 'unknown') {
      // 파싱/네트워크 실패는 한 번만 알리고, 복구될 때까지 조용히
      if (!prev.error) await notify(`⚠️ ${src.label} 확인 실패`, result.detail, src.url);
      next.error = true;
    } else {
      next.error = false;
      if (result.status === 'list') {
        const seen = new Set(prev.seen || []);
        const fresh = result.items.filter((i) => !seen.has(i.id));
        for (const it of fresh) {
          const sz = it.sizes ? ` / 사이즈: ${it.sizes.join(', ')}` : '';
          const hit = it.hasSize ? ` ★ ${WANT_SIZE} 있음` : '';
          await notify(`🆕 ${src.label}`, `${it.name}${it.price ? ` ${it.price}` : ''}${sz}${hit}`, it.url);
        }
        // 이전에 봤던 상품이라도 L 사이즈가 새로 생기면 알림
        for (const it of result.items) {
          if (!it.hasSize) continue;
          const key = `${it.id}#${WANT_SIZE}`;
          if (!seen.has(key)) {
            await notify(`✅ ${src.label} — ${WANT_SIZE} 구매 가능`, it.name, it.url);
            result.items.push({ id: key });
          }
        }
        next.seen = [...new Set([...(prev.seen || []), ...result.items.map((i) => i.id)])];
        next.status = 'list';
      } else {
        // 단일 상품: sold_out → in_stock 전환 시 알림. 첫 실행에 in_stock이면 그것도 알림.
        if (result.status === 'in_stock' && prev.status !== 'in_stock') {
          await notify(`✅ ${src.label} — 구매 가능!`, `${WANT_SIZE} 사이즈 ${result.detail}`, src.url);
        }
        next.status = result.status;
      }
    }

    state.sources[src.key] = next;
    const icon = result.status === 'in_stock' ? '✅' : result.status === 'sold_out' ? '⛔' : result.status === 'list' ? '📋' : '⚠️';
    rows.push(`${icon} ${src.label.padEnd(36)} ${result.status.padEnd(9)} ${result.detail}`);
  }

  saveState(state);
  console.log('\n' + rows.join('\n') + '\n');
  log(`체크 완료 (${sources.length}개 소스)`);

  // 현황 페이지 갱신 + GitHub Pages 푸시
  const site = buildSite(state, DOCS_DIR);
  if (NO_PUSH) return;
  try {
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe' }).toString().trim();
    git('add', 'docs');
    if (git('status', '--porcelain', 'docs') === '') return;
    const summary = site.available.length ? `구매 가능: ${site.available.join(', ')}` : '품절';
    git('commit', '-q', '-m', `chore: 입고 현황 갱신 (${summary})`);
    git('push', '-q');
    log(`페이지 푸시 완료 (${summary})`);
  } catch (e) {
    log(`페이지 푸시 실패: ${(e.stderr || e.message).toString().trim().split('\n').pop()}`);
  }
}

main().catch((e) => {
  log(`치명적 오류: ${e.stack || e.message}`);
  process.exit(1);
});
