// App Store Connect API: Memory Twin サブスク4商品の自動登録
// 使い方: node asc-iap.mjs <ISSUER_ID> [--dry-run]
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY_PATH = 'C:/Sarjavex/apple store/AuthKey_HF6PVDBP9B.p8';
const KEY_ID = 'HF6PVDBP9B';
const BUNDLE_ID = 'com.sarjavex.memorytwin';
const GROUP_NAME = 'Memory Twin Plans';

const ISSUER = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!ISSUER) { console.error('ISSUER_ID required'); process.exit(1); }

const PRODUCTS = [
  { name: 'Standard Monthly', productId: 'mt_standard_monthly', period: 'ONE_MONTH', level: 2, price: '980' },
  { name: 'Standard Yearly',  productId: 'mt_standard_yearly',  period: 'ONE_YEAR',  level: 2, price: '9800' },
  { name: 'Pro Monthly',      productId: 'mt_pro_monthly',      period: 'ONE_MONTH', level: 1, price: '1980' },
  { name: 'Pro Yearly',       productId: 'mt_pro_yearly',       period: 'ONE_YEAR',  level: 1, price: '19800' },
];

const LOCALIZATIONS = {
  standard: {
    ja:      { name: 'Standard', description: 'AI質問 月500回・取り込み無制限・週次/月次レポート' },
    'en-US': { name: 'Standard', description: '500 AI questions/mo, unlimited imports, AI reviews' },
  },
  pro: {
    ja:      { name: 'Pro', description: 'AI質問 月1,500回・Today Recall最大10件・過去比較' },
    'en-US': { name: 'Pro', description: '1,500 AI questions/mo, 10 Today Recalls, comparisons' },
  },
};
const GROUP_LOC = { ja: 'Memory Twin プラン', 'en-US': 'Memory Twin Plans' };

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
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.status} ${e.code}: ${e.detail || e.title}`).join(' | ') || text.slice(0, 500);
    throw new Error(`${method} ${path} -> ${res.status}: ${detail}`);
  }
  return json;
}
async function getAll(path) {
  let out = [];
  let url = path;
  while (url) {
    const j = await api('GET', url);
    out = out.concat(j.data || []);
    url = j.links?.next ? j.links.next.replace(BASE, '') : null;
  }
  return out;
}

function log(msg) { console.log(`[asc] ${msg}`); }

async function main() {
  // 1. アプリ特定
  const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`);
  const app = apps.data[0];
  if (!app) throw new Error(`app not found for ${BUNDLE_ID}`);
  log(`app: ${app.id} (${app.attributes.name})`);

  // 2. サブスクリプショングループ（既存があれば再利用）
  const groups = await getAll(`/v1/apps/${app.id}/subscriptionGroups?limit=50`);
  let group = groups.find((g) => g.attributes.referenceName === GROUP_NAME);
  if (group) log(`group exists: ${group.id}`);
  else if (DRY) { log(`would create group "${GROUP_NAME}"`); return; }
  else {
    group = (await api('POST', '/v1/subscriptionGroups', {
      data: {
        type: 'subscriptionGroups',
        attributes: { referenceName: GROUP_NAME },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      },
    })).data;
    log(`group created: ${group.id}`);
  }

  // 3. グループのローカリゼーション
  const gLocs = await getAll(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations?limit=50`);
  for (const [locale, name] of Object.entries(GROUP_LOC)) {
    if (gLocs.find((l) => l.attributes.locale === locale)) { log(`group loc ${locale} exists`); continue; }
    await api('POST', '/v1/subscriptionGroupLocalizations', {
      data: {
        type: 'subscriptionGroupLocalizations',
        attributes: { locale, name },
        relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: group.id } } },
      },
    });
    log(`group loc ${locale} created`);
  }

  // 全テリトリー（販売地域）一覧
  const territories = await getAll('/v1/territories?limit=200');
  log(`territories: ${territories.length}`);

  // 4. 各商品
  const existing = await getAll(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`);
  for (const p of PRODUCTS) {
    let sub = existing.find((s) => s.attributes.productId === p.productId);
    if (sub) log(`sub ${p.productId} exists: ${sub.id} (${sub.attributes.state})`);
    else {
      sub = (await api('POST', '/v1/subscriptions', {
        data: {
          type: 'subscriptions',
          attributes: {
            name: p.name,
            productId: p.productId,
            subscriptionPeriod: p.period,
            groupLevel: p.level,
            familySharable: false,
          },
          relationships: { group: { data: { type: 'subscriptionGroups', id: group.id } } },
        },
      })).data;
      log(`sub ${p.productId} created: ${sub.id}`);
    }

    // 4a. ローカリゼーション
    const tier = p.productId.includes('_pro_') ? 'pro' : 'standard';
    const locs = await getAll(`/v1/subscriptions/${sub.id}/subscriptionLocalizations?limit=50`);
    for (const [locale, attrs] of Object.entries(LOCALIZATIONS[tier])) {
      if (locs.find((l) => l.attributes.locale === locale)) { log(`  loc ${locale} exists`); continue; }
      await api('POST', '/v1/subscriptionLocalizations', {
        data: {
          type: 'subscriptionLocalizations',
          attributes: { locale, name: attrs.name, description: attrs.description },
          relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
        },
      });
      log(`  loc ${locale} created`);
    }

    // 4b. 販売地域（※価格設定より先に必須。逆順だと価格POSTが409になる）
    let hasAvail = false;
    try {
      const avail = await api('GET', `/v1/subscriptions/${sub.id}/subscriptionAvailability`);
      hasAvail = Boolean(avail?.data);
    } catch { /* not set yet */ }
    if (hasAvail) log(`  availability exists`);
    else {
      await api('POST', '/v1/subscriptionAvailabilities', {
        data: {
          type: 'subscriptionAvailabilities',
          attributes: { availableInNewTerritories: true },
          relationships: {
            subscription: { data: { type: 'subscriptions', id: sub.id } },
            availableTerritories: { data: territories.map((t) => ({ type: 'territories', id: t.id })) },
          },
        },
      });
      log(`  availability set (${territories.length} territories)`);
    }

    // 4c. 価格（日本を基準に設定 → 他地域は自動換算）
    const prices = await getAll(`/v1/subscriptions/${sub.id}/prices?limit=200&include=territory`).catch(() => []);
    if (prices.some((pr) => pr.relationships?.territory?.data?.id === 'JPN')) log(`  price JPN exists`);
    else {
      const points = await getAll(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=JPN&limit=8000`);
      const point = points.find((pt) => pt.attributes.customerPrice === p.price);
      if (!point) throw new Error(`price point ¥${p.price} not found for ${p.productId} (got ${points.length} points)`);
      await api('POST', '/v1/subscriptionPrices', {
        data: {
          type: 'subscriptionPrices',
          relationships: {
            subscription: { data: { type: 'subscriptions', id: sub.id } },
            subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: point.id } },
          },
        },
      });
      log(`  price JPN ¥${p.price} set`);
    }
  }

  log('DONE');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
