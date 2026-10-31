import { Aws, CfnCondition, CfnOutput, CfnParameter, Fn, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

export class GitHubOidcStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const owner = new CfnParameter(this, 'GitHubOwner', {
      type: 'String',
      description: 'GitHub account or organization that owns the repositories.',
    });
    const ownerId = new CfnParameter(this, 'GitHubOwnerId', {
      type: 'String',
      description: 'Immutable numeric GitHub owner ID.',
    });
    const repositories = Array.from({ length: 5 }, (_, index) => {
      const number = index + 1;
      const repository = new CfnParameter(this, `GitHubRepository${number}`, {
        type: 'String',
        ...(index === 0
          ? {}
          : {
              default: '',
              description: `Optional additional repository name ${number}.`,
            }),
        ...(index === 0
          ? { description: 'Repository name 1 owned by GitHubOwner.' }
          : {}),
      });
      const repositoryId = new CfnParameter(this, `GitHubRepositoryId${number}`, {
        type: 'String',
        ...(index === 0
          ? {}
          : {
              default: '',
              description: `Immutable numeric ID for repository ${number}.`,
            }),
        ...(index === 0
          ? {
              description: 'Immutable numeric ID for repository 1.',
            }
          : {}),
      });
      const condition =
        index === 0
          ? undefined
          : new CfnCondition(this, `HasGitHubRepository${number}`, {
              expression: Fn.conditionNot(Fn.conditionEquals(repository.valueAsString, '')),
            });

      return { repository, repositoryId, condition };
    });
    const readOnlyWorkflow = new CfnParameter(this, 'GitHubReadOnlyWorkflow', {
      type: 'String',
      default: 'copilot-setup',
      description: 'Exact GitHub Actions workflow name allowed to assume the read-only role.',
    });
    const cdkDeployWorkflow = new CfnParameter(this, 'GitHubCdkDeployWorkflow', {
      type: 'String',
      default: 'cdk-deploy',
      description: 'Exact GitHub Actions workflow name allowed to assume the CDK deployment role.',
    });

    const provider = new iam.CfnOIDCProvider(this, 'GitHubOidcProvider', {
      url: GITHUB_OIDC_ISSUER,
      clientIdList: ['sts.amazonaws.com'],
    });

    const subForWorkflow = (workflow) =>
      repositories.map(({ repository, repositoryId, condition }) => {
        const subject = Fn.join('', [
          'repo:',
          owner.valueAsString,
          '@',
          ownerId.valueAsString,
          '/',
          repository.valueAsString,
          '@',
          repositoryId.valueAsString,
          ':workflow:',
          workflow.valueAsString,
          ':ref:refs/heads/main',
        ]);
        return condition ? Fn.conditionIf(condition.logicalId, subject, Aws.NO_VALUE) : subject;
      });

    const createRole = (id, name, workflow, policyName) => {
      const role = new iam.Role(this, id, {
        roleName: name,
        assumedBy: new iam.FederatedPrincipal(
          provider.attrArn,
          {
            StringEquals: {
              [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
              [`${GITHUB_OIDC_HOST}:sub`]: subForWorkflow(workflow),
            },
          },
          'sts:AssumeRoleWithWebIdentity',
        ),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName(policyName)],
      });

      return role;
    };

    const readOnlyRole = createRole(
      'GitHubReadOnlyRole',
      'GitHubActionsReadOnly',
      readOnlyWorkflow,
      'ReadOnlyAccess',
    );
    const cdkDeployRole = createRole(
      'GitHubCdkDeployRole',
      'GitHubActionsCdkDeploy',
      cdkDeployWorkflow,
      'AdministratorAccess',
    );

    new CfnOutput(this, 'GitHubReadOnlyRoleArn', {
      value: readOnlyRole.roleArn,
    });
    new CfnOutput(this, 'GitHubCdkDeployRoleArn', {
      value: cdkDeployRole.roleArn,
    });
  }
}
