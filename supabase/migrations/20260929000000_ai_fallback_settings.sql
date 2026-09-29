-- Phase 12: optional AI fallback settings toggle.
-- null = off (default); 'gemini' | 'ollama' selects the provider. Off by default, per-user.

alter table public.user_settings
  add column ai_provider text
    check (ai_provider is null or ai_provider in ('gemini', 'ollama'));
