import { CfnOutput, CfnParameter, Fn, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';
const MAIN_BRANCH = 'main';
const CDK_DEPLOY_ROLE_NAME = 'GitHubActionsCdkDeploy';
const CDK_DEPLOY_ROLE_ID = 'GitHubCdkDeployRole';
const CDK_DEPLOY_POLICY = 'AdministratorAccess';
const CDK_DEPLOY_WORKFLOW_DEFAULT = 'cdk-deploy';

type GitHubParameters = {
  owner: CfnParameter;
  ownerId: CfnParameter;
  repository: CfnParameter;
  repositoryId: CfnParameter;
  cdkDeployWorkflow: CfnParameter;
};

function createGitHubParameters(stack: Stack): GitHubParameters {
  return {
    owner: new CfnParameter(stack, 'GitHubOwner', {
      type: 'String',
      description: 'GitHub account or organization that owns the repository.',
    }),
    ownerId: new CfnParameter(stack, 'GitHubOwnerId', {
      type: 'String',
      description: 'Immutable numeric GitHub owner ID.',
    }),
    repository: new CfnParameter(stack, 'GitHubRepository', {
      type: 'String',
      description: 'GitHub repository name.',
    }),
    repositoryId: new CfnParameter(stack, 'GitHubRepositoryId', {
      type: 'String',
      description: 'Immutable numeric GitHub repository ID.',
    }),
    cdkDeployWorkflow: new CfnParameter(stack, 'GitHubCdkDeployWorkflow', {
      type: 'String',
      default: CDK_DEPLOY_WORKFLOW_DEFAULT,
      description: 'Workflow allowed to assume the CDK deployment role.',
    }),
  };
}

function createOidcProvider(stack: Stack): iam.CfnOIDCProvider {
  return new iam.CfnOIDCProvider(stack, 'GitHubOidcProvider', {
    url: GITHUB_OIDC_ISSUER,
    clientIdList: [GITHUB_OIDC_AUDIENCE],
  });
}

function createSubject(parameters: GitHubParameters): string {
  return Fn.join('', [
    'repo:',
    parameters.owner.valueAsString,
    '@',
    parameters.ownerId.valueAsString,
    '/',
    parameters.repository.valueAsString,
    '@',
    parameters.repositoryId.valueAsString,
    ':workflow:',
    parameters.cdkDeployWorkflow.valueAsString,
    `:ref:refs/heads/${MAIN_BRANCH}`,
  ]);
}

function createCdkDeployRole(
  stack: Stack,
  provider: iam.CfnOIDCProvider,
  parameters: GitHubParameters,
): iam.Role {
  return new iam.Role(stack, CDK_DEPLOY_ROLE_ID, {
    roleName: CDK_DEPLOY_ROLE_NAME,
    assumedBy: new iam.FederatedPrincipal(
      provider.attrArn,
      {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: GITHUB_OIDC_AUDIENCE,
          [`${GITHUB_OIDC_HOST}:sub`]: createSubject(parameters),
        },
      },
      'sts:AssumeRoleWithWebIdentity',
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(CDK_DEPLOY_POLICY),
    ],
  });
}

export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, constructId: string, stackProps?: StackProps) {
    super(scope, constructId, stackProps);

    const parameters = createGitHubParameters(this);
    const provider = createOidcProvider(this);
    const cdkDeployRole = createCdkDeployRole(this, provider, parameters);

    new CfnOutput(this, 'GitHubCdkDeployRoleArn', {
      value: cdkDeployRole.roleArn,
    });
  }
}
