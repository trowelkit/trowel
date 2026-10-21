#!/usr/bin/env bash
# End-to-end check of the starter template. Run `pnpm dev` in packages/create-trowel/template
# first, then run this script. Set APP_DIR and BASE to check a scaffolded app instead.
set -u
BASE=${BASE:-http://localhost:5173}
APP_DIR=${APP_DIR:-"$(cd "$(dirname "$0")/../template" && pwd)"}
TOKEN=$(cat "$APP_DIR/.void/dev-trigger-token")
JARS=$(mktemp -d)
RUN=$(date +%s)
PASSWORD=example-password-123
fails=0

pass() { echo "PASS  $1"; }
# json FORMAT ARGS... -> a JSON body. Single-quoted formats keep bash from re-parsing the quotes.
json() { local format=$1; shift; printf "$format" "$@"; }
fail() { echo "FAIL  $1"; fails=$((fails+1)); }

# auth WHO PATH BODY -> status of a Better Auth endpoint, keeping WHO's cookies.
auth() {
  curl -s -b "$JARS/$1" -c "$JARS/$1" -H "Origin: $BASE" -H 'content-type: application/json' \
    -d "$3" "$BASE/api/auth/$2" -o /dev/null -w '%{http_code}'
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

# redirect WHO PATH -> where a full page load of PATH redirects to.
redirect() {
  local args=(-s -o /dev/null -w '%{redirect_url}')
  [ "$1" != guest ] && args+=(-b "$JARS/$1")
  curl "${args[@]}" "$BASE$2"
}

expect() { # DESCRIPTION EXPECTED RESULT
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

# mail TO SUBJECT -> the newest message to TO with SUBJECT, as raw MIME. Waits for it to arrive.
mail() {
  local row id
  for _ in $(seq 1 20); do
    row=$(curl -s -H "x-void-dev-trigger: $TOKEN" "$BASE/__void/inbox" | tr -d '\n' | sed 's/<tr>/\n<tr>/g' |
      grep -F "$1" | grep -F "$2" | head -1)
    id=$(grep -o '/__void/inbox/[^"/?]*/raw' <<<"$row" | head -1)
    # MIME lines end in CRLF; drop the CR so links can be used as they are.
    if [ -n "$id" ]; then curl -s -H "x-void-dev-trigger: $TOKEN" "$BASE$id" | tr -d '\r'; return; fi
    sleep 0.5
  done
}

link_in() { grep -o "$BASE/api/auth/[^ <\"]*" <<<"$1" | head -1; }

ann="ann$RUN"; ben="ben$RUN"; ann_email="ann-$RUN@example.com"; ben_email="ben-$RUN@example.com"

# --- Accounts ---------------------------------------------------------------
contains "the home page renders for guests" "$(curl -s "$BASE/")" 'Sign up'
expect   "ann signs up" 200 "$(auth "$ann" sign-up/email "$(json '{"name":"%s","email":"%s","password":"%s","callbackURL":"/"}' "$ann" "$ann_email" "$PASSWORD")")"
expect   "ben signs up" 200 "$(auth "$ben" sign-up/email "$(json '{"name":"%s","email":"%s","password":"%s","callbackURL":"/"}' "$ben" "$ben_email" "$PASSWORD")")"
contains "the layout knows who is signed in" "$(page "$ann" GET /)" "\"name\":\"$ann\""
contains "signed-in users skip the sign-in page" "$(redirect "$ann" /sign-in)" "$BASE/"
contains "guests are sent to sign in from settings" "$(redirect guest /settings)" "/sign-in"

contains "ann can't post before verifying her email" "$(page "$ann" GET /)" '"canCreate":false'
expect   "and the server refuses it too" 403 "$(page "$ann" POST / '{"title":"Too early"}')"

for who in ann ben; do
  email_var="${who}_email"; name_var=$who
  verification=$(mail "${!email_var}" "Verify your email address")
  link=$(link_in "$verification")
  [ -n "$link" ] && pass "$who gets a verification email" || fail "$who gets a verification email"
  curl -s -o /dev/null -b "$JARS/${!name_var}" -c "$JARS/${!name_var}" "$link"
done
contains "verifying unlocks posting" "$(page "$ann" GET /)" '"canCreate":true'
contains "and the session knows" "$(page "$ann" GET /)" '"emailVerified":true'

# --- Posts and policies -----------------------------------------------------
expect   "guests can't create posts"         401 "$(page guest POST / '{"title":"Nope"}')"
contains "titles are validated"              "$(page "$ann" POST / '{"title":""}')" '"errors":{"title":"Give your post a title."}'

created=$(page "$ann" POST / "$(json '{"title":"Hello %s","body":"First post"}' "$RUN")")
id=$(sed -nE 's#^[0-9]+ [^ ]*/posts/([0-9]+).*#\1#p' <<<"$created")
[ -n "$id" ] && pass "ann creates a draft and is sent to it (post $id)" || fail "ann creates a draft: $created"

expect "guests can't see the draft"          403 "$(page guest GET "/posts/$id")"
expect "ben can't see the draft"             403 "$(page "$ben" GET "/posts/$id")"
expect "ben can't publish it"                403 "$(page "$ben" POST "/posts/$id?publish")"
expect "ben deleting it gets a 404"          404 "$(page "$ben" POST "/posts/$id?delete")"
contains "ann may publish and delete it"     "$(page "$ann" GET "/posts/$id")" '"can":{"publish":true,"delete":true}'

contains "ann publishes it"                  "$(page "$ann" POST "/posts/$id?publish")" "/posts/$id"
expect   "guests can read it now"            200 "$(page guest GET "/posts/$id")"
expect   "it can't be published twice"       403 "$(page "$ann" POST "/posts/$id?publish")"

# --- Events and notifications -----------------------------------------------
eventually "ann gets an in-app notification" "$ann" /notifications "\"title\":\"Hello $RUN\""
contains   "the layout counts it as unread"  "$(page "$ann" GET /)" '"unreadNotifications":1'
contains   "ann is mailed about it"          "$(mail "$ann_email" "Hello $RUN")" "is now published"
page "$ann" POST /notifications > /dev/null
contains "marking them read clears the count" "$(page "$ann" GET /)" '"unreadNotifications":0'

# --- Rate limiting: five new posts per user per minute; ann has used one ----
for i in 2 3 4 5; do
  contains "ann's post $i is within the limit" "$(page "$ann" POST / "$(json '{"title":"More %s"}' "$i")")" "/posts/"
done
limited=$(curl -s -D - -o /dev/null -X POST -b "$JARS/$ann" -H "Origin: $BASE" -H 'X-VoidPages: true' \
  -H 'Accept: application/json' -H 'content-type: application/json' -d '{"title":"Too many"}' "$BASE/" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
contains "the sixth post is rate limited"    "$limited" " 429"
contains "with Retry-After"                  "$limited" "retry-after: "
contains "ben still has his own limit"       "$(page "$ben" POST / '{"title":"Ben post"}')" "/posts/"

# --- Settings ---------------------------------------------------------------
expect   "ann renames herself"               200 "$(auth "$ann" update-user '{"name":"Ann Renamed"}')"
contains "the new name shows up"             "$(page "$ann" GET /)" '"name":"Ann Renamed"'
expect   "a wrong current password is refused" 400 "$(auth "$ann" change-password '{"currentPassword":"wrong-password","newPassword":"changed-password-1"}')"
expect   "ann changes her password"          200 "$(auth "$ann" change-password "$(json '{"currentPassword":"%s","newPassword":"changed-password-1","revokeOtherSessions":true}' "$PASSWORD")")"
expect   "the old password stops working"    401 "$(auth "$ann-check" sign-in/email "$(json '{"email":"%s","password":"%s"}' "$ann_email" "$PASSWORD")")"
expect   "the new one works"                 200 "$(auth "$ann" sign-in/email "$(json '{"email":"%s","password":"changed-password-1"}' "$ann_email")")"

# --- Forgot password ---------------------------------------------------------
expect   "ben asks for a reset link"         200 "$(auth guest request-password-reset "$(json '{"email":"%s","redirectTo":"/reset-password"}' "$ben_email")")"
expect   "unknown addresses get the same answer" 200 "$(auth guest request-password-reset "$(json '{"email":"nobody-%s@example.com","redirectTo":"/reset-password"}' "$RUN")")"
reset_link=$(link_in "$(mail "$ben_email" "Reset your password")")
landing=$(curl -s -o /dev/null -w '%{redirect_url}' "$reset_link")
contains "the link leads to the reset page"  "$landing" "/reset-password?token="
reset_token=${landing##*token=}
contains "the reset page gets the token"     "$(page guest GET "/reset-password?token=$reset_token")" "\"token\":\"$reset_token\""
expect   "ben sets a new password"           200 "$(auth guest reset-password "$(json '{"newPassword":"reset-password-1","token":"%s"}' "$reset_token")")"
contains "his old session is signed out"     "$(page "$ben" GET /)" '"user":null'
expect   "the reset link works only once"    400 "$(auth guest reset-password "$(json '{"newPassword":"another-password","token":"%s"}' "$reset_token")")"
expect   "ben signs in with the new password" 200 "$(auth "$ben" sign-in/email "$(json '{"email":"%s","password":"reset-password-1"}' "$ben_email")")"

# --- Deleting an account -----------------------------------------------------
expect   "a wrong password doesn't delete the account" 400 "$(auth "$ann" delete-user '{"password":"wrong-password"}')"
expect   "ann deletes her account"           200 "$(auth "$ann" delete-user '{"password":"changed-password-1"}')"
expect   "her posts are gone with it"        404 "$(page guest GET "/posts/$id")"
expect   "and she can't sign in"             401 "$(auth "$ann-check" sign-in/email "$(json '{"email":"%s","password":"changed-password-1"}' "$ann_email")")"

echo
[ "$fails" -eq 0 ] && echo "ALL PASSED" || echo "$fails FAILED"
rm -rf "$JARS"
[ "$fails" -eq 0 ]
