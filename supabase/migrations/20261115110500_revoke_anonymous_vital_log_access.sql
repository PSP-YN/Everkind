revoke all on public.vital_logs from anon;
grant select, insert on public.vital_logs to authenticated;
revoke update, delete, truncate, references, trigger on public.vital_logs from anon, authenticated;
