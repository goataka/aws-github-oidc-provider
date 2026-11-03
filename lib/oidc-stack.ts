import {
  Aws,
  CfnCondition,
  CfnOutput,
  CfnParameter,
  Fn,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';
const MAIN_BRANCH = 'main';
const CDK_DEPLOY_ROLE_ID = 'GitHubCdkDeployRole';
const CDK_DEPLOY_ROLE_NAME_PREFIX = 'GHACdkDeploy';
const CDK_DEPLOY_WORKFLOW_DEFAULT = 'cdk-deploy';
const CDK_DEPLOY_POLICY_NAME = 'CdkDeployAccess';
const CDK_BOOTSTRAP_POLICY_NAME = 'CdkBootstrapAccess';
const CDK_BOOTSTRAP_QUALIFIER_DEFAULT = 'hnb659fds';
const CDK_BOOTSTRAP_QUALIFIER_PATTERN = '^[A-Za-z0-9]{1,10}$';
const CDK_TOOLKIT_STACK_NAME = 'CDKToolkit';
const GITHUB_ENVIRONMENT_PATTERN = '^[A-Za-z0-9._-]*$';
const IAM_ROLE_NAME_MAX_LENGTH = 64;
const REPOSITORY_NAME_IN_ROLE_MAX_LENGTH =
  IAM_ROLE_NAME_MAX_LENGTH - CDK_DEPLOY_ROLE_NAME_PREFIX.length - '-'.length;
const REPOSITORY_PATTERN = `^[A-Za-z0-9-]+/[A-Za-z0-9_.-]{1,${REPOSITORY_NAME_IN_ROLE_MAX_LENGTH}}$`;

type StackParameters = {
  repository: CfnParameter;
  cdkDeployWorkflow: CfnParameter;
  githubEnvironment: CfnParameter;
  cdkBootstrapQualifier: CfnParameter;
};

function createStackParameters(stack: Stack): StackParameters {
  return {
    repository: new CfnParameter(stack, 'GitHubRepository', {
      type: 'String',
      allowedPattern: REPOSITORY_PATTERN,
      constraintDescription:
        'Must be OWNER/REPOSITORY using letters, numbers, hyphens, underscores, and periods.',
      description:
        'GitHub repository in OWNER/REPOSITORY format, for example octo-org/example-repo.',
    }),
    cdkDeployWorkflow: new CfnParameter(stack, 'CdkDeployGitHubWorkflow', {
      type: 'String',
      default: CDK_DEPLOY_WORKFLOW_DEFAULT,
      description:
        'Workflow name allowed to assume the CDK deployment role when GitHubEnvironment is empty. Use the name: field, not the file name.',
    }),
    githubEnvironment: new CfnParameter(stack, 'GitHubEnvironment', {
      type: 'String',
      default: '',
      allowedPattern: GITHUB_ENVIRONMENT_PATTERN,
      constraintDescription:
        'Use letters, numbers, hyphens, underscores, and periods, or leave empty.',
      description:
        'GitHub Environment name. When set, only jobs using this environment can assume the role. When empty, the workflow and main branch are used instead.',
    }),
    cdkBootstrapQualifier: new CfnParameter(stack, 'CdkBootstrapQualifier', {
      type: 'String',
      default: CDK_BOOTSTRAP_QUALIFIER_DEFAULT,
      allowedPattern: CDK_BOOTSTRAP_QUALIFIER_PATTERN,
      constraintDescription: 'Must be 1 to 10 letters or numbers.',
      description:
        'Qualifier used by cdk bootstrap. Must match the --qualifier value used for the target account.',
    }),
  };
}

function createEnvironmentCondition(
  stack: Stack,
  githubEnvironment: CfnParameter,
): CfnCondition {
  return new CfnCondition(stack, 'HasGitHubEnvironment', {
    expression: Fn.conditionNot(
      Fn.conditionEquals(githubEnvironment.valueAsString, ''),
    ),
  });
}

function createOidcProvider(stack: Stack): iam.CfnOIDCProvider {
  return new iam.CfnOIDCProvider(stack, 'GitHubOidcProvider', {
    url: GITHUB_OIDC_ISSUER,
    clientIdList: [GITHUB_OIDC_AUDIENCE],
  });
}

function createWorkflowSubject(parameters: StackParameters): string {
  return Fn.join('', [
    'repo:',
    parameters.repository.valueAsString,
    ':workflow:',
    parameters.cdkDeployWorkflow.valueAsString,
    `:ref:refs/heads/${MAIN_BRANCH}`,
  ]);
}

function createEnvironmentSubject(parameters: StackParameters): string {
  return Fn.join('', [
    'repo:',
    parameters.repository.valueAsString,
    ':environment:',
    parameters.githubEnvironment.valueAsString,
  ]);
}

function createSubject(
  parameters: StackParameters,
  environmentCondition: CfnCondition,
): ReturnType<typeof Fn.conditionIf> {
  return Fn.conditionIf(
    environmentCondition.logicalId,
    createEnvironmentSubject(parameters),
    createWorkflowSubject(parameters),
  );
}

function createCdkDeployRoleName(parameters: StackParameters): string {
  const repositoryName = Fn.select(
    1,
    Fn.split('/', parameters.repository.valueAsString),
  );

  return Fn.join('-', [CDK_DEPLOY_ROLE_NAME_PREFIX, repositoryName]);
}

function createCdkDeployPolicyDocument(qualifier: string): iam.PolicyDocument {
  return new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/cdk-bootstrap/${qualifier}/version`,
        ],
      }),
    ],
  });
}

function createCdkBootstrapPolicyDocument(
  qualifier: string,
): iam.PolicyDocument {
  return new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({
        sid: 'ValidateCloudFormationTemplate',
        actions: ['cloudformation:ValidateTemplate'],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        sid: 'ManageCdkToolkitStack',
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:GetTemplate',
          'cloudformation:CreateChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
        ],
        resources: [
          `arn:${Aws.PARTITION}:cloudformation:${Aws.REGION}:${Aws.ACCOUNT_ID}:stack/${CDK_TOOLKIT_STACK_NAME}/*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ManageCdkIamRoles',
        actions: [
          'iam:CreateRole',
          'iam:GetRole',
          'iam:UpdateAssumeRolePolicy',
          'iam:PutRolePolicy',
          'iam:GetRolePolicy',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:TagRole',
          'iam:UntagRole',
          'iam:ListRolePolicies',
          'iam:ListAttachedRolePolicies',
        ],
        resources: [
          `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ManageCdkAssetBucket',
        actions: [
          's3:CreateBucket',
          's3:GetBucketLocation',
          's3:ListBucket',
          's3:GetBucketPolicy',
          's3:PutBucketPolicy',
          's3:GetBucketVersioning',
          's3:PutBucketVersioning',
          's3:GetEncryptionConfiguration',
          's3:PutEncryptionConfiguration',
          's3:GetBucketPublicAccessBlock',
          's3:PutBucketPublicAccessBlock',
          's3:GetLifecycleConfiguration',
          's3:PutLifecycleConfiguration',
          's3:GetBucketTagging',
          's3:PutBucketTagging',
        ],
        resources: [
          `arn:${Aws.PARTITION}:s3:::cdk-${qualifier}-assets-${Aws.ACCOUNT_ID}-*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ManageCdkContainerRepository',
        actions: [
          'ecr:CreateRepository',
          'ecr:DescribeRepositories',
          'ecr:GetRepositoryPolicy',
          'ecr:SetRepositoryPolicy',
          'ecr:GetLifecyclePolicy',
          'ecr:PutLifecyclePolicy',
          'ecr:PutImageScanningConfiguration',
          'ecr:PutImageTagMutability',
          'ecr:ListTagsForResource',
          'ecr:TagResource',
        ],
        resources: [
          `arn:${Aws.PARTITION}:ecr:${Aws.REGION}:${Aws.ACCOUNT_ID}:repository/cdk-${qualifier}-container-assets-${Aws.ACCOUNT_ID}-*`,
        ],
      }),
      new iam.PolicyStatement({
        sid: 'ManageCdkVersionParameter',
        actions: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:AddTagsToResource'],
        resources: [
          `arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/cdk-bootstrap/${qualifier}/version`,
        ],
      }),
    ],
  });
}

function createCdkDeployRole(
  stack: Stack,
  provider: iam.CfnOIDCProvider,
  parameters: StackParameters,
  environmentCondition: CfnCondition,
): iam.Role {
  const qualifier = parameters.cdkBootstrapQualifier.valueAsString;

  return new iam.Role(stack, CDK_DEPLOY_ROLE_ID, {
    roleName: createCdkDeployRoleName(parameters),
    assumedBy: new iam.FederatedPrincipal(
      provider.attrArn,
      {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: GITHUB_OIDC_AUDIENCE,
          [`${GITHUB_OIDC_HOST}:sub`]: createSubject(
            parameters,
            environmentCondition,
          ),
        },
      },
      'sts:AssumeRoleWithWebIdentity',
    ),
    inlinePolicies: {
      [CDK_DEPLOY_POLICY_NAME]: createCdkDeployPolicyDocument(qualifier),
      [CDK_BOOTSTRAP_POLICY_NAME]: createCdkBootstrapPolicyDocument(qualifier),
    },
  });
}

export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, constructId: string, stackProps?: StackProps) {
    super(scope, constructId, stackProps);

    const parameters = createStackParameters(this);
    const environmentCondition = createEnvironmentCondition(
      this,
      parameters.githubEnvironment,
    );
    const provider = createOidcProvider(this);
    const cdkDeployRole = createCdkDeployRole(
      this,
      provider,
      parameters,
      environmentCondition,
    );

    new CfnOutput(this, 'GHACdkDeployRoleArn', {
      value: cdkDeployRole.roleArn,
    });
  }
}
