-- ============================================================
-- こだま（Echoes）用 Supabase セットアップSQL
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行する
--
-- 設計方針（セキュリティ）:
--   - 匿名ユーザー(anon)ができるのは「投稿」と「非表示でないものの閲覧」だけ
--   - UPDATE / DELETE のポリシーは一切作らない = 他人の投稿の改ざん・削除は不可能
--   - 反応・通報はRPC関数(security definer)経由でのみ実行できる
--   - 通報が3件たまった投稿は自動で非表示になる（運営が後から確認）
-- ============================================================

create table if not exists public.echoes (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now(),
  reaction_count integer not null default 0,
  report_count integer not null default 0,
  hidden boolean not null default false
);

alter table public.echoes enable row level security;

-- 閲覧: 非表示でない投稿だけ読める
drop policy if exists "read visible echoes" on public.echoes;
create policy "read visible echoes" on public.echoes
  for select using (hidden = false);

-- 投稿: 本文のみ指定可能。カウンタや非表示フラグを操作した投稿は拒否
drop policy if exists "insert echoes" on public.echoes;
create policy "insert echoes" on public.echoes
  for insert with check (
    reaction_count = 0 and report_count = 0 and hidden = false
  );

-- UPDATE / DELETE のポリシーは作らない（= anonからは一切不可）

-- 反応（いいね）: hidden でない投稿のカウントを1増やすことしかできない
create or replace function public.react_echo(echo_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.echoes
  set reaction_count = reaction_count + 1
  where id = echo_id and hidden = false;
$$;

-- 通報: カウントを1増やし、3件以上で自動的に非表示にする
create or replace function public.report_echo(echo_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.echoes
  set report_count = report_count + 1,
      hidden = hidden or (report_count + 1 >= 3)
  where id = echo_id;
$$;

grant execute on function public.react_echo(uuid) to anon;
grant execute on function public.report_echo(uuid) to anon;

-- ============================================================
-- 自分の投稿の削除（匿名のまま「本人だけ」が消せる仕組み）
--   - 投稿時にアプリが削除トークンを添え、端末内にだけ対応表を保存
--   - delete_token列は匿名ユーザーから読めないようにする（他人のトークンを盗んで削除できない）
--   - トークンが一致した場合のみRPCが削除を実行
-- ============================================================

alter table public.echoes add column if not exists delete_token text;

-- 列単位の読み取り制限: delete_token だけ読めなくする
revoke select on table public.echoes from anon, authenticated;
grant select (id, text, created_at, reaction_count, report_count, hidden)
  on table public.echoes to anon, authenticated;

create or replace function public.delete_echo(echo_id uuid, token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.echoes
  where id = echo_id and delete_token is not null and delete_token = token;
$$;

grant execute on function public.delete_echo(uuid, text) to anon;

-- 補足:
--   - 1日1回の共有制限と内容フィルタ（連絡先・危険ワード）はアプリ側(community.ts)で実施済み
--   - 本格運用で荒らし対策を強めるなら、投稿をEdge Function経由にしてレート制限を追加する
