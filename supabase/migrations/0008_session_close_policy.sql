-- Sessions schließen: zusätzlich zum Session-Host darf auch der Gruppen-Owner löschen
drop policy "session löschen host" on public.game_sessions;
create policy "session löschen host oder owner" on public.game_sessions
  for delete to authenticated
  using (
    host_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
  );
