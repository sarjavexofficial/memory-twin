// 巨大なAIエクスポートを「メモリを一定に保ったまま」取り込むための流し読み処理。
//
// なぜ必要か: ChatGPTのエクスポートZIPは圧縮率が30倍を超えることがあり、
// 20MBのZIPが数百MBのconversations.jsonになる。丸ごと文字列にしてJSON.parseすると
// 端末のメモリを使い切ってアプリが落ちる（＝「重くなって止まる」）。
//
// そこで
//   ①ZIPはディスクから1MBずつ読む（ファイル全体をメモリに載せない）
//   ②解凍も1MBずつ流す（展開後の全体をメモリに載せない）
//   ③JSONは「最上位配列の1要素＝1会話」ずつ切り出してJSON.parseする
//   ④記録は新しい順に上限件数だけ保持する（import.ts の TopRecords）
// という段構えにして、ファイルの大きさに関係なく使用メモリを一定に保つ。
//
// JSONの構造文字（{ } [ ] " \）はすべてASCII。UTF-8ではマルチバイト文字の各バイトが
// 必ず0x80以上になるため、バイト列のまま走査しても文字の途中を構造文字と誤認しない。
// これによりTextDecoder（環境によって有無が変わる）に頼らず、
// チャンクの切れ目が文字の途中に来ても壊れない。

import { strFromU8, Unzip, UnzipInflate } from 'fflate';

import { BackupPayload } from '@/lib/backup';
import {
  detectFormat,
  ImportedRecord,
  ImportFormat,
  NO_RECORDS_MESSAGE,
  recordFromItem,
  TopRecords,
} from '@/lib/import';

const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;
const QUOTE = 0x22;
const BSLASH = 0x5c;

// ディスクからの読み出し単位。
// ZIPは「圧縮後」の大きさで刻むため小さめにする: 圧縮率が80倍を超えることがあり、
// 1MBずつ読むと解凍後の出力が一気に80MB級になってメモリのピークが跳ね上がる
const ZIP_CHUNK_SIZE = 64 * 1024;
// 生JSONは膨らまないので大きめに読む
const JSON_CHUNK_SIZE = 1024 * 1024;
// 解凍後のデータをスキャナへ渡す単位（細かく刻んでGCが回収できる隙をつくる）
const SCAN_SLICE_SIZE = 512 * 1024;
// UIへ制御を返す間隔。毎スライスで返すと待ち時間の方が長くなるため、
// 60fpsの1コマ分だけ動かして必ず息継ぎする、という間引きにする
const YIELD_INTERVAL_MS = 16;

// 暴走防止の上限（壊れたファイルで無限に読み続けないため）。通常のエクスポートは遥かに小さい
const MAX_SCAN_BYTES = 3 * 1024 * 1024 * 1024;

// 自分のバックアップ(data.json)は1つのオブジェクトなので分割して読めない。
// 写真を埋め込んでいる分だけ大きくなるため、常識的な上限を置く
const MAX_BACKUP_BYTES = 300 * 1024 * 1024;

export type ImportProgress = {
  bytesRead: number; // 読み終わったファイルのバイト数
  totalBytes: number; // ファイル全体のバイト数（不明なら0）
  records: number; // ここまでに見つかった記録の件数
};

export type StreamResult =
  | { kind: 'backup'; backup: BackupPayload }
  | { kind: 'records'; records: ImportedRecord[] };

// ---- 最上位JSON配列を1要素ずつ切り出すスキャナ ----

export class JsonArrayScanner {
  // 供給元（fflateの解凍出力・ファイルハンドル）が返す型に合わせて ArrayBufferLike で受ける
  private buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private pos = 0;
  private elemStart = -1;
  private depth = 0;
  private inString = false;
  private started = false; // 先頭の '[' を見つけたか
  private closed = false; // 最上位配列が閉じたか

  constructor(private readonly onItem: (json: string) => void) {}

  get isClosed(): boolean {
    return this.closed;
  }

