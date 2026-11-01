#!/usr/bin/env bash
set -euo pipefail

validate_template() (
  local -r generated_template="${1:?generated template path is required}"

  jq -e '
    .Resources | type == "object" and
    has("GitHubOidcProvider") and
    ([to_entries[] | select(.value.Type == "AWS::IAM::Role")] | length == 2)
  ' "${generated_template}" >/dev/null
)

stage_template() (
  local -r source_directory="${1:?source directory is required}"
  local -r generated_template="${2:?generated template path is required}"

  cp -- "${generated_template}" "${source_directory}/template.json"
  git -C "${source_directory}" add -- template.json
)

commit_template() (
  local -r source_directory="${1:?source directory is required}"

  git -C "${source_directory}" config user.name "github-actions[bot]"
  git -C "${source_directory}" config user.email \
    "41898282+github-actions[bot]@users.noreply.github.com"
  git -C "${source_directory}" commit \
    -m "Update synthesized CloudFormation template"
)

push_template() (
  local -r source_directory="${1:?source directory is required}"
  local -r source_branch="${2:?source branch is required}"

  git check-ref-format "refs/heads/${source_branch}"
  git -C "${source_directory}" push origin \
    "HEAD:refs/heads/${source_branch}"
)

main() (
  local -r source_branch="${1:?source branch is required}"
  local -r generated_template="${2:?generated template path is required}"
  local -r source_directory="${3:?source directory is required}"
  local -r workflow_output="${4:?workflow output path is required}"

  validate_template "${generated_template}"
  stage_template "${source_directory}" "${generated_template}"

  if git -C "${source_directory}" diff --cached --quiet -- template.json; then
    printf 'changed=false\n' >> "${workflow_output}"
    return
  fi

  commit_template "${source_directory}"
  push_template "${source_directory}" "${source_branch}"
  printf 'changed=true\n' >> "${workflow_output}"
)

main "$@"
