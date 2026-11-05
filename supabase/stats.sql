-- 통계 대시보드용 집계 함수 (Supabase SQL Editor 에서 실행)
-- judgments 원본은 계속 비공개. 이 함수는 집계 숫자만 돌려줌.

create or replace function public.judgment_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total',     count(*),
    'avg_score', coalesce(round(avg(score)), 0),
    'safe',      count(*) filter (where level = 'safe'),
    'warn',      count(*) filter (where level = 'warn'),
    'danger',    count(*) filter (where level = 'danger'),
    'crimes',    (
      select coalesce(json_object_agg(c, n), '{}'::json)
      from (
        select c, count(*) as n
        from public.judgments, unnest(crimes) as c
        group by c
      ) t
    )
  )
  from public.judgments;
$$;

revoke all on function public.judgment_stats() from public;
grant execute on function public.judgment_stats() to anon, authenticated;

-- 테스트로 들어간 행 정리 (처음 한 번만. 필요 없으면 이 줄은 지워도 됨)
delete from public.judgments;
