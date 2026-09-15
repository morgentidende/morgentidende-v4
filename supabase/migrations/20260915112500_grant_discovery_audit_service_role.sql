grant execute on function public.ingest_github_discovery_audit_payload(jsonb) to service_role;
grant execute on function public.record_discovery_candidate_audit(text,jsonb,uuid,text) to service_role;
