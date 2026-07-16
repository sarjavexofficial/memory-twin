-- Pro無料体験（7日間）の「1アカウント1回」をサーバーで厳格に記録するテーブルとRPC。
-- 実行方法: Supabaseダッシュボード → SQL Editor → このファイルの中身を貼り付けて Run。
--
-- 設計（cloud-backup-hardening.sql と同じ思想）:
--   - アプリはアカウントIDそのものではなく、一方向ハッシュ（SHA-256・64文字hex）だけを送る。
--     ハッシュから元のアカウントは特定できない
--   - テーブルはRLS有効・ポリシー無し = anonキーでの直接読み書きは一切不可。
--     唯一の入り口は claim_trial 関数（security definer）
--   - 同じ account_hash での2回目以降の呼び出しは granted=false と既存の期限を返すだけ。
--     再インストール・端末変更・データ削除では絶対に再付与されない
--   - 体験の途中で再インストールした場合、アプリは返ってきた期限までの残り日数を復元する

create table if not exists trial_claims (
  account_hash text primary key,
  claimed_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  device text
);

alter table trial_claims enable row level security;

create or replace function claim_trial(account_hash text, device text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_ends timestamptz;
  ends timestamptz;
begin
  -- SHA-256のhex（64文字）以外は受け付けない
  if account_hash is null or length(account_hash) <> 64 then
    raise exception 'invalid request';
  end if;

  select t.trial_ends_at into existing_ends
    from trial_claims t
   where t.account_hash = claim_trial.account_hash;

  if found then
    -- すでに請求済み: 再付与はしない。既存の期限だけ返す（途中再インストールの復元用）
    return json_build_object('granted', false, 'trial_ends_at', existing_ends);
  end if;

  ends := now() + interval '7 days';
  insert into trial_claims (account_hash, trial_ends_at, device)
  values (claim_trial.account_hash, ends, left(coalesce(claim_trial.device, ''), 64));

  return json_build_object('granted', true, 'trial_ends_at', ends);
end;
$$;

revoke all on function claim_trial(text, text) from public;
grant execute on function claim_trial(text, text) to anon, authenticated;
