-- クラウドバックアップの悪用対策(2026-07-12)
-- SupabaseのSQLエディタでこのファイル全体を実行する。
-- 内容: 端末IDごとの1日あたり回数制限 + ストレージ全体の容量保険。
-- 旧関数(制限なし)を廃止して置き換えるため、アプリ側(cloud-backup.ts)の
-- device引数付き呼び出しとセットで反映すること。

-- 端末ごとの操作回数記録(7日より古い行は自動掃除)
create table if not exists backup_ops (
  device text not null,
  op text not null,
  day date not null default (now() at time zone 'utc')::date,
  count int not null default 1,
  primary key (device, op, day)
);
alter table backup_ops enable row level security;
revoke all on table backup_ops from anon, authenticated;

-- 回数カウント用ヘルパー(anonからは直接呼べない)
create or replace function bump_backup_op(p_device text, p_op text)
returns int
language plpgsql
as $fn$
declare n int;
begin
  delete from backup_ops where day < (now() at time zone 'utc')::date - 7;
  insert into backup_ops as b (device, op) values (p_device, p_op)
    on conflict (device, op, day) do update set count = b.count + 1
    returning b.count into n;
  return n;
end;
$fn$;
revoke execute on function bump_backup_op(text, text) from public, anon, authenticated;

-- 旧シグネチャ(制限なし)は廃止
drop function if exists put_backup(text, text);
drop function if exists get_backup(text);

create or replace function put_backup(backup_id text, payload text, device text)
returns void
language plpgsql
security definer
set search_path = public
as $put$
declare
  total bigint;
begin
  if backup_id !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid backup id';
  end if;
  if payload is null or length(payload) < 32 or length(payload) > 4194304 then
    raise exception 'invalid payload size';
  end if;
  if device is null or length(device) < 8 or length(device) > 64 then
    raise exception 'invalid device';
  end if;
  -- 1端末1日5回まで
  if bump_backup_op(device, 'put') > 5 then
    raise exception 'rate limit exceeded';
  end if;
  -- 全体容量の保険(約300MB)。通常の利用では届かない
  select coalesce(sum(length(cb.payload)), 0) into total from cloud_backups cb;
  if total > 300000000 then
    raise exception 'storage full';
  end if;
  insert into cloud_backups (id, payload, updated_at)
    values (backup_id, put_backup.payload, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = now();
end;
$put$;

create or replace function get_backup(backup_id text, device text)
returns text
language plpgsql
security definer
set search_path = public
as $get$
declare
  result text;
begin
  if backup_id !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid backup id';
  end if;
  if device is null or length(device) < 8 or length(device) > 64 then
    raise exception 'invalid device';
  end if;
  -- 1端末1日20回まで(復元の再試行には十分)
  if bump_backup_op(device, 'get') > 20 then
    raise exception 'rate limit exceeded';
  end if;
  select cb.payload into result from cloud_backups cb where cb.id = backup_id;
  return result;
end;
$get$;

-- 削除(アプリ内アカウント削除フロー用・2026-07-14追加)。
-- 本人が合言葉から導出したIDの塊だけを消せる。中身はゼロ知識だが「明示的に消す」導線を提供する(Apple 5.1.1(v))。
create or replace function delete_backup(backup_id text, device text)
returns void
language plpgsql
security definer
set search_path = public
as $del$
begin
  if backup_id !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid backup id';
  end if;
  if device is null or length(device) < 8 or length(device) > 64 then
    raise exception 'invalid device';
  end if;
  -- 1端末1日20回まで(削除の再試行に十分)
  if bump_backup_op(device, 'del') > 20 then
    raise exception 'rate limit exceeded';
  end if;
  delete from cloud_backups cb where cb.id = backup_id;
end;
$del$;

grant execute on function put_backup(text, text, text) to anon;
grant execute on function get_backup(text, text) to anon;
grant execute on function delete_backup(text, text) to anon;
