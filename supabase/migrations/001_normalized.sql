-- Additive migration. The legacy prompt_olympics_state table is never modified.
begin;
create table if not exists public.po_competitions (
 id text primary key, name text not null, current_round_id text, created_at timestamptz not null default now()
);
create table if not exists public.po_rounds (
 id text primary key, competition_id text not null references public.po_competitions(id),
 number integer not null, title text not null, state text not null check(state in ('WAITING','SUBMISSIONS_OPEN','SUBMISSIONS_CLOSED','VOTING','RESULTS')),
 min_votes integer not null default 5 check(min_votes between 1 and 1000), strict_codes boolean not null default false,
 snapshot jsonb, legacy jsonb, created_at timestamptz not null default now(), unique(competition_id,number),
 check(state <> 'RESULTS' or snapshot is not null)
);
create table if not exists public.po_participants (
 id text primary key, name text not null, session_id text not null, round_id text not null references public.po_rounds(id),
 created_at timestamptz not null default now(), unique(round_id,session_id), unique(id,round_id)
);
create table if not exists public.po_submissions (
 id text primary key, round_id text not null references public.po_rounds(id), participant_id text not null references public.po_participants(id),
 title text not null, prompt text not null, story text not null, deleted boolean not null default false,
 legacy jsonb, created_at timestamptz not null default now(), unique(id,round_id),
 foreign key(participant_id,round_id) references public.po_participants(id,round_id)
);
create index if not exists po_submissions_round on public.po_submissions(round_id,created_at,id) where not deleted;
create table if not exists public.po_judgements (
 submission_id text primary key references public.po_submissions(id), status text not null check(status in ('pending','ready','failed')),
 humour numeric, originality numeric, relevance numeric, overall numeric check(overall between 0 and 5),
 model text, rubric text, explanation text, legacy jsonb, updated_at timestamptz not null default now(),
 check(status <> 'ready' or (overall is not null and model is not null and rubric is not null)),
 check(humour is null or humour between 0 and 5), check(originality is null or originality between 0 and 5), check(relevance is null or relevance between 0 and 5)
);
create table if not exists public.po_votes (
 id text primary key, round_id text not null references public.po_rounds(id), submission_id text not null,
 voter_id text not null, rating integer not null check(rating between 1 and 5), operation_id text not null,
 legacy jsonb, created_at timestamptz not null default now(),
 foreign key(submission_id,round_id) references public.po_submissions(id,round_id),
 unique(round_id,submission_id,voter_id), unique(voter_id,operation_id)
);
create index if not exists po_votes_round_submission on public.po_votes(round_id,submission_id) include(rating);
create table if not exists public.po_jobs (
 id text primary key, round_id text not null references public.po_rounds(id), session_id text not null, operation_id text not null,
 input jsonb not null, status text not null check(status in ('queued','generating','saving','judging','ready','failed')),
 attempts integer not null default 0, judge_attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, lease_token text, generated jsonb, submission_id text references public.po_submissions(id), error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(session_id,operation_id)
);
create index if not exists po_jobs_queue on public.po_jobs(available_at,created_at) where status not in ('ready','failed');
create index if not exists po_jobs_round_session on public.po_jobs(round_id,session_id);
create index if not exists po_jobs_daily_budget on public.po_jobs(created_at);
do $$ begin
 alter table public.po_competitions add constraint po_current_round_fk foreign key(current_round_id) references public.po_rounds(id);