  get sawArray(): boolean {
    return this.started;
  }

  push(chunk: Uint8Array<ArrayBufferLike>): void {
    if (this.closed || chunk.length === 0) return;
    if (this.buf.length === 0) {
      this.buf = chunk;
    } else {
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf, 0);
      merged.set(chunk, this.buf.length);
      this.buf = merged;
    }
    this.scan();
    this.compact();
  }

  private scan(): void {
    const b = this.buf;
    let i = this.pos;
    while (i < b.length) {
      const c = b[i];

      if (this.inString) {
        // 文字列の中身がファイルの大半を占める。1バイトずつ見ると
        // 数十MBのファイルで数千万回のループになるため、閉じ引用符までを
        // ネイティブのindexOfで一気に飛ばす（体感速度がここで決まる）。
        // 直前のバックスラッシュが奇数個なら、その引用符はエスケープされている
        let q = b.indexOf(QUOTE, i);
        while (q >= 0) {
          let backslashes = 0;
          let k = q - 1;
          while (k >= 0 && b[k] === BSLASH) {
            backslashes++;
            k--;
          }
          if (backslashes % 2 === 0) break;
          q = b.indexOf(QUOTE, q + 1);
        }
        if (q < 0) {
          // 閉じ引用符がまだ届いていない。次のチャンクを待つ
          this.pos = b.length;
          return;
        }
        this.inString = false;
        i = q + 1;
        // 最上位が文字列だけの要素はここで1件確定する
        if (this.depth === 0 && this.elemStart >= 0) {
          this.onItem(strFromU8(b.subarray(this.elemStart, i)));
          this.elemStart = -1;
          this.pos = i;
        }
        continue;
      }

      if (!this.started) {
        // 配列が始まる前（BOM・空白など）は読み飛ばす
        if (c === LBRACKET) this.started = true;
        i++;
        continue;
      }

      if (c === QUOTE) {
        // 最上位が文字列の要素（["a","b"] のような形）でも要素の先頭を覚えておく。
        // こうしておくとcompactが必ず要素の先頭から残すため、
        // 上のエスケープ判定が過去のバイトを安全に遡れる
        if (this.depth === 0 && this.elemStart < 0) this.elemStart = i;
        this.inString = true;
        i++;
        continue;
      }

      if (c === LBRACE || c === LBRACKET) {
        if (this.depth === 0) this.elemStart = i;
        this.depth++;
        i++;
        continue;
      }

      if (c === RBRACE || c === RBRACKET) {
        if (this.depth === 0) {
          // 最上位配列の終わり
          this.closed = true;
          this.pos = i + 1;
          return;
        }
        this.depth--;
        i++;
        if (this.depth === 0 && this.elemStart >= 0) {
          this.onItem(strFromU8(this.buf.subarray(this.elemStart, i)));
          this.elemStart = -1;
        }
        continue;
      }

      i++;
    }
    this.pos = i;
  }

  // 使い終わった前半を捨てて、保持するのは「読みかけの1要素」だけにする
  private compact(): void {
    const keep = this.elemStart >= 0 ? this.elemStart : this.pos;
    if (keep <= 0) return;
    this.buf = this.buf.slice(keep);
    this.pos -= keep;
    if (this.elemStart >= 0) this.elemStart -= keep;
  }
}

// ---- 記録の収集（形式判定 → 1件ずつ変換 → 上限つき保持） ----

class RecordCollector {
  private format: ImportFormat | null = null;
  readonly top = new TopRecords();
  scanned = 0;

  handle(json: string): void {
    let item: unknown;
    try {
      item = JSON.parse(json);
    } catch {
      return; // 1件壊れていても全体は止めない
    }
    this.scanned++;
    if (this.format === null) this.format = detectFormat(item);
    const record = recordFromItem(item, this.format);
    if (record) this.top.add(record);
  }
}

// ---- チャンク供給元 ----

