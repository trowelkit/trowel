#!/usr/bin/env bash
# End-to-end check of @trowelkit/policies. Start `pnpm dev` first, then run this script.
set -u
BASE=http://localhost:5173
JARS=$(mktemp -d)
ORIGIN="Origin: $BASE"
fails=0

signup() { # name email
  curl -s -c "$JARS/$1" -H "$ORIGIN" -H 'content-type: application/json' \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"example-password-123\"}" \
    "$BASE/api/auth/sign-up/email" -o /dev/null -w "signup $1: %{http_code}\n"
}

# req WHO METHOD PATH [BODY] -> prints "status body"
req() {
  local who=$1 method=$2 path=$3 body=${4:-}
  local jar=()
  [ "$who" != guest ] && jar=(-b "$JARS/$who")
  local args=(-s -X "$method" "${jar[@]}" -H "$ORIGIN" -w '\n%{http_code}')
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}" "$BASE$path")
  local code=${out##*$'\n'}; local text=${out%$'\n'*}
  echo "$code $text"
}

check() { # description expected-status WHO METHOD PATH [BODY]
  local desc=$1 expected=$2; shift 2
  local result; result=$(req "$@")
  local code=${result%% *}
  if [ "$code" = "$expected" ]; then echo "PASS  $desc → $result"
  else echo "FAIL  $desc: expected $expected, got $result"; fails=$((fails+1)); fi
}

signup alice alice@example.com
signup bob bob@example.com
signup admin admin@example.com

check "guest can't create a post (401)"            401 guest POST /api/posts '{"title":"nope"}'
draft=$(req alice POST /api/posts '{"title":"Alice draft"}'); echo "alice creates draft → $draft"
pub=$(req alice POST /api/posts '{"title":"Alice published","published":true}'); echo "alice creates published → $pub"
draft_id=$(echo "$draft" | sed -E 's/.*"id":([0-9]+).*/\1/')
pub_id=$(echo "$pub" | sed -E 's/.*"id":([0-9]+).*/\1/')

check "guest can view a published post"            200 guest GET "/api/posts/$pub_id"
check "guest can't view a draft (guest() runs the check, which denies)" 403 guest GET "/api/posts/$draft_id"
check "bob can't view alice's draft"               403 bob GET "/api/posts/$draft_id"
check "alice can view her draft"                   200 alice GET "/api/posts/$draft_id"
check "bob can't update alice's post"              403 bob PATCH "/api/posts/$pub_id" '{"title":"hacked"}'
check "alice can update her post"                  200 alice PATCH "/api/posts/$pub_id" '{"title":"Edited"}'
check "bob deleting alice's post gets 404"         404 bob DELETE "/api/posts/$draft_id"
check "admin can view alice's draft (before hook)" 200 admin GET "/api/posts/$draft_id"
check "bob can't see stats (middleware)"           403 bob GET /api/admin/stats
check "guest can't see stats (middleware)"         401 guest GET /api/admin/stats
check "admin sees stats"                           200 admin GET /api/admin/stats
check "list for guest shows only published"        200 guest GET /api/posts
check "list for alice shows her draft too"         200 alice GET /api/posts
check "alice can delete her draft"                 204 alice DELETE "/api/posts/$draft_id"
check "deleted post is gone"                       404 alice GET "/api/posts/$draft_id"

echo
[ "$fails" -eq 0 ] && echo "ALL PASSED" || echo "$fails FAILED"
rm -rf "$JARS"