exception when duplicate_object then null; end $$;
create table if not exists public.po_idempotency (
 key text primary key, digest text not null, result jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.po_audit (
 id bigint generated always as identity primary key, actor text not null, action text not null, round_id text references public.po_rounds(id),
 details jsonb, created_at timestamptz not null default now()
);
create table if not exists public.po_codes (
 code_hash text primary key, round_id text not null references public.po_rounds(id), voter_id text, redeemed_at timestamptz,
 unique(round_id,voter_id)
);
create table if not exists public.po_limits (
 key text primary key, count integer not null, expires_at timestamptz not null
);
create index if not exists po_limits_expiry on public.po_limits(expires_at);
create table if not exists public.po_admin_sessions (
 id text primary key, expires_at timestamptz not null
);

insert into public.po_competitions(id,name) values('prompt-olympics','Prompt Olympics') on conflict do nothing;
insert into public.po_rounds(id,competition_id,number,title,state)
 select 'initial-round','prompt-olympics',1,'Prompt Olympics','WAITING' where not exists(select 1 from public.po_rounds);
update public.po_competitions set current_round_id='initial-round' where current_round_id is null;

create or replace function public.po_leaderboard(rid text) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(entry order by eligible desc, total desc nulls last, avg desc nulls last, ai desc nulls last, cnt desc, sid collate "C"),'[]'::jsonb)
 from (
 select s.id sid, j.overall ai, v.avg, coalesce(v.cnt,0) cnt,
 j.overall is not null and coalesce(v.cnt,0)>=r.min_votes eligible,
 (j.overall+v.avg)/2 total,
 jsonb_build_object('submissionId',s.id,'participantName',p.name,'title',s.title,'aiScore',j.overall,'averageScore',v.avg,
 'voteCount',coalesce(v.cnt,0),'finalScore',(j.overall+v.avg)/2,
 'eligible',j.overall is not null and coalesce(v.cnt,0)>=r.min_votes,'judgingStatus',coalesce(j.status,'pending')) entry
 from po_submissions s join po_participants p on p.id=s.participant_id join po_rounds r on r.id=s.round_id
 left join po_judgements j on j.submission_id=s.id
 left join (select submission_id,avg(rating::numeric) avg,count(*) cnt from po_votes where round_id=rid group by submission_id) v on v.submission_id=s.id
 where s.round_id=rid and not s.deleted
 ) scores
$$;

create or replace function public.po_job_json(j public.po_jobs) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('id',j.id,'roundId',j.round_id,'status',j.status,'input',j.input,'generated',j.generated,
 'submissionId',j.submission_id,'error',j.error,'attempts',j.attempts,'judgeAttempts',j.judge_attempts,'leaseToken',j.lease_token,
 'submission',case when s.id is null then null else jsonb_build_object('id',s.id,'title',s.title,'prompt',s.prompt,'resultText',s.story,
 'participantName',p.name,'judgingStatus',a.status,'aiScore',case when a.overall is null then null else jsonb_build_object('overall',a.overall,'humour',a.humour,'originality',a.originality,'relevance',a.relevance,'model',a.model,'rubric',a.rubric) end) end)
 from (select 1) x left join po_submissions s on s.id=j.submission_id left join po_participants p on p.id=s.participant_id left join po_judgements a on a.submission_id=s.id
$$;

-- All browser requests pass through Express. Only the service role can execute this function.
create or replace function public.po_api(action text, payload jsonb default '{}') returns jsonb
language plpgsql set search_path=public as $$
#variable_conflict use_column
declare
 r po_rounds; s po_submissions; v po_votes; j po_jobs; x jsonb; out jsonb; n integer; pid text; target text;
 sid text := payload->>'sessionId'; op text := payload->>'idempotencyKey';
