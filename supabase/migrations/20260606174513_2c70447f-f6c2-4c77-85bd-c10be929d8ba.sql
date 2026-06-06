
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_session_participant(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_session_host(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_session_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_session_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_host(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_session_by_code(TEXT) TO authenticated;