// ネイティブ: ファイルを開いたまま少しずつ読む（全体をメモリに載せない）。
// 終端の振る舞い（0バイトを返すか例外か）は実装差がありうるため、
// ①ファイルサイズに達したら終了 ②0バイトなら終了 ③例外も終端として扱う
// の三重で必ず止まるようにしている
async function* nativeFileChunks(uri: string, chunkSize: number): AsyncGenerator<Uint8Array> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  const total = file.size ?? 0;
  const handle = file.open();
  try {
    let read = 0;
    for (;;) {
      if (total > 0 && read >= total) return;
      let bytes: Uint8Array | null = null;
      try {
        bytes = handle.readBytes(chunkSize);
      } catch (e) {
        // まだ1バイトも読めていないのに失敗した場合は「終端」ではなく本物の失敗。
        // 黙って終端扱いにすると「ZIPに読み取れるファイルがない」という
        // 誤ったエラーに化けて原因究明できなくなるため、明確に伝える
        if (read === 0) {
          throw new Error(
            `ファイルを読み取れませんでした（${String((e as Error)?.message ?? e).slice(0, 80)}）。もう一度ファイルを選び直してください。`,
          );
        }
        return; // 途中まで読めていれば終端の実装差とみなして正常終了
      }
      if (!bytes || bytes.length === 0) return;
      read += bytes.length;
      yield bytes;
    }
  } finally {
    handle.close();
  }
}

// Web: 既にメモリ上にあるバイト列を同じ粒度で流す
async function* bytesChunks(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield bytes.subarray(offset, Math.min(offset + size, bytes.length));
  }
}

// UIへ制御を返す（進捗表示を更新させ、操作不能に見えないようにする）。
// 返しすぎると待ち時間ばかりになるので、前回から一定時間経ったときだけ息継ぎする。
// 息継ぎしたタイミングでのみ進捗を通知することで、画面の再描画も無駄打ちしない
class Pacer {
  private last = Date.now();

