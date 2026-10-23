-- Run after 005. Preserve published history; all current activity stays open.
-- Take a private backup before applying. No submissions, votes or snapshots are deleted.
begin;
do $$
declare r po_rounds; next_id text;
begin
 select rr.* into r from po_rounds rr join po_competitions c on c.current_round_id=rr.id where c.id='prompt-olympics' for update of rr;
 if r.state='RESULTS' then
  next_id := 'always-open-' || r.id;
  insert into po_rounds(id,competition_id,number,title,state,min_votes,strict_codes,booth_mode,allow_self_votes)
   values(next_id,r.competition_id,r.number+1,r.title,'SUBMISSIONS_OPEN',r.min_votes,r.strict_codes,r.booth_mode,r.allow_self_votes);
  update po_competitions set current_round_id=next_id where id=r.competition_id;
 else
  update po_rounds set state='SUBMISSIONS_OPEN' where id=r.id;
 end if;
end $$;
create or replace function public.po_api(action text, payload jsonb default '{}') returns jsonb
language plpgsql set search_path=public as $$
#variable_conflict use_column
declare
 r po_rounds; s po_submissions; v po_votes; j po_jobs; x jsonb; out jsonb; n integer; pid text; target text;
 sid text := payload->>'sessionId'; op text := payload->>'idempotencyKey';
begin
 if action in ('enqueue','vote','redeem','session-end','job','participant-score','participant-retry') then
  -- Serializes reset against accepted submissions and votes for this identity.
  perform pg_advisory_xact_lock(hashtext('participant:'||identity)) from (select distinct unnest(array[sid,coalesce(payload->>'authorId',payload->>'voterId',sid)]) identity order by identity) locks;
  if action <> 'session-end' and exists(select 1 from po_ended_sessions where session_id=sid or (action='vote' and session_id=payload->>'authorId')) then
   return jsonb_build_object('error','This participant session has ended. Start a new participant.','status',403);
  end if;
 end if;
 if action='session-info' then
  return jsonb_build_object('ended',exists(select 1 from po_ended_sessions where session_id=sid));
 end if;
 if action='session-end' then
  select next_id into target from po_ended_sessions where session_id=sid;
  if found then
   if not exists(select 1 from po_ended_sessions where session_id=sid and reset_hash=payload->>'resetHash') then return jsonb_build_object('error','This participant session has ended. Start a new participant.','status',403); end if;
   return jsonb_build_object('nextId',target);
  end if;
  if exists(select 1 from po_jobs where session_id=sid and submission_id is null and status not in ('ready','failed')) then
   return jsonb_build_object('error','Wait for the story to finish saving before starting the next participant.','status',409);
  end if;
  if payload->>'jobId' is not null and not exists(select 1 from po_jobs where id=payload->>'jobId' and session_id=sid) then
   return jsonb_build_object('error','Request not found.','status',404);
  end if;
  if payload->>'voteKey' is not null and not exists(select 1 from po_votes where voter_id=coalesce(payload->>'voterId',sid) and operation_id=payload->>'voteKey') then
   return jsonb_build_object('error','Confirm the pending vote before starting the next participant.','status',409);
  end if;
  insert into po_ended_sessions(session_id,next_id,reset_hash) values(sid,payload->>'nextId',payload->>'resetHash');
  if payload->>'voterId' is not null and payload->>'voterId'<>sid then
   insert into po_ended_sessions(session_id,next_id,reset_hash) values(payload->>'voterId',payload->>'nextId',payload->>'resetHash') on conflict do nothing;
  end if;
  return jsonb_build_object('nextId',payload->>'nextId');
 end if;
 if action='participant-score' then
  select * into s from po_submissions where id=payload->>'submissionId' and not deleted;
  if not found then return jsonb_build_object('error','Story not found.','status',404); end if;
  select * into v from po_votes where submission_id=s.id and voter_id=sid;
  return jsonb_build_object('voted',v.id is not null,'rating',v.rating,'entry',
   (select value from jsonb_array_elements(po_leaderboard(s.round_id)) where value->>'submissionId'=s.id));
 end if;
 if action='participant-retry' then
  select * into j from po_jobs where id=payload->>'jobId' and session_id=sid for update;
  if not found then return jsonb_build_object('error','Request not found.','status',404); end if;
  select * into r from po_rounds where id=j.round_id for share;
  if r.state='RESULTS' or (j.submission_id is null and r.state<>'SUBMISSIONS_OPEN') then
   return jsonb_build_object('error','This round is closed.','status',409);
  end if;
  if j.status='failed' then
   update po_jobs set status=case when submission_id is null then 'queued' else 'judging' end, attempts=0,judge_attempts=0,error=null,lease_until=null,lease_token=null,available_at=now() where id=j.id returning * into j;
   update po_judgements set status='pending' where submission_id=j.submission_id and status='failed';
  end if;
  return po_job_json(j);
 end if;
 if action='admin-session-create' then
  delete from po_admin_sessions where expires_at<now();
  insert into po_admin_sessions values(payload->>'id',to_timestamp((payload->>'expires')::numeric/1000));
  insert into po_audit(actor,action) values(payload->>'id','admin-login'); return '{}'::jsonb;
 elsif action='admin-session-check' then
  return jsonb_build_object('valid',exists(select 1 from po_admin_sessions where id=payload->>'id' and expires_at>now()));
 elsif action='admin-session-delete' then delete from po_admin_sessions where id=payload->>'id'; insert into po_audit(actor,action) values(payload->>'id','admin-logout'); return '{}'::jsonb;
 end if;
 if action='health' then return jsonb_build_object('ok',true,'storageConnected',true,'schemaVersion',6); end if;
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
    'idempotency',(select coalesce(jsonb_agg(t),'[]') from po_idempotency t),'endedSessions',(select coalesce(jsonb_agg(t),'[]') from po_ended_sessions t)) into out;
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
   return jsonb_build_object('id',r.id,'title',r.title,'roundNumber',r.number,'state',r.state,'minVotes',r.min_votes,'strictCodes',r.strict_codes,'boothMode',r.booth_mode,'allowSelfVotes',r.allow_self_votes,
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
   if r.state not in ('SUBMISSIONS_OPEN','SUBMISSIONS_CLOSED','VOTING') then return jsonb_build_object('error','Voting is closed.','status',409); end if;
   if r.strict_codes and not exists(select 1 from po_codes where round_id=r.id and voter_id=sid) then return jsonb_build_object('error','Enter your event voting code first.','status',403); end if;
   select * into s from po_submissions where id=payload->>'submissionId' and round_id=r.id and not deleted;
   if not found then return jsonb_build_object('error','Story not found.','status',404); end if;
   if not r.allow_self_votes and exists(select 1 from po_participants where id=s.participant_id and session_id=coalesce(payload->>'authorId',sid)) then
    return jsonb_build_object('error','Independent voting mode does not allow ratings of your own story.','status',403);
   end if;
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
 elsif action in ('transition','new-round') then
   return jsonb_build_object('error','Submissions and voting are always open. Round changes are not allowed.','status',409);
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
     update po_rounds set min_votes=(payload->>'minVotes')::int,strict_codes=(payload->>'strictCodes')::boolean,booth_mode=coalesce((payload->>'boothMode')::boolean,r.booth_mode),allow_self_votes=coalesce((payload->>'allowSelfVotes')::boolean,r.allow_self_votes) where id=r.id;
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
revoke all on function public.po_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.po_api(text,jsonb) to service_role;
commit;
