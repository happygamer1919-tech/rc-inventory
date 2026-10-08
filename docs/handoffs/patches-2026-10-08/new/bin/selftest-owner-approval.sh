#!/bin/zsh
# selftest-owner-approval.sh - proves owner_approved (A1 of the 2026-10-07 bug check).
source "${0:A:h}/owner-approval.sh"
tmp=$(mktemp -d); passed=0; failed=0
check() { if [[ $1 == $2 ]]; then (( passed++ )); else (( failed++ )); print "FAIL: $3 (got $1, want $2)"; fi; }
owner_approved 469 "$tmp"; check $? 1 "no approval file -> not merged"
print "Max: OK to merge #458" > "$tmp/q-owner-approve-458.md"
owner_approved 469 "$tmp"; check $? 1 "approval for #458 does not cover #469"
owner_approved 45 "$tmp";  check $? 1 "#458 does not cover #45 (prefix)"
owner_approved 4580 "$tmp"; check $? 1 "#458 does not cover #4580 (suffix guard)"
owner_approved 458 "$tmp"; check $? 0 "matching approval -> merged"
print "approved #469." > "$tmp/q-owner-approve-469.md"
owner_approved 469 "$tmp"; check $? 0 "approval naming #469 -> merged"
print "#470" > "$tmp/other-470.md"
owner_approved 470 "$tmp"; check $? 1 "file outside q-owner-approve-* does not count"
owner_approved "" "$tmp";  check $? 1 "empty pr number refused"
rm -rf "$tmp"
print "passed: $passed failed: $failed"; (( failed == 0 ))
