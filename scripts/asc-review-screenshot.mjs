// App Store Connect API: サブスク4商品に審査用スクリーンショットを添付
// 使い方: node scripts/asc-review-screenshot.mjs <ISSUER_ID> <画像フォルダ>
//   画像フォルダに <productId>.png (例 mt_standard_monthly.png) を置いておく。
// 既存スクショがある商品はスキップ（差し替えたい場合はASCで削除してから再実行）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_PATH = 'C:/Sarjavex/apple store/AuthKey_HF6PVDBP9B.p8';
const KEY_ID = 'HF6PVDBP9B';
const BUNDLE_ID = 'com.sarjavex.memorytwin';
const PRODUCT_IDS = ['mt_standard_monthly', 'mt_standard_yearly', 'mt_pro_monthly', 'mt_pro_yearly'];

const ISSUER = process.argv[2];
const SHOT_DIR = process.argv[3];
if (!ISSUER || !SHOT_DIR) { console.error('usage: node asc-review-screenshot.mjs <ISSUER_ID> <dir>'); process.exit(1); }

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
async function api(method, pathname, body) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.status} ${e.code}: ${e.detail || e.title}`).join(' | ') || text.slice(0, 400);
    throw new Error(`${method} ${pathname} -> ${res.status}: ${detail}`);
  }
  return json;
}
const log = (m) => console.log(`[shot] ${m}`);

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
    if (!sub) { log(`${productId}: subscription not found, skip`); continue; }

    const existing = await api('GET', `/v1/subscriptions/${sub.id}/appStoreReviewScreenshot`).catch(() => null);
    if (existing?.data) { log(`${productId}: screenshot exists (${existing.data.attributes.assetDeliveryState?.state})`); continue; }

    const file = path.join(SHOT_DIR, `${productId}.png`);
    const buf = fs.readFileSync(file);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');

    const reserved = await api('POST', '/v1/subscriptionAppStoreReviewScreenshots', {
      data: {
        type: 'subscriptionAppStoreReviewScreenshots',
        attributes: { fileName: `${productId}.png`, fileSize: buf.length },
        relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
      },
    });
    const shot = reserved.data;
    const ops = shot.attributes.uploadOperations || [];
    log(`${productId}: reserved ${shot.id} (${ops.length} upload ops)`);

    for (const op of ops) {
      const headers = {};
      for (const h of op.requestHeaders || []) headers[h.name] = h.value;
      const part = buf.subarray(op.offset, op.offset + op.length);
      const res = await fetch(op.url, { method: op.method, headers, body: part });
      if (!res.ok) throw new Error(`${productId}: upload part failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    log(`${productId}: uploaded ${buf.length} bytes`);

    await api('PATCH', `/v1/subscriptionAppStoreReviewScreenshots/${shot.id}`, {
      data: {
        type: 'subscriptionAppStoreReviewScreenshots',
        id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: md5 },
      },
    });
    log(`${productId}: committed`);
  }

  // 最終状態の確認
  for (const productId of PRODUCT_IDS) {
    const sub = subs.find((s) => s.attributes.productId === productId);
    if (!sub) continue;
    const fresh = await api('GET', `/v1/subscriptions/${sub.id}`);
    log(`${productId}: state=${fresh.data.attributes.state}`);
  }
  log('DONE');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
