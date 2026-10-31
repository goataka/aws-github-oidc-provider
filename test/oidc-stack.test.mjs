import assert from 'node:assert/strict';
import test from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GitHubOidcStack } from '../lib/oidc-stack.mjs';

const createTemplate = () => {
  const app = new App();
  const stack = new GitHubOidcStack(app, 'TestStack');
  return Template.fromStack(stack).toJSON();
};

test('creates GitHub OIDC provider and workflow-specific roles for main', () => {
  const template = createTemplate();

  const provider = Object.values(template.Resources).find(
    (resource) => resource.Type === 'AWS::IAM::OIDCProvider',
  );
  assert.ok(provider);
  assert.equal(provider.Properties.Url, 'https://token.actions.githubusercontent.com');
  assert.deepEqual(provider.Properties.ClientIdList, ['sts.amazonaws.com']);
  const roles = Object.values(template.Resources).filter(
    (resource) => resource.Type === 'AWS::IAM::Role',
  );
  assert.equal(roles.length, 2);

  const byPolicy = (policy) =>
    roles.find((role) =>
      JSON.stringify(role.Properties.ManagedPolicyArns).includes(policy),
    );
  const readOnlyRole = byPolicy('ReadOnlyAccess');
  const cdkDeployRole = byPolicy('AdministratorAccess');

  assert.ok(readOnlyRole);
  assert.ok(cdkDeployRole);
  assert.deepEqual(
    readOnlyRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
      'token.actions.githubusercontent.com:aud'
    ],
    'sts.amazonaws.com',
  );
  assert.match(
    JSON.stringify(
      readOnlyRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
        'token.actions.githubusercontent.com:sub'
      ],
    ),
    /GitHubReadOnlyWorkflow.*refs\/heads\/main/,
  );
  assert.match(
    JSON.stringify(
      cdkDeployRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals[
        'token.actions.githubusercontent.com:sub'
      ],
    ),
    /GitHubCdkDeployWorkflow.*refs\/heads\/main/,
  );
});

test('sets default workflow names and accepts repository-list parameters', () => {
  const { Parameters } = createTemplate();

  assert.equal(Parameters.GitHubReadOnlyWorkflow.Default, 'copilot-setup');
  assert.equal(Parameters.GitHubCdkDeployWorkflow.Default, 'cdk-deploy');
  assert.equal(Parameters.GitHubRepository1.Type, 'String');
  assert.equal(Parameters.GitHubRepositoryId1.Type, 'String');
  assert.equal(Parameters.GitHubRepository2.Default, '');
  assert.equal(Parameters.GitHubRepositoryId2.Default, '');
});
