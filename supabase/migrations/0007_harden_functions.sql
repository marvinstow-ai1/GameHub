-- Hardening: SECURITY-DEFINER-Funktionen nur für eingeloggte User,
-- Trigger-Funktion für niemanden direkt aufrufbar.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.get_random_content(text, int) from anon, public;
revoke execute on function public.join_group_by_token(text) from anon, public;
revoke execute on function public.record_results(uuid, uuid[]) from anon, public;
revoke execute on function public.is_group_member(uuid) from anon, public;
revoke execute on function public.is_session_member(uuid) from anon, public;
