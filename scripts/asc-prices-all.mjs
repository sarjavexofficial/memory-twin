// App Store Connect API: JPN基準価格の均等換算(equalizations)で全地域の価格を登録
// 使い方: node scripts/asc-prices-all.mjs <ISSUER_ID>
// 冪等: 既に価格がある地域はスキップ。
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY_PATH = 'C:/Sarjavex/apple store/AuthKey_HF6PVDBP9B.p8';
const KEY_ID = 'HF6PVDBP9B';
const BUNDLE_ID = 'com.sarjavex.memorytwin';
const PRODUCT_IDS = ['mt_standard_monthly', 'mt_standard_yearly', 'mt_pro_monthly', 'mt_pro_yearly'];

const ISSUER = process.argv[2];
if (!ISSUER) { console.error('ISSUER_ID required'); process.exit(1); }

const pk = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, 'utf8'));
function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ISSUER, iat: now - 10, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: pk, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const BASE = 'https://api.appstoreconnect.apple.com';
let token = jwt();
let tokenAt = Date.now();
function auth() {
  if (Date.now() - tokenAt > 15 * 60 * 1000) { token = jwt(); tokenAt = Date.now(); }
  return token;
}
async function api(method, pathname, body) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { Authorization: `Bearer ${auth()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.status} ${e.code}: ${e.detail || e.title}`).join(' | ') || text.slice(0, 300);
    throw new Error(`${method} ${pathname} -> ${res.status}: ${detail}`);
  }
  return json;
}
async function getAll(pathname) {
  let out = [];
  let url = pathname;
  while (url) {
    const j = await api('GET', url);
    out = out.concat(j.data || []);
    url = j.links?.next ? j.links.next.replace(BASE, '') : null;
  }
  return out;
}
const territoryOf = (pointId) => JSON.parse(Buffer.from(pointId, 'base64').toString()).t;
const log = (m) => console.log(`[price] ${m}`);

async function main() {
  const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
  const app = apps.data[0];
  const groups = await api('GET', `/v1/apps/${app.id}/subscriptionGroups?limit=50`);
  const subs = [];
  for (const g of groups.data) {
    const list = await api('GET', `/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
    subs.push(...list.data);
  }

  for (const productId of PRODUCT_IDS) {
    const sub = subs.find((s) => s.attributes.productId === productId);
    if (!sub) { log(`${productId}: not found, skip`); continue; }

    // 既存の価格（地域つき）
    const priceRecords = await getAll(`/v1/subscriptions/${sub.id}/prices?limit=200&include=territory`);
    const have = new Set();
    for (const pr of priceRecords) {
      const t = pr.relationships?.territory?.data?.id;
      if (t) have.add(t);
    }
    log(`${productId}: existing prices ${have.size}`);

    // JPN価格のprice point → 均等換算リスト
    const jpnPrice = await getAll(`/v1/subscriptions/${sub.id}/prices?limit=200&include=subscriptionPricePoint&filter[territory]=JPN`);
    let jpnPointId = jpnPrice[0]?.relationships?.subscriptionPricePoint?.data?.id;
    if (!jpnPointId) throw new Error(`${productId}: JPN price not found`);
    const eq = await getAll(`/v1/subscriptionPricePoints/${jpnPointId}/equalizations?limit=8000`);
    log(`${productId}: equalizations ${eq.length}`);

    let created = 0, failed = 0;
    for (const pt of eq) {
      const terr = territoryOf(pt.id);
      if (have.has(terr)) continue;
      try {
        await api('POST', '/v1/subscriptionPrices', {
          data: {
            type: 'subscriptionPrices',
            relationships: {
              subscription: { data: { type: 'subscriptions', id: sub.id } },
              subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pt.id } },
            },
          },
        });
        created++;
      } catch (e) {
        failed++;
        if (failed <= 3) log(`${productId}: ${terr} failed: ${e.message.slice(0, 160)}`);
      }
    }
    log(`${productId}: created ${created}, failed ${failed}`);
  }

  for (const productId of PRODUCT_IDS) {
    const sub = subs.find((s) => s.attributes.productId === productId);
    if (!sub) continue;
    const fresh = await api('GET', `/v1/subscriptions/${sub.id}`);
    log(`${productId}: state=${fresh.data.attributes.state}`);
  }
  log('DONE');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
