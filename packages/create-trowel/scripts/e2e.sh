#!/usr/bin/env bash
# End-to-end check of the starter template. Run `pnpm dev` in packages/create-trowel/template
# first, then run this script. Set APP_DIR and BASE to check a scaffolded app instead.
set -u
BASE=${BASE:-http://localhost:5173}
APP_DIR=${APP_DIR:-"$(cd "$(dirname "$0")/../template" && pwd)"}
TOKEN=$(cat "$APP_DIR/.void/dev-trigger-token")
JARS=$(mktemp -d)
RUN=$(date +%s)
fails=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails+1)); }

signup() { # NAME EMAIL
  local code; code=$(curl -s -c "$JARS/$1" -H "Origin: $BASE" -H 'content-type: application/json' \
    -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"example-password-123\"}" \
    "$BASE/api/auth/sign-up/email" -o /dev/null -w '%{http_code}')
  echo "sign up $1: $code"
}

# page WHO METHOD PATH [BODY] -> "status location body". Talks to pages the way Void's client does.
page() {
  local who=$1 method=$2 path=$3 body=${4:-}
  local args=(-s -X "$method" -H "Origin: $BASE" -H 'X-VoidPages: true' -H 'Accept: application/json')
  [ "$who" != guest ] && args+=(-b "$JARS/$who")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
  local out; out=$(curl "${args[@]}" -w '\n%{http_code} %{redirect_url}' "$BASE$path")
  local meta=${out##*$'\n'}
  echo "$meta ${out%$'\n'*}"
}

expect() { # DESCRIPTION EXPECTED-STATUS RESULT
  local code=${3%% *}
  if [ "$code" = "$2" ]; then pass "$1 ($code)"; else fail "$1: expected $2, got ${3:0:300}"; fi
}

contains() { # DESCRIPTION HAYSTACK NEEDLE
  if [[ "$2" == *"$3"* ]]; then pass "$1"; else fail "$1: no $3 in ${2:0:300}"; fi
}

eventually() { # DESCRIPTION WHO PATH NEEDLE
  local result
  for _ in $(seq 1 20); do
    result=$(page "$2" GET "$3")
    if [[ "$result" == *"$4"* ]]; then pass "$1"; return; fi
    sleep 0.5
  done
  fail "$1: no $4 in ${result:0:300}"
}

ann="ann$RUN"; ben="ben$RUN"
signup "$ann" "ann-$RUN@example.com"
signup "$ben" "ben-$RUN@example.com"

contains "the home page renders for guests" "$(curl -s "$BASE/")" 'Sign in'
contains "the layout knows who is signed in" "$(page "$ann" GET /)" "\"name\":\"$ann\""
expect   "guests can't create posts"         401 "$(page guest POST / '{"title":"Nope"}')"
contains "titles are validated"              "$(page "$ann" POST / '{"title":""}')" '"errors":{"title":"Give your post a title."}'

created=$(page "$ann" POST / "{\"title\":\"Hello $RUN\",\"body\":\"First post\"}")
id=$(sed -nE 's#^[0-9]+ [^ ]*/posts/([0-9]+).*#\1#p' <<<"$created")
[ -n "$id" ] && pass "ann creates a draft and is sent to it (post $id)" || fail "ann creates a draft: $created"

expect "guests can't see the draft"          403 "$(page guest GET "/posts/$id")"
expect "ben can't see the draft"             403 "$(page "$ben" GET "/posts/$id")"
expect "ben can't publish it"                403 "$(page "$ben" POST "/posts/$id?publish")"
expect "ben deleting it gets a 404"          404 "$(page "$ben" POST "/posts/$id?delete")"
contains "ann may publish and delete it"     "$(page "$ann" GET "/posts/$id")" '"can":{"publish":true,"delete":true}'

published=$(page "$ann" POST "/posts/$id?publish")
contains "ann publishes it"                  "$published" "/posts/$id"
expect   "guests can read it now"            200 "$(page guest GET "/posts/$id")"
expect   "it can't be published twice"       403 "$(page "$ann" POST "/posts/$id?publish")"

# PostPublished has a queued listener that sends ann a notification by mail and in the app.
eventually "ann gets an in-app notification" "$ann" /notifications "\"title\":\"Hello $RUN\""
contains   "the layout counts it as unread"  "$(page "$ann" GET /)" '"unreadNotifications":1'
inbox=""
for _ in $(seq 1 20); do
  inbox=$(curl -s -H "x-void-dev-trigger: $TOKEN" "$BASE/__void/inbox" | grep -F -A2 "Hello $RUN")
  [ -n "$inbox" ] && break; sleep 0.5
done
contains "ann is mailed through the dev inbox" "$inbox" "ann-$RUN@example.com"
page "$ann" POST /notifications > /dev/null
contains "marking them read clears the count" "$(page "$ann" GET /)" '"unreadNotifications":0'

# Five new posts per user per minute; ann has used one.
for i in 2 3 4 5; do
  contains "ann's post $i is within the limit" "$(page "$ann" POST / "{\"title\":\"More $i\"}")" "/posts/"
done
limited=$(curl -s -D - -o /dev/null -X POST -b "$JARS/$ann" -H "Origin: $BASE" -H 'X-VoidPages: true' \
  -H 'Accept: application/json' -H 'content-type: application/json' -d '{"title":"Too many"}' "$BASE/" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
contains "the sixth post is rate limited"    "$limited" " 429"
contains "with Retry-After"                  "$limited" "retry-after: "
contains "ben still has his own limit"       "$(page "$ben" POST / '{"title":"Ben post"}')" "/posts/"

contains "ann deletes her post"              "$(page "$ann" POST "/posts/$id?delete")" " $BASE/"
expect   "it is gone"                        404 "$(page "$ann" GET "/posts/$id")"

echo
[ "$fails" -eq 0 ] && echo "ALL PASSED" || echo "$fails FAILED"
rm -rf "$JARS"
[ "$fails" -eq 0 ]