begin
 if action='admin-session-create' then
  delete from po_admin_sessions where expires_at<now();
  insert into po_admin_sessions values(payload->>'id',to_timestamp((payload->>'expires')::numeric/1000));
  insert into po_audit(actor,action) values(payload->>'id','admin-login'); return '{}'::jsonb;
 elsif action='admin-session-check' then
  return jsonb_build_object('valid',exists(select 1 from po_admin_sessions where id=payload->>'id' and expires_at>now()));
 elsif action='admin-session-delete' then delete from po_admin_sessions where id=payload->>'id'; insert into po_audit(actor,action) values(payload->>'id','admin-logout'); return '{}'::jsonb;
 end if;
 if action='health' then return jsonb_build_object('ok',true,'storageConnected',true); end if;
 if action='limit' then
   insert into po_limits(key,count,expires_at) values(payload->>'key',1,now()+make_interval(secs=>(payload->>'seconds')::int))
   on conflict(key) do update set count=case when po_limits.expires_at<now() then 1 else po_limits.count+1 end,
    expires_at=case when po_limits.expires_at<now() then excluded.expires_at else po_limits.expires_at end returning count into n;
   if n>(payload->>'max')::int then return jsonb_build_object('error','Please wait a moment before trying again.','status',429); end if;
   delete from po_limits where expires_at<now()-interval '1 hour';
   return '{}'::jsonb;
 end if;
 if action='claim' then
   -- Shared quota and lease scheduling across every app instance.
   perform pg_advisory_xact_lock(874101);
   select count(*) into n from po_jobs where lease_until>now() and status not in ('ready','failed');
   if n>=(payload->>'concurrency')::int then return 'null'::jsonb; end if;
   select * into j from po_jobs where status not in ('ready','failed') and available_at<=now() and (lease_until is null or lease_until<=now()) order by created_at for update skip locked limit 1;
   if not found then return 'null'::jsonb; end if;
   if (j.submission_id is null and j.generated is null and j.attempts>=3) or (j.submission_id is not null and j.judge_attempts>=3) then
     update po_jobs set status='failed',error='The AI service could not finish this request.',lease_until=null where id=j.id;
     update po_judgements set status='failed' where submission_id=j.submission_id and status<>'ready'; return 'null'::jsonb;
   end if;
   update po_jobs set lease_token=payload->>'token',lease_until=now()+make_interval(secs=>(payload->>'leaseSeconds')::int),
    status=case when submission_id is not null then 'judging' when generated is not null then 'saving' else 'generating' end,
    attempts=attempts+case when submission_id is null and generated is null then 1 else 0 end,
    judge_attempts=judge_attempts+case when submission_id is not null then 1 else 0 end,updated_at=now()
    where id=j.id returning * into j;
   return po_job_json(j);
 end if;
 if action in ('generated','save','judged','fail') then
   select * into j from po_jobs where id=payload->>'jobId' for update;
   if not found or j.lease_token is distinct from payload->>'token' or j.lease_until<=now() then return jsonb_build_object('error','Job lease expired.','status',409); end if;
   select * into r from po_rounds where id=j.round_id for share;
   if r.state='RESULTS' then return jsonb_build_object('error','Results are final.','status',409); end if;
   if action='generated' then
     update po_jobs set generated=payload->'generated',status='saving',updated_at=now() where id=j.id returning * into j;
   elsif action='save' then
     if j.generated is null then raise exception 'Missing generation'; end if;
     pid := 'participant-'||md5(j.round_id||':'||j.session_id);
     insert into po_participants(id,name,session_id,round_id) values(pid,j.input->>'participantName',j.session_id,j.round_id) on conflict(round_id,session_id) do nothing;
     insert into po_submissions(id,round_id,participant_id,title,prompt,story) values(j.id,j.round_id,pid,j.generated->>'title',j.input->>'prompt',j.generated->>'text') on conflict do nothing;
     insert into po_judgements(submission_id,status) values(j.id,'pending') on conflict do nothing;
     update po_jobs set submission_id=j.id,status='judging',lease_until=null,lease_token=null,updated_at=now() where id=j.id returning * into j;
   elsif action='judged' then
     x:=payload->'score';
     if not ((x->>'humour')::numeric between 1 and 5 and (x->>'originality')::numeric between 1 and 5 and (x->>'relevance')::numeric between 1 and 5) then raise exception 'Invalid score'; end if;
     update po_judgements set status='ready',humour=(x->>'humour')::numeric,originality=(x->>'originality')::numeric,relevance=(x->>'relevance')::numeric,
      overall=(x->>'humour')::numeric*0.5+(x->>'originality')::numeric*0.25+(x->>'relevance')::numeric*0.25,model=x->>'model',rubric=x->>'rubric',explanation=x->>'explanation',updated_at=now()
      where submission_id=j.submission_id and status<>'ready';
     update po_jobs set status='ready',lease_until=null,lease_token=null,error=null,updated_at=now() where id=j.id returning * into j;
   else
     target:=case when coalesce((payload->>'retryable')::boolean,false) and case when j.submission_id is null then j.attempts else j.judge_attempts end<3 then case when j.submission_id is null then 'queued' else 'judging' end else 'failed' end;
     update po_jobs set status=target,error=payload->>'error',lease_until=null,lease_token=null,available_at=now()+make_interval(secs=>(payload->>'delay')::int),updated_at=now() where id=j.id returning * into j;
     if target='failed' then update po_judgements set status='failed',updated_at=now() where submission_id=j.submission_id and status<>'ready'; end if;
   end if;
   return po_job_json(j);
 end if;
 if action='job' then
   select * into j from po_jobs where session_id=sid and (id=payload->>'jobId' or operation_id=op);
   if not found then return jsonb_build_object('error','Request not found.','status',404); end if;
   return po_job_json(j);
 end if;
 if action in ('export','admin') then
   if action='export' then insert into po_audit(actor,action) values(coalesce(payload->>'actor','server'),'backup-export'); end if;
   select jsonb_build_object('schemaVersion',2,'competitions',(select coalesce(jsonb_agg(c),'[]') from po_competitions c),
    'rounds',(select coalesce(jsonb_agg(t),'[]') from po_rounds t),'participants',(select coalesce(jsonb_agg(t),'[]') from po_participants t),
    'submissions',(select coalesce(jsonb_agg(t),'[]') from po_submissions t),'judgements',(select coalesce(jsonb_agg(t),'[]') from po_judgements t),
    'votes',(select coalesce(jsonb_agg(t),'[]') from po_votes t),'jobs',(select coalesce(jsonb_agg(t),'[]') from po_jobs t),
    'audit',(select coalesce(jsonb_agg(t),'[]') from po_audit t),'codes',(select coalesce(jsonb_agg(t),'[]') from po_codes t),
    'idempotency',(select coalesce(jsonb_agg(t),'[]') from po_idempotency t)) into out;
   return out;
 end if;
 if action='enqueue' then
   perform pg_advisory_xact_lock(874102);
   select * into j from po_jobs where session_id=sid and operation_id=op;
   if found then
     if j.input<>payload->'input' then return jsonb_build_object('error','This request key belongs to another story idea.','status',409); end if;
     return po_job_json(j);
   end if;
 end if;
 -- SHARE locks let votes for different stories proceed concurrently. State changes use UPDATE locks.
 if action in ('transition','new-round','delete','retry-judge','judge-historical','settings','codes') then
   select rr.* into r from po_rounds rr join po_competitions c on rr.id=c.current_round_id where c.id='prompt-olympics' for update of rr;
 else
   select rr.* into r from po_rounds rr join po_competitions c on rr.id=c.current_round_id where c.id='prompt-olympics' for share of rr;
 end if;
 if action='competition' then
   return jsonb_build_object('id',r.id,'title',r.title,'roundNumber',r.number,'state',r.state,'minVotes',r.min_votes,'strictCodes',r.strict_codes,
    'verified',exists(select 1 from po_codes where round_id=r.id and voter_id=sid));
 elsif action='leaderboard' then
   if payload->>'roundId' is not null then select * into r from po_rounds where id=payload->>'roundId'; end if;
   if not found then return jsonb_build_object('error','Round not found.','status',404); end if;
   return jsonb_build_object('round',jsonb_build_object('id',r.id,'title',r.title,'roundNumber',r.number,'state',r.state,'minVotes',r.min_votes),
    'entries',coalesce(r.snapshot,po_leaderboard(r.id)),'final',r.state='RESULTS');
 elsif action='stories' then
   select coalesce(jsonb_agg(entry),'[]') into out from (
     select jsonb_build_object('id',s.id,'title',s.title,'participantName',p.name,'prompt',s.prompt,'resultText',s.story,
      'own',p.session_id=sid,'voted',v.id is not null,'rating',v.rating) entry
     from po_submissions s join po_participants p on p.id=s.participant_id
     left join po_votes v on v.submission_id=s.id and v.voter_id=sid
     where s.round_id=r.id and not s.deleted order by (v.id is not null),md5(s.id||sid)
     limit 20 offset least(100000,greatest(0,coalesce((payload->>'offset')::int,0)))
   ) list;
   return jsonb_build_object('items',out,'hasMore',jsonb_array_length(out)=20);
 elsif action='vote' then
   perform pg_advisory_xact_lock(hashtext(sid));
   select * into v from po_votes where voter_id=sid and operation_id=op;
   if found then
     if v.submission_id<>payload->>'submissionId' or v.rating<>(payload->>'rating')::int then return jsonb_build_object('error','This request key belongs to another vote.','status',409); end if;
     return jsonb_build_object('id',v.id,'submissionId',v.submission_id,'rating',v.rating,'recorded',true);
   end if;
   if r.state<>'VOTING' then return jsonb_build_object('error','Voting is closed.','status',409); end if;
   if r.strict_codes and not exists(select 1 from po_codes where round_id=r.id and voter_id=sid) then return jsonb_build_object('error','Enter your event voting code first.','status',403); end if;
   select * into s from po_submissions where id=payload->>'submissionId' and round_id=r.id and not deleted;
   if not found then return jsonb_build_object('error','Story not found.','status',404); end if;
   if exists(select 1 from po_participants where id=s.participant_id and session_id=sid) then return jsonb_build_object('error','You cannot vote for your own story.','status',403); end if;
   insert into po_votes(id,round_id,submission_id,voter_id,rating,operation_id) values(payload->>'id',r.id,s.id,sid,(payload->>'rating')::int,op) returning * into v;
   return jsonb_build_object('id',v.id,'submissionId',s.id,'rating',v.rating,'recorded',true);
 elsif action='enqueue' then
   if r.state<>'SUBMISSIONS_OPEN' then return jsonb_build_object('error','Story submissions are closed.','status',409); end if;
   select count(*) into n from po_jobs where status not in ('ready','failed');
   if n>=(payload->>'maxQueue')::int then return jsonb_build_object('error','Many stories are being created. Please try again shortly.','status',429); end if;
   select count(*) into n from po_jobs where session_id=sid and round_id=r.id;
   if n>=(payload->>'maxPerParticipant')::int then return jsonb_build_object('error','You have reached the story limit for this round.','status',429); end if;
   select count(*) into n from po_jobs where created_at>=date_trunc('day',now());
   if n>=(payload->>'dailyBudget')::int then return jsonb_build_object('error','Today’s story allowance is used. Please contact an organiser.','status',429); end if;
   insert into po_jobs(id,round_id,session_id,operation_id,input,status) values(payload->>'id',r.id,sid,op,payload->'input','queued') returning * into j;
   return po_job_json(j);
 elsif action='redeem' then
   update po_codes set voter_id=sid,redeemed_at=now() where round_id=r.id and code_hash=payload->>'codeHash' and (voter_id is null or voter_id=sid);
   if not found then return jsonb_build_object('error','That code is invalid or already used.','status',403); end if;
   return jsonb_build_object('verified',true);
 elsif action='transition' then
   target:=payload->>'state';
   if not ((r.state='WAITING' and target='SUBMISSIONS_OPEN') or (r.state='SUBMISSIONS_OPEN' and target='SUBMISSIONS_CLOSED') or
    (r.state='SUBMISSIONS_CLOSED' and target='VOTING') or (r.state='VOTING' and target in ('SUBMISSIONS_CLOSED','RESULTS'))) then
    return jsonb_build_object('error','This round change is not allowed.','status',409);
   end if;
   if target='RESULTS' then
     if exists(select 1 from po_jobs where round_id=r.id and status not in ('ready','failed')) or exists(select 1 from po_submissions s left join po_judgements j on j.submission_id=s.id where s.round_id=r.id and not s.deleted and j.overall is null) then
      return jsonb_build_object('error','Resolve pending or failed AI judging before publishing.','status',409);
     end if;
     update po_rounds set snapshot=po_leaderboard(r.id) where id=r.id;
   end if;
   update po_rounds set state=target where id=r.id;
 elsif action='new-round' then
   if r.state<>'RESULTS' then return jsonb_build_object('error','Publish current results before starting a new round.','status',409); end if;
   insert into po_rounds(id,competition_id,number,title,state) values(payload->>'id',r.competition_id,r.number+1,payload->>'title','WAITING');
   update po_competitions set current_round_id=payload->>'id' where id=r.competition_id;
 elsif action in ('delete','retry-judge','judge-historical','settings','codes') then
   if r.state='RESULTS' then return jsonb_build_object('error','Published results are immutable. Start a new round.','status',409); end if;
   if action='delete' then
     update po_submissions set deleted=true where id=payload->>'submissionId' and round_id=r.id;
     if not found then return jsonb_build_object('error','Story not found.','status',404); end if;
   elsif action='retry-judge' then
     update po_jobs set status='judging',judge_attempts=0,error=null,lease_until=null,available_at=now() where submission_id=payload->>'submissionId' and round_id=r.id and status='failed';
     if not found then return jsonb_build_object('error','Only failed judging can be retried.','status',409); end if;
     update po_judgements set status='pending' where submission_id=payload->>'submissionId' and status='failed';
   elsif action='judge-historical' then
     select * into s from po_submissions where id=payload->>'submissionId' and round_id=r.id and not deleted and legacy is not null;
     if not found or exists(select 1 from po_judgements where submission_id=s.id and overall is not null) or exists(select 1 from po_jobs where submission_id=s.id) then
      return jsonb_build_object('error','Only an unscored historical story can be judged through this action.','status',409);
     end if;
     insert into po_jobs(id,round_id,session_id,operation_id,input,status,submission_id)
      select 'historical-judge-'||s.id,r.id,p.session_id,'historical-judge-'||s.id,jsonb_build_object('participantName',p.name,'prompt',s.prompt),'judging',s.id from po_participants p where p.id=s.participant_id;
   elsif action='settings' then
     if r.state='VOTING' then return jsonb_build_object('error','Close voting before changing rules.','status',409); end if;
     update po_rounds set min_votes=(payload->>'minVotes')::int,strict_codes=(payload->>'strictCodes')::boolean where id=r.id;
   else
     for x in select value from jsonb_array_elements(payload->'hashes') loop insert into po_codes(code_hash,round_id) values(x#>>'{}',r.id); end loop;
   end if;
 else return jsonb_build_object('error','Unknown operation.','status',400);
 end if;
 insert into po_audit(actor,action,round_id,details) values(payload->>'actor',action,r.id,payload-'hashes'-'actor');
 return jsonb_build_object('ok',true);
exception
 when unique_violation then return jsonb_build_object('error','This vote or request has already been recorded.','status',409);
 when check_violation or invalid_text_representation or not_null_violation then return jsonb_build_object('error','Invalid request data.','status',400);
end;
$$;

do $$ declare t text; begin
 foreach t in array array['po_competitions','po_rounds','po_participants','po_submissions','po_judgements','po_votes','po_jobs','po_idempotency','po_audit','po_codes','po_limits','po_admin_sessions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.po_audit_id_seq to service_role;
revoke all on function public.po_api(text,jsonb), public.po_leaderboard(text), public.po_job_json(public.po_jobs) from public,anon,authenticated;
grant execute on function public.po_api(text,jsonb), public.po_leaderboard(text), public.po_job_json(public.po_jobs) to service_role;
commit;
