#!/usr/bin/env bash
set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/test_helper.sh"

oidc_resources_test() (
  node --input-type=commonjs -e '
    const assert = require("node:assert/strict");
    const template = require(require("node:path").resolve(process.argv[1]));
    const resources = Object.values(template.Resources);
    const providers = resources.filter(
      (resource) => resource.Type === "AWS::IAM::OIDCProvider",
    );
    const roles = resources.filter(
      (resource) => resource.Type === "AWS::IAM::Role",
    );

    assert.equal(providers.length, 1);
    assert.equal(
      providers[0].Properties.Url,
      "https://token.actions.githubusercontent.com",
    );
    assert.deepEqual(
      providers[0].Properties.ClientIdList,
      ["sts.amazonaws.com"],
    );
    assert.equal(roles.length, 2);

    const roleWithPolicy = (policyName) =>
      roles.find((role) =>
        JSON.stringify(role.Properties.ManagedPolicyArns).includes(policyName),
      );
    const readOnlyRole = roleWithPolicy("ReadOnlyAccess");
    const cdkDeployRole = roleWithPolicy("AdministratorAccess");
    assert.ok(readOnlyRole);
    assert.ok(cdkDeployRole);

    assertTrustPolicy(readOnlyRole, "GitHubReadOnlyWorkflow");
    assertTrustPolicy(cdkDeployRole, "GitHubCdkDeployWorkflow");

    function assertTrustPolicy(role, workflowParameter) {
      const statement = role.Properties.AssumeRolePolicyDocument.Statement[0];
      const conditions = statement.Condition.StringEquals;

      assert.equal(statement.Action, "sts:AssumeRoleWithWebIdentity");
      assert.equal(
        conditions["token.actions.githubusercontent.com:aud"],
        "sts.amazonaws.com",
      );
      assert.match(
        JSON.stringify(conditions["token.actions.githubusercontent.com:sub"]),
        new RegExp(`${workflowParameter}.*refs/heads/main`),
      );
    }
  ' template.json
)

workflow_default_test() (
  local -r parameter_name="${1:?parameter name is required}"
  local -r expected_value="${2:?expected value is required}"

  node --input-type=commonjs -e '
    const assert = require("node:assert/strict");
    const template = require(require("node:path").resolve(process.argv[1]));
    const [parameterName, expectedValue] = process.argv.slice(2);
    assert.equal(template.Parameters[parameterName].Default, expectedValue);
  ' template.json "${parameter_name}" "${expected_value}"
)

repository_slots_test() (
  node --input-type=commonjs -e '
    const assert = require("node:assert/strict");
    const template = require(require("node:path").resolve(process.argv[1]));

    assert.equal(template.Parameters.GitHubRepository1.Type, "String");
    assert.equal(template.Parameters.GitHubRepositoryId1.Type, "String");
    assert.equal(template.Parameters.GitHubRepository2.Default, "");
    assert.equal(template.Parameters.GitHubRepositoryId2.Default, "");
    assert.equal(
      template.Conditions.HasGitHubRepository2["Fn::Not"][0]["Fn::Equals"][1],
      "",
    );
  ' template.json
)

main() (
  cd -- "$(git rev-parse --show-toplevel)"
  corepack pnpm synth
  execute_tests oidc_resources_test repository_slots_test
  execute_parametrized_test workflow_default_test \
    GitHubReadOnlyWorkflow copilot-setup \
    GitHubCdkDeployWorkflow cdk-deploy
)

main "$@"
