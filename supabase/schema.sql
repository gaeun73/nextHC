-- 악플각도기 Supabase 스키마 (Supabase 대시보드 > SQL Editor 에서 실행)

-- 1) 판례 (누구나 읽기만 가능)
create table if not exists public.precedents (
  id text primary key,          -- 예: '2020도5813'
  short text not null,
  point text not null
);

-- 2) 판독 익명 통계 (누구나 insert만 가능, 읽기 불가). 대화 원문·닉네임은 저장하지 않음
create table if not exists public.judgments (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  score int not null check (score between 0 and 180),
  level text not null check (level in ('safe','warn','danger')),
  crimes text[] not null default '{}',
  place text check (place in ('public','group','dm')),
  identity text check (identity in ('real','known','stranger','none')),
  context text check (context in ('oneway','fight','mutual')),
  freq text check (freq in ('once','many'))
);

alter table public.precedents enable row level security;
alter table public.judgments enable row level security;

drop policy if exists "precedents_read" on public.precedents;
create policy "precedents_read" on public.precedents
  for select to anon, authenticated using (true);

drop policy if exists "judgments_insert" on public.judgments;
create policy "judgments_insert" on public.judgments
  for insert to anon, authenticated with check (true);

-- 판례 초기 데이터
insert into public.precedents (id, short, point) values
 ('2020도5813','대법 2020도5813 전합','1:1 등 특정 소수에게 한 말은 공연성(불특정 다수가 인식할 수 있는 상태)이 부정될 유력한 사정이 됩니다.'),
 ('2021도15122','대법 2021도15122','1:1 대화 등 특정 소수를 상대로 한 발언의 공연성을 부정한 취지의 판결입니다.'),
 ('2015도2229','대법 2015도2229','다툼 중 일시적 감정으로 한 욕설은 모욕으로 보기 어렵다고 본 취지의 판결입니다.'),
 ('2024도2131','대법 2024도2131','일시적 감정 표현에 가까운 욕설은 모욕성이 부정될 수 있다고 본 취지의 판결입니다.'),
 ('2023도15984','대법 2023도15984','다툼과 무관하게 상대(가족 포함)를 대상으로 한 성적인 말을 통신으로 반복해 보낸 경우 통신매체이용음란죄가 성립할 수 있다고 본 취지의 판결입니다.'),
 ('2023도17539','대법 2023도17539','다툼 중 분노 표출로 섞인 성적 욕설은 ''성적 욕망을 유발·만족시킬 목적''이 부정된다고 보아 무죄 취지로 판단한 판결입니다.')
on conflict (id) do update set short = excluded.short, point = excluded.point;
