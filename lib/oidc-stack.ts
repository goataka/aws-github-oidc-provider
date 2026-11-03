import { CfnOutput, CfnParameter, Fn, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';
const MAIN_BRANCH = 'main';
const CDK_DEPLOY_ROLE_ID = 'GitHubCdkDeployRole';
const CDK_DEPLOY_POLICY = 'AdministratorAccess';
const CDK_DEPLOY_WORKFLOW_DEFAULT = 'cdk-deploy';
const CDK_DEPLOY_ROLE_NAME_PREFIX = 'GitHubActionsCdkDeploy';
const IAM_ROLE_NAME_MAX_LENGTH = 64;
const REPOSITORY_NAME_IN_ROLE_MAX_LENGTH =
  IAM_ROLE_NAME_MAX_LENGTH - CDK_DEPLOY_ROLE_NAME_PREFIX.length - '-'.length;
const REPOSITORY_PATTERN = `^[A-Za-z0-9-]+/[A-Za-z0-9_.-]{1,${REPOSITORY_NAME_IN_ROLE_MAX_LENGTH}}$`;

type GitHubParameters = {
  repository: CfnParameter;
  cdkDeployWorkflow: CfnParameter;
};

function createGitHubParameters(stack: Stack): GitHubParameters {
  return {
    repository: new CfnParameter(stack, 'GitHubRepository', {
      type: 'String',
      allowedPattern: REPOSITORY_PATTERN,
      constraintDescription:
        'Must be OWNER/REPOSITORY using letters, numbers, hyphens, underscores, and periods.',
      description:
        'GitHub repository in OWNER/REPOSITORY format, for example octo-org/example-repo.',
    }),
    cdkDeployWorkflow: new CfnParameter(stack, 'GitHubCdkDeployWorkflow', {
      type: 'String',
      default: CDK_DEPLOY_WORKFLOW_DEFAULT,
      description:
        'Workflow name allowed to assume the CDK deployment role. Use the name: field, not the file name.',
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
    parameters.repository.valueAsString,
    ':workflow:',
    parameters.cdkDeployWorkflow.valueAsString,
    `:ref:refs/heads/${MAIN_BRANCH}`,
  ]);
}

function createCdkDeployRoleName(parameters: GitHubParameters): string {
  const repositoryName = Fn.select(
    1,
    Fn.split('/', parameters.repository.valueAsString),
  );

  return Fn.join('-', [CDK_DEPLOY_ROLE_NAME_PREFIX, repositoryName]);
}

function createCdkDeployRole(
  stack: Stack,
  provider: iam.CfnOIDCProvider,
  parameters: GitHubParameters,
): iam.Role {
  return new iam.Role(stack, CDK_DEPLOY_ROLE_ID, {
    roleName: createCdkDeployRoleName(parameters),
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
