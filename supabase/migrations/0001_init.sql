-- Statillion initial schema.
-- All access goes through the server with the service role key.
-- RLS is enabled with no policies so the anon key can read nothing:
-- answers and tiers never reach the client before a run is complete.

create table prompts (
  id uuid primary key default gen_random_uuid(),
  sport text not null,
  prompt_text text not null,
  prompt_type text,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  answer text not null,
  aliases text[] not null default '{}',
  is_person boolean not null default true,
  tier text not null check (tier in
    ('ten_day', 'trick_play', 'role_player', 'all_star', 'hall_of_famer', 'hail_mary')),
  points int not null,
  score numeric,
  quip text,
  unique (prompt_id, answer)
);

create index answers_prompt_idx on answers (prompt_id);

create table daily_sets (
  date date not null,
  position int not null check (position between 1 and 7),
  prompt_id uuid not null references prompts(id),
  primary key (date, position)
);

create table players (
  device_id text primary key,
  created_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references players(device_id),
  date date not null,
  current_position int not null default 1,
  prompt_started_at timestamptz,
  total_points int not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (device_id, date)
);

create index runs_date_idx on runs (date);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  prompt_id uuid not null references prompts(id),
  position int not null,
  guess text not null,
  answer_id uuid references answers(id),
  status text not null check (status in ('scored', 'rejected', 'timeout')),
  tier text,
  points int not null default 0,
  created_at timestamptz not null default now()
);

create index submissions_run_idx on submissions (run_id);
create unique index submissions_one_result_per_position
  on submissions (run_id, position) where status in ('scored', 'timeout');
create index submissions_answer_idx on submissions (answer_id) where answer_id is not null;
create index submissions_prompt_rejected_idx on submissions (prompt_id) where status = 'rejected';

alter table prompts enable row level security;
alter table answers enable row level security;
alter table daily_sets enable row level security;
alter table players enable row level security;
alter table runs enable row level security;
alter table submissions enable row level security;
