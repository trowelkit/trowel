#!/usr/bin/env bash
# End-to-end check of the example. Start `pnpm dev` first, then run this script.
set -u
BASE=http://localhost:5173
JARS=$(mktemp -d)
# The dev inbox needs the token that `pnpm dev` writes here.
TOKEN=$(cat "$(dirname "$0")/../.void/dev-trigger-token")
RUN=$(date +%s)
ORIGIN="Origin: $BASE"
fails=0

signup() { # name email; signs in instead when the user exists from an earlier run
  local body="{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"example-password-123\"}"
  local code; code=$(curl -s -c "$JARS/$1" -H "$ORIGIN" -H 'content-type: application/json' \
    -d "$body" "$BASE/api/auth/sign-up/email" -o /dev/null -w '%{http_code}')
  if [ "$code" != 200 ]; then
    code=$(curl -s -c "$JARS/$1" -H "$ORIGIN" -H 'content-type: application/json' \
      -d "$body" "$BASE/api/auth/sign-in/email" -o /dev/null -w '%{http_code}')
    echo "sign in $1: $code"
  else
    echo "sign up $1: $code"
  fi
}

# req WHO METHOD PATH [BODY] -> prints "status body"
req() {
  local who=$1 method=$2 path=$3 body=${4:-}
  local jar=()
  [ "$who" != guest ] && jar=(-b "$JARS/$who")
  local args=(-s -X "$method" ${jar[@]+"${jar[@]}"} -H "$ORIGIN" -w '\n%{http_code}')
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}" "$BASE$path")
  local code=${out##*$'\n'}; local text=${out%$'\n'*}
  echo "$code $text"
}

# eventually DESCRIPTION WHO PATH PATTERN: polls until the response body contains PATTERN.
eventually() {
  local desc=$1 who=$2 path=$3 pattern=$4 result
  for _ in $(seq 1 20); do
    result=$(req "$who" GET "$path")
    if [[ "$result" == *"$pattern"* ]]; then echo "PASS  $desc"; return; fi
    sleep 0.5
  done
  echo "FAIL  $desc: $pattern not found in $result"; fails=$((fails+1))
}

# absent DESCRIPTION WHO PATH PATTERN: the response body must not contain PATTERN.
absent() {
  local desc=$1 result; result=$(req "$2" GET "$3")
  if [[ "$result" != *"$4"* ]]; then echo "PASS  $desc"
  else echo "FAIL  $desc: found $4 in $result"; fails=$((fails+1)); fi
}

# in_inbox DESCRIPTION SUBJECT RECIPIENT: polls Void's dev inbox until a message with SUBJECT
# shows up, then checks its recipient (the inbox lists From and To after the subject).
in_inbox() {
  local row
  for _ in $(seq 1 20); do
    row=$(curl -s -H "x-void-dev-trigger: $TOKEN" "$BASE/__void/inbox" | grep -F -A2 "$2")
    if [ -n "$row" ]; then
      if [[ "$row" == *"$3"* ]]; then echo "PASS  $1"
      else echo "FAIL  $1: the message isn't addressed to $3: $row"; fails=$((fails+1)); fi
      return
    fi
    sleep 0.5
  done
  echo "FAIL  $1: \"$2\" is not in the dev inbox"; fails=$((fails+1))
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
pub=$(req alice POST /api/posts "{\"title\":\"Alice published $RUN\",\"published\":true}"); echo "alice creates published → $pub"
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
# Publishing dispatches PostPublished. Its listener is queued, so it runs from queues/events.ts.
eventually "queued listener recorded the published post" admin /api/admin/activity "\"postId\":$pub_id,"
# Publishing also notifies the author by mail and in the app, through queues/notifications.ts.
in_inbox "the author was mailed through the dev inbox" "Your post is live: Alice published $RUN" "&lt;alice@example.com&gt;"
eventually "the author has an unread notification" alice /api/notifications "\"title\":\"Alice published $RUN\""
absent "other users don't see it"                  bob /api/notifications "Alice published $RUN"
check "guests have no notifications (401)"         401 guest GET /api/notifications
check "the author marks them as read"              200 alice POST /api/notifications/read '{}'
eventually "nothing is unread afterwards"          alice /api/notifications '"unread":0,'
check "publishing a draft"                         200 alice PATCH "/api/posts/$draft_id" '{"published":true}'
eventually "queued listener recorded the newly published draft" admin /api/admin/activity "\"postId\":$draft_id,"
check "unpublish the draft again"                  200 alice PATCH "/api/posts/$draft_id" '{"published":false}'
check "list for guest shows only published"        200 guest GET /api/posts
check "list for alice shows her draft too"         200 alice GET /api/posts
check "alice can delete her draft"                 204 alice DELETE "/api/posts/$draft_id"
check "deleted post is gone"                       404 alice GET "/api/posts/$draft_id"

echo
[ "$fails" -eq 0 ] && echo "ALL PASSED" || echo "$fails FAILED"
rm -rf "$JARS"
