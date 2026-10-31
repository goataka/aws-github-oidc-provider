execute_tests() (
  local -r test_functions=("$@")
  local test_function

  for test_function in "${test_functions[@]}"; do
    if "${test_function}"; then
      printf 'PASS %s\n' "${test_function}"
    else
      printf 'FAIL %s\n' "${test_function}" >&2
      return 1
    fi
  done
)

execute_parametrized_test() (
  local -r test_function="${1:?test function is required}"
  shift

  if (( $# % 2 != 0 )); then
    printf 'Expected parameter and value pairs for %s\n' "${test_function}" >&2
    return 2
  fi

  local parameter_name
  local expected_value
  while (( $# > 0 )); do
    parameter_name="${1:?parameter name is required}"
    expected_value="${2:?expected value is required}"
    shift 2

    if "${test_function}" "${parameter_name}" "${expected_value}"; then
      printf 'PASS %s %s\n' "${test_function}" "${parameter_name}"
    else
      printf 'FAIL %s %s\n' "${test_function}" "${parameter_name}" >&2
      return 1
    fi
  done
)
