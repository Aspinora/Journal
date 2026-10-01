/* Shared public configuration for every Journals page.
 *
 * The Supabase URL and PUBLISHABLE (anon) key are meant to be visible in the
 * browser: every visitor's browser needs them to reach Supabase, and access is
 * enforced server-side by row-level security and SECURITY DEFINER functions.
 * This is the ONLY place they live; change them here and every page follows.
 *
 * NEVER put a service_role key, R2/storage credentials or any other secret in
 * this file or in any HTML file. Those belong in Edge Function secrets.
 */
window.JOURNAL_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://txrtxienudcwpywfnqtj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_IynOGfqeFgK0-orZTt5c5Q_gkG1aFJy'
});
