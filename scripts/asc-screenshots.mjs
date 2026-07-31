// App Store用スクリーンショットをASC APIで登録する。
// 使い方: node scripts/asc-screenshots.mjs status   … 現在の版・ロケール・既存セットを表示
//         node scripts/asc-screenshots.mjs upload <ja画像dir> <en画像dir> … 6.7型セットへ登録
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_PATH = 'C:/Sarjavex/apple store/AuthKey_HF6PVDBP9B.p8';
const KEY_ID = 'HF6PVDBP9B';
const ISSUER = '06195bfe-2655-4856-be44-21e4f0cd2831';
const APP_ID = '6791472591';
const API = 'https://api.appstoreconnect.apple.com';
const pk = fs.readFileSync(KEY_PATH, 'utf8');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64({ iss: ISSUER, iat: now - 10, exp: now + 1100, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: pk, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(method, p, payload) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function getEditableVersion() {
  const v = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=5`);
  if (!v.data.length) throw new Error('編集可能なバージョン（PREPARE_FOR_SUBMISSION）が見つかりません');
  return v.data[0];
}

async function getLocalizations(versionId) {
  const l = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=10`);
  return l.data.map((x) => ({ id: x.id, locale: x.attributes.locale }));
}

async function status() {
  const ver = await getEditableVersion();
  console.log(`バージョン: ${ver.attributes.versionString} / 状態: ${ver.attributes.appStoreState} / id=${ver.id}`);
  for (const loc of await getLocalizations(ver.id)) {
    const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20`);
    console.log(`[${loc.locale}] セット: ${sets.data.map((s) => s.attributes.screenshotDisplayType).join(', ') || 'なし'}`);
    for (const s of sets.data) {
      const shots = await api('GET', `/v1/appScreenshotSets/${s.id}/appScreenshots?limit=20`);
      console.log(`  ${s.attributes.screenshotDisplayType}: ${shots.data.length}枚 (${shots.data.map((x) => x.attributes.fileName).join(', ')})`);
    }
  }
}

async function ensureSet(locId, displayType) {
  const sets = await api('GET', `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets?limit=20`);
  const hit = sets.data.find((s) => s.attributes.screenshotDisplayType === displayType);
  if (hit) return hit.id;
  const created = await api('POST', '/v1/appScreenshotSets', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: locId } } },
    },
  });
  return created.data.id;
}

async function uploadOne(setId, filePath) {
  const fileName = path.basename(filePath);
  const bytes = fs.readFileSync(filePath);
  const reserved = await api('POST', '/v1/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName, fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  const shotId = reserved.data.id;
  for (const op of reserved.data.attributes.uploadOperations) {
    const headers = {};
    for (const h of op.requestHeaders) headers[h.name] = h.value;
    const chunk = bytes.subarray(op.offset, op.offset + op.length);
    const put = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!put.ok) throw new Error(`upload PUT ${put.status}`);
  }
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  await api('PATCH', `/v1/appScreenshots/${shotId}`, {
    data: { type: 'appScreenshots', id: shotId, attributes: { uploaded: true, sourceFileChecksum: md5 } },
  });
  return shotId;
}

async function upload(jaDir, enDir) {
  const ver = await getEditableVersion();
  const locs = await getLocalizations(ver.id);
  const plan = [
    { locale: 'ja', dir: jaDir },
    { locale: 'en-US', dir: enDir },
  ];
  for (const { locale, dir } of plan) {
    const loc = locs.find((l) => l.locale === locale);
    if (!loc) { console.log(`!! ロケール ${locale} が見つからずスキップ`); continue; }
    const setId = await ensureSet(loc.id, 'APP_IPHONE_67');
    const existing = await api('GET', `/v1/appScreenshotSets/${setId}/appScreenshots?limit=20`);
    for (const s of existing.data) {
      await api('DELETE', `/v1/appScreenshots/${s.id}`);
      console.log(`[${locale}] 既存を削除: ${s.attributes.fileName}`);
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    for (const f of files) {
      const id = await uploadOne(setId, path.join(dir, f));
      console.log(`[${locale}] 登録: ${f} (id=${id.slice(0, 8)}…)`);
    }
  }
  console.log('完了。反映状態は status で確認できます。');
}

const cmd = process.argv[2];
if (cmd === 'status') await status();
else if (cmd === 'upload') await upload(process.argv[3], process.argv[4]);
else console.log('usage: status | upload <jaDir> <enDir>');
