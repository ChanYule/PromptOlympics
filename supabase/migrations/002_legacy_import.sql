begin;
create or replace function public.po_import(data jsonb) returns jsonb language plpgsql set search_path=public as $$
declare x jsonb; prev po_idempotency; counts jsonb; source jsonb:=data->'records';
begin
 perform pg_advisory_xact_lock(874103);
 select * into prev from po_idempotency where key='legacy-import';
 if found then
  if prev.digest<>data->>'digest' then raise exception 'A different backup has already been imported'; end if;
  return prev.result;
 end if;
 if exists(select 1 from po_submissions) or exists(select 1 from po_votes) or exists(select 1 from po_jobs) or (select count(*) from po_rounds)>1 or exists(select 1 from po_rounds where state<>'WAITING') then
  raise exception 'Target is occupied. Import refused without overwriting data';
 end if;
 -- Only remove the empty seed. Never change the old JSON table.
 update po_competitions set current_round_id=null where id='prompt-olympics';
 delete from po_rounds where id='initial-round';
 for x in select value from jsonb_array_elements(source->'rounds') loop
  insert into po_rounds(id,competition_id,number,title,state,min_votes,snapshot,legacy,created_at) values(x->>'id',x->>'competition_id',(x->>'number')::int,x->>'title',x->>'state',(x->>'min_votes')::int,nullif(x->'snapshot','null'),x->'legacy',(x->>'created_at')::timestamptz);
 end loop;
 for x in select value from jsonb_array_elements(source->'participants') loop
  insert into po_participants(id,name,session_id,round_id,created_at) values(x->>'id',x->>'name',x->>'session_id',x->>'round_id',(x->>'created_at')::timestamptz);
 end loop;
 for x in select value from jsonb_array_elements(source->'submissions') loop
  insert into po_submissions(id,round_id,participant_id,title,prompt,story,legacy,created_at) values(x->>'id',x->>'round_id',x->>'participant_id',x->>'title',x->>'prompt',x->>'story',x->'legacy',(x->>'created_at')::timestamptz);
 end loop;
 for x in select value from jsonb_array_elements(source->'judgements') loop
  insert into po_judgements(submission_id,status,humour,originality,relevance,overall,model,rubric,legacy) values(x->>'submission_id',x->>'status',(x->>'humour')::numeric,(x->>'originality')::numeric,(x->>'relevance')::numeric,(x->>'overall')::numeric,x->>'model',x->>'rubric',x->'legacy');
 end loop;
 for x in select value from jsonb_array_elements(source->'votes') loop
  insert into po_votes(id,round_id,submission_id,voter_id,rating,operation_id,legacy,created_at) values(x->>'id',x->>'round_id',x->>'submission_id',x->>'voter_id',(x->>'rating')::int,x->>'operation_id',x->'legacy',(x->>'created_at')::timestamptz);
 end loop;
 update po_competitions set current_round_id=data->>'currentRoundId' where id='prompt-olympics';
 counts:=jsonb_build_object('rounds',(select count(*) from po_rounds),'participants',(select count(*) from po_participants),'submissions',(select count(*) from po_submissions),'judgements',(select count(*) from po_judgements),'votes',(select count(*) from po_votes));
 if counts<>data->'counts' then raise exception 'Import counts do not match'; end if;
 insert into po_idempotency(key,digest,result) values('legacy-import',data->>'digest',counts);
 insert into po_audit(actor,action,details) values('migration','legacy-import',counts);
 return counts;
end $$;
revoke all on function public.po_import(jsonb) from public,anon,authenticated;
grant execute on function public.po_import(jsonb) to service_role;
commit;
