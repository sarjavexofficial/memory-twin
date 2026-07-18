// RevenueCat v2 API: Memory Twin のアプリ接続・商品・権利・オファリングを自動設定
// 使い方: node scripts/revenuecat-setup.mjs <SECRET_API_KEY(sk_...)>
// 冪等（既存があれば再利用）。キーはファイルに書かず引数で渡す。

const SK = process.argv[2];
if (!SK) { console.error('secret key required'); process.exit(1); }

const BUNDLE_ID = 'com.sarjavex.memorytwin';
const PRODUCTS = [
  { sid: 'mt_standard_monthly', name: 'Standard Monthly', tier: 'standard', pkg: 'standard_monthly' },
  { sid: 'mt_standard_yearly',  name: 'Standard Yearly',  tier: 'standard', pkg: 'standard_yearly' },
  { sid: 'mt_pro_monthly',      name: 'Pro Monthly',      tier: 'pro',      pkg: 'pro_monthly' },
  { sid: 'mt_pro_yearly',       name: 'Pro Yearly',       tier: 'pro',      pkg: 'pro_yearly' },
];
const ENTITLEMENTS = [
  { lookup: 'standard', display: 'Standard' },
  { lookup: 'pro', display: 'Pro' },
];

const BASE = 'https://api.revenuecat.com/v2';
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return json;
}
async function getAll(path) {
  const sep = path.includes('?') ? '&' : '?';
  let out = [];
  let url = `${path}${sep}limit=100`;
  while (url) {
    const j = await api('GET', url);
    out = out.concat(j.items || []);
    url = j.next_page ? j.next_page.replace('/v2', '') : null;
  }
  return out;
}
const log = (m) => console.log(`[rc] ${m}`);

async function main() {
  // 1. プロジェクト
  const projects = await getAll('/projects');
  const project = projects.find((p) => /memory\s*twin/i.test(p.name)) || projects[0];
  if (!project) throw new Error('no project found');
  const pid = project.id;
  log(`project: ${project.name} (${pid})`);

  // 2. App Storeアプリ
  const apps = await getAll(`/projects/${pid}/apps`);
  let app = apps.find((a) => a.type === 'app_store');
  if (app) log(`app exists: ${app.id}`);
  else {
    app = await api('POST', `/projects/${pid}/apps`, {
      name: 'Memory Twin (App Store)',
      type: 'app_store',
      app_store: { bundle_id: BUNDLE_ID },
    });
    log(`app created: ${app.id}`);
  }
  console.log('[rc] app detail:', JSON.stringify(app));

  // 3. 商品4つ
  const existingProducts = await getAll(`/projects/${pid}/products`);
  const productIdByStore = {};
  for (const p of PRODUCTS) {
    let prod = existingProducts.find((x) => x.store_identifier === p.sid && x.app_id === app.id);
    if (prod) log(`product ${p.sid} exists: ${prod.id}`);
    else {
      prod = await api('POST', `/projects/${pid}/products`, {
        store_identifier: p.sid,
        app_id: app.id,
        type: 'subscription',
        display_name: p.name,
      });
      log(`product ${p.sid} created: ${prod.id}`);
    }
    productIdByStore[p.sid] = prod.id;
  }

  // 4. 権利 standard / pro ＋ 商品ひも付け
  const existingEnts = await getAll(`/projects/${pid}/entitlements`);
  for (const e of ENTITLEMENTS) {
    let ent = existingEnts.find((x) => x.lookup_key === e.lookup);
    if (ent) log(`entitlement ${e.lookup} exists: ${ent.id}`);
    else {
      ent = await api('POST', `/projects/${pid}/entitlements`, {
        lookup_key: e.lookup,
        display_name: e.display,
      });
      log(`entitlement ${e.lookup} created: ${ent.id}`);
    }
    const wanted = PRODUCTS.filter((p) => p.tier === e.lookup).map((p) => productIdByStore[p.sid]);
    const attached = await getAll(`/projects/${pid}/entitlements/${ent.id}/products`).catch(() => []);
    const missing = wanted.filter((id) => !attached.some((a) => a.id === id));
    if (missing.length) {
      await api('POST', `/projects/${pid}/entitlements/${ent.id}/actions/attach_products`, {
        product_ids: missing,
      });
      log(`entitlement ${e.lookup}: attached ${missing.length} products`);
    } else log(`entitlement ${e.lookup}: products already attached`);
  }

  // 5. オファリング default ＋ パッケージ4つ ＋ 商品ひも付け
  const offerings = await getAll(`/projects/${pid}/offerings`);
  let offering = offerings.find((o) => o.lookup_key === 'default') || offerings.find((o) => o.is_current);
  if (offering) log(`offering exists: ${offering.id} (current=${offering.is_current})`);
  else {
    offering = await api('POST', `/projects/${pid}/offerings`, {
      lookup_key: 'default',
      display_name: 'Default',
    });
    log(`offering created: ${offering.id} (current=${offering.is_current})`);
  }
  const packages = await getAll(`/projects/${pid}/offerings/${offering.id}/packages`);
  for (const p of PRODUCTS) {
    let pkg = packages.find((x) => x.lookup_key === p.pkg);
    if (pkg) log(`package ${p.pkg} exists: ${pkg.id}`);
    else {
      pkg = await api('POST', `/projects/${pid}/offerings/${offering.id}/packages`, {
        lookup_key: p.pkg,
        display_name: p.name,
      });
      log(`package ${p.pkg} created: ${pkg.id}`);
    }
    const prods = await getAll(`/projects/${pid}/packages/${pkg.id}/products`).catch(() => []);
    if (prods.some((x) => x.id === productIdByStore[p.sid])) { log(`package ${p.pkg}: product attached`); continue; }
    await api('POST', `/projects/${pid}/packages/${pkg.id}/actions/attach_products`, {
      products: [{ product_id: productIdByStore[p.sid], eligibility_criteria: 'all' }],
    });
    log(`package ${p.pkg}: product attached now`);
  }

  // 6. is_current でなければ current 化を試みる
  if (!offering.is_current) {
    try {
      const updated = await api('POST', `/projects/${pid}/offerings/${offering.id}`, { is_current: true });
      log(`offering set current: ${updated.is_current}`);
    } catch (e) {
      log(`could not set current via API (${e.message.slice(0, 120)}) — check dashboard`);
    }
  }

  // 7. 公開APIキー(appl_)を探す
  try {
    const keys = await getAll(`/projects/${pid}/apps/${app.id}/public_api_keys`);
    for (const k of keys) console.log('[rc] PUBLIC KEY:', JSON.stringify(k));
  } catch (e) {
    log(`public key endpoint not available: ${e.message.slice(0, 120)}`);
  }

  log('DONE');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