  async breathe(report: () => void): Promise<void> {
    const now = Date.now();
    if (now - this.last < YIELD_INTERVAL_MS) return;
    this.last = now;
    report();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function isConversationsName(name: string): boolean {
  return /(^|\/)conversations\.json$/i.test(name);
}

function isBackupName(name: string): boolean {
  return /(^|\/)data\.json$/i.test(name);
}

function asBackupPayload(text: string): BackupPayload | null {
  try {
    const p = JSON.parse(text) as {
      app?: string;
      people?: unknown;
      journal?: unknown;
      tasks?: unknown;
    };
    if (p?.app === 'Memory Twin' && Array.isArray(p.people) && Array.isArray(p.journal)) {
      return {
        people: p.people as BackupPayload['people'],
        journal: p.journal as BackupPayload['journal'],
        tasks: Array.isArray(p.tasks) ? (p.tasks as BackupPayload['tasks']) : [],
      };
    }
  } catch {
    // 壊れていたらバックアップとして扱わない
  }
  return null;
}

// ---- ZIPの流し読み ----

async function readZipStream(
  chunks: AsyncGenerator<Uint8Array>,
  totalBytes: number,
  onProgress?: (p: ImportProgress) => void,
): Promise<StreamResult> {
  const collector = new RecordCollector();
  const scanner = new JsonArrayScanner((json) => collector.handle(json));

  // 自分のバックアップ(data.json)は分割して読めないため、見つけたら溜める
  const backupParts: Uint8Array[] = [];
  let backupBytes = 0;
  let sawConversations = false;
  let sawBackup = false;
  let decompressed = 0;
  let failure: Error | null = null;

  // fflateのondataは同期コールバックなので、その中でUIへ制御を返せない。
  // いったんここに積んで、pushの合間に少しずつスキャナへ流す
  let pending: Uint8Array<ArrayBufferLike>[] = [];

  // 対象が見つからなかったとき、原因究明のために「中に何が入っていたか」を伝える
  const seenNames: string[] = [];

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (seenNames.length < 20) seenNames.push(file.name);
    const conversations = isConversationsName(file.name);
    const backup = isBackupName(file.name);
    if (!conversations && !backup) return; // start()を呼ばなければ解凍されない

    if (conversations) sawConversations = true;
    if (backup) sawBackup = true;

    file.ondata = (err, data, _final) => {
      if (err) {
        failure = failure ?? new Error(`ZIPの解凍に失敗しました（${file.name}）。`);
        return;
      }
      if (failure || data.length === 0) return;
      decompressed += data.length;
      if (decompressed > MAX_SCAN_BYTES) {
        failure = failure ?? new Error('ファイルの中身が大きすぎます。');
        return;
      }
      if (backup) {
        backupBytes += data.length;
        if (backupBytes > MAX_BACKUP_BYTES) {
          failure = failure ?? new Error('バックアップファイルが大きすぎます（300MBまで）。');
          return;
        }
        backupParts.push(data);
      } else {
        pending.push(data);
      }
    };
    file.start();
  };

  // 溜まった解凍済みデータを一定量ずつスキャナへ流し、合間にUIへ制御を返す
  const pacer = new Pacer();
  async function drain(bytesRead: number): Promise<void> {
    if (pending.length === 0) return;
    const queue = pending;
    pending = [];
    for (const part of queue) {
      for (let offset = 0; offset < part.length; offset += SCAN_SLICE_SIZE) {
        scanner.push(part.subarray(offset, Math.min(offset + SCAN_SLICE_SIZE, part.length)));
        await pacer.breathe(() =>
          onProgress?.({ bytesRead, totalBytes, records: collector.top.count }),
        );
      }
    }
  }

  let bytesRead = 0;
  for await (const chunk of chunks) {
    bytesRead += chunk.length;
    // fflateは最後のチャンクで final=true を要求する。
    // 総サイズが分かる場合はそこで、分からない場合はループ後にpush(空, true)で締める
    const isFinal = totalBytes > 0 && bytesRead >= totalBytes;
    unzip.push(chunk, isFinal);
    if (failure) throw failure;
    await drain(bytesRead);
    if (failure) throw failure;
  }
  if (!(totalBytes > 0 && bytesRead >= totalBytes)) {
    unzip.push(new Uint8Array(0), true);
    if (failure) throw failure;
    await drain(bytesRead);
    if (failure) throw failure;
  }
  // 最後まで読み終わったことを画面に伝える（100%表示のため）
  onProgress?.({ bytesRead, totalBytes, records: collector.top.count });

  // data.json（自分のバックアップ）が入っていればそれを優先する
  if (sawBackup && backupParts.length > 0) {
    const joined = new Uint8Array(backupBytes);
    let offset = 0;
    for (const part of backupParts) {
      joined.set(part, offset);
      offset += part.length;
    }
    const backup = asBackupPayload(strFromU8(joined));
    if (backup) return { kind: 'backup', backup };
  }

  // 1バイトも読めていない場合は「中身がない」のではなく読み取り自体の失敗
  if (bytesRead === 0) {
    throw new Error('ファイルを読み取れませんでした（0バイト）。もう一度ファイルを選び直してください。');
  }

  if (!sawConversations && !sawBackup) {
    // 中身の一覧を添えて「名前が違う」のか「ZIP自体を読めていない」のかを判別できるようにする
    const inside =
      seenNames.length > 0
        ? `中に入っていたファイル: ${seenNames.slice(0, 8).join('、')}${seenNames.length > 8 ? ` 他${seenNames.length - 8}件` : ''}`
        : 'ZIPの中身を1件も読み取れませんでした（ZIP形式でない可能性があります）';
    throw new Error(
      `このZIPの中に conversations.json / data.json が見つかりませんでした。${inside}。ChatGPT/Claudeの設定画面からの公式エクスポート、またはMemory Twinのバックアップを選んでください。`,
    );
  }

  if (collector.top.count === 0) throw new Error(NO_RECORDS_MESSAGE);
  return { kind: 'records', records: collector.top.toArray() };
}

// ---- 生のJSONファイルの流し読み ----

async function readJsonStream(
  chunks: AsyncGenerator<Uint8Array>,
  totalBytes: number,
  onProgress?: (p: ImportProgress) => void,
): Promise<StreamResult> {
  const collector = new RecordCollector();
  const scanner = new JsonArrayScanner((json) => collector.handle(json));

  // 先頭が '{' なら1つのオブジェクト＝自分のバックアップの可能性。
  // その場合は分割して読めないので全体を溜める
  let mode: 'unknown' | 'array' | 'object' = 'unknown';
  const objectParts: Uint8Array[] = [];
  let objectBytes = 0;
  let bytesRead = 0;
  const pacer = new Pacer();

  for await (const chunk of chunks) {
    bytesRead += chunk.length;
    if (mode === 'unknown') {
      for (const byte of chunk) {
        if (byte === LBRACKET) {
          mode = 'array';
          break;
        }
        if (byte === LBRACE) {
          mode = 'object';
          break;
        }
        // 空白・BOMは読み飛ばす
        if (byte > 0x20 && byte !== 0xef && byte !== 0xbb && byte !== 0xbf) break;
      }
    }
    if (mode === 'object') {
      objectBytes += chunk.length;
      if (objectBytes > MAX_BACKUP_BYTES) {
        throw new Error('ファイルが大きすぎます（300MBまで）。');
      }
      objectParts.push(chunk);
    } else {
      if (bytesRead > MAX_SCAN_BYTES) throw new Error('ファイルが大きすぎます。');
      scanner.push(chunk);
    }
    const read = bytesRead;
    await pacer.breathe(() => onProgress?.({ bytesRead: read, totalBytes, records: collector.top.count }));
  }
  onProgress?.({ bytesRead, totalBytes, records: collector.top.count });

  if (bytesRead === 0) {
    throw new Error('ファイルを読み取れませんでした（0バイト）。もう一度ファイルを選び直してください。');
  }

  if (mode === 'object') {
    const joined = new Uint8Array(objectBytes);
    let offset = 0;
    for (const part of objectParts) {
      joined.set(part, offset);
      offset += part.length;
    }
    const text = strFromU8(joined);
    const backup = asBackupPayload(text);
    if (backup) return { kind: 'backup', backup };
    throw new Error(
      '会話データが見つかりませんでした。ChatGPT/Claudeのエクスポート（conversations.json）か、Memory Twinのバックアップを選んでください。',
    );
  }

  if (!scanner.sawArray) {
    throw new Error('JSONとして読み取れませんでした。エクスポートファイルを選んでください。');
  }
  if (collector.top.count === 0) throw new Error(NO_RECORDS_MESSAGE);
  return { kind: 'records', records: collector.top.toArray() };
}

// ---- 入口 ----

// ネイティブ: 端末のファイルを流し読みする（ZIPでも生JSONでも可）
export async function readExportFile(
  uri: string,
  isZip: boolean,
  totalBytes: number,
  onProgress?: (p: ImportProgress) => void,
): Promise<StreamResult> {
  return isZip
    ? readZipStream(nativeFileChunks(uri, ZIP_CHUNK_SIZE), totalBytes, onProgress)
    : readJsonStream(nativeFileChunks(uri, JSON_CHUNK_SIZE), totalBytes, onProgress);
}

// Web: 読み込み済みのバイト列を流し読みする
export async function readExportBytes(
  bytes: Uint8Array,
  isZip: boolean,
  onProgress?: (p: ImportProgress) => void,
): Promise<StreamResult> {
  return isZip
    ? readZipStream(bytesChunks(bytes, ZIP_CHUNK_SIZE), bytes.length, onProgress)
    : readJsonStream(bytesChunks(bytes, JSON_CHUNK_SIZE), bytes.length, onProgress);
}
