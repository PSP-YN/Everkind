-- Explicit least-privilege boundary: anonymous sessions have no application-table access.
revoke all on public.care_profiles, public.care_members, public.care_invites,
  public.medications, public.medication_doses, public.appointments,
  public.notification_preferences, public.notification_deliveries, public.audit_events
from anon;

-- Membership writes are exclusively performed by authenticated Edge Functions using service_role.
revoke insert,update,delete on public.care_members from authenticated;
revoke all on public.care_invites from authenticated;
revoke all on public.notification_deliveries from authenticated;
revoke insert,update,delete on public.audit_events from authenticated;
