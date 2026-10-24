-- Additive to 006. Existing stories, judgements, votes and snapshots are unchanged.
-- Serialize final title allocation across workers; retrying the same ID is harmless.
begin;
create or replace function public.po_unique_story_title() returns trigger
language plpgsql set search_path=public as $$
declare base text; candidate text; suffix text; title_limit integer; attempt integer := 1;
begin
 perform pg_advisory_xact_lock(hashtext('story-title:' || new.round_id));
 if exists(select 1 from po_submissions s where s.id=new.id) then return new; end if;
 base := new.title;
 title_limit := case when base ~ '[一-鿿]' then 12 else 100 end;
 candidate := base;
 while exists(select 1 from po_submissions s where s.round_id=new.round_id and not s.deleted
  and lower(regexp_replace(trim(s.title),'\s+',' ','g'))=lower(regexp_replace(trim(candidate),'\s+',' ','g'))) loop
  attempt := attempt + 1;
  suffix := ' (' || attempt || ')';
  if title_limit=100 then
   base := array_to_string((regexp_split_to_array(trim(new.title),'\s+'))[1:5],' ');
  end if;
  candidate := rtrim(left(base,title_limit-length(suffix))) || suffix;
 end loop;
 new.title := candidate;
 return new;
end $$;
revoke all on function public.po_unique_story_title() from public, anon, authenticated;
drop trigger if exists po_story_title_guard on public.po_submissions;
create trigger po_story_title_guard before insert on public.po_submissions
 for each row execute function public.po_unique_story_title();
commit;
