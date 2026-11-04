#!/usr/bin/env bash
# Proves a signed-in user cannot promote themselves, raise their limit, write scan
# status, or burn someone else's quota through the public REST API.
#
# Usage:
#   SUPABASE_URL=https://xyz.supabase.co SUPABASE_ANON_KEY=... USER_JWT=... ./scripts/try-role-escalation.sh
# USER_JWT: the access_token of a normal user (browser devtools → Application →
# Cookies → sb-<ref>-auth-token, the access_token field).
set -u
: "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}" "${USER_JWT:?}"
SUB=$(echo "$USER_JWT" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | sed -E 's/.*"sub":"([^"]+)".*/\1/')
H=(-H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" -H "Prefer: return=representation")

echo "== PATCH own role to owner (expect 403 permission denied)"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/profiles?id=eq.$SUB" "${H[@]}" -d '{"role":"owner"}'
echo "== PATCH own daily_scan_limit (expect 403)"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/profiles?id=eq.$SUB" "${H[@]}" -d '{"daily_scan_limit":1000}'
echo "== PATCH own scans to done (expect 403)"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/scans?user_id=eq.$SUB" "${H[@]}" -d '{"status":"done"}'
echo "== consume another user's quota (expect 403 'cannot consume quota for another user')"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/consume_scan_quota" "${H[@]}" -d '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
echo "== read own profile (expect 200, role unchanged)"
curl -s -w "\nHTTP %{http_code}\n" "$SUPABASE_URL/rest/v1/profiles?select=email,role,daily_scan_limit" "${H[@]}"
