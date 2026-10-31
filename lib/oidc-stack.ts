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
const MAX_REPOSITORIES = 5;
const FIRST_REPOSITORY_NUMBER = 1;
const MAIN_BRANCH = 'main';
const READ_ONLY_WORKFLOW_DEFAULT = 'copilot-setup';
const CDK_DEPLOY_WORKFLOW_DEFAULT = 'cdk-deploy';
const READ_ONLY_POLICY = 'ReadOnlyAccess';
const CDK_DEPLOY_POLICY = 'AdministratorAccess';

type RepositoryParameters = {
  repository: CfnParameter;
  repositoryId: CfnParameter;
  condition?: CfnCondition;
};

type RepositoryScopeParameters = {
  owner: CfnParameter;
  ownerId: CfnParameter;
};

type WorkflowParameters = {
  readOnly: CfnParameter;
  cdkDeploy: CfnParameter;
};

type RoleConfiguration = {
  id: string;
  roleName: string;
  workflow: CfnParameter;
  policyName: string;
};

type RoleCreationContext = {
  stack: Stack;
  provider: iam.CfnOIDCProvider;
  repositoryScope: RepositoryScopeParameters;
  repositories: RepositoryParameters[];
};

function createRepositoryParameter(
  stack: Stack,
  parameterName: string,
  description: string,
  optional: boolean,
): CfnParameter {
  return new CfnParameter(stack, parameterName, {
    type: 'String',
    description,
    ...(optional ? { default: '' } : {}),
  });
}

function createRepositoryCondition(
  stack: Stack,
  repository: CfnParameter,
  repositoryNumber: number,
): CfnCondition {
  return new CfnCondition(stack, `HasGitHubRepository${repositoryNumber}`, {
    expression: Fn.conditionNot(
      Fn.conditionEquals(repository.valueAsString, ''),
    ),
  });
}

function createRepositoryParameterSet(
  stack: Stack,
  repositoryNumber: number,
): RepositoryParameters {
  const isOptional = repositoryNumber > FIRST_REPOSITORY_NUMBER;
  const requirement = isOptional ? 'Optional' : 'Required';
  const repository = createRepositoryParameter(
    stack,
    `GitHubRepository${repositoryNumber}`,
    `${requirement} repository name ${repositoryNumber}.`,
    isOptional,
  );
  const repositoryId = createRepositoryParameter(
    stack,
    `GitHubRepositoryId${repositoryNumber}`,
    `Immutable numeric ID for repository ${repositoryNumber}.`,
    isOptional,
  );
  const condition = isOptional
    ? createRepositoryCondition(stack, repository, repositoryNumber)
    : undefined;

  return { repository, repositoryId, condition };
}

function createRepositoryParameters(stack: Stack): RepositoryParameters[] {
  return Array.from({ length: MAX_REPOSITORIES }, (_, repositoryIndex) =>
    createRepositoryParameterSet(
      stack,
      repositoryIndex + FIRST_REPOSITORY_NUMBER,
    ),
  );
}

function createRepositoryScopeParameters(
  stack: Stack,
): RepositoryScopeParameters {
  return {
    owner: new CfnParameter(stack, 'GitHubOwner', {
      type: 'String',
      description: 'GitHub account or organization that owns the repositories.',
    }),
    ownerId: new CfnParameter(stack, 'GitHubOwnerId', {
      type: 'String',
      description: 'Immutable numeric GitHub owner ID.',
    }),
  };
}

function createWorkflowParameter(
  stack: Stack,
  parameterName: string,
  defaultValue: string,
  description: string,
): CfnParameter {
  return new CfnParameter(stack, parameterName, {
    type: 'String',
    default: defaultValue,
    description,
  });
}

function createWorkflowParameters(stack: Stack): WorkflowParameters {
  return {
    readOnly: createWorkflowParameter(
      stack,
      'GitHubReadOnlyWorkflow',
      READ_ONLY_WORKFLOW_DEFAULT,
      'Workflow allowed to assume the read-only role.',
    ),
    cdkDeploy: createWorkflowParameter(
      stack,
      'GitHubCdkDeployWorkflow',
      CDK_DEPLOY_WORKFLOW_DEFAULT,
      'Workflow allowed to assume the CDK deployment role.',
    ),
  };
}

function createOidcProvider(stack: Stack): iam.CfnOIDCProvider {
  return new iam.CfnOIDCProvider(stack, 'GitHubOidcProvider', {
    url: GITHUB_OIDC_ISSUER,
    clientIdList: [GITHUB_OIDC_AUDIENCE],
  });
}

function createSubjects(
  repositoryScope: RepositoryScopeParameters,
  repositories: RepositoryParameters[],
  workflow: CfnParameter,
): (string | ReturnType<typeof Fn.conditionIf>)[] {
  return repositories.map(({ repository, repositoryId, condition }) => {
    const subject = Fn.join('', [
      'repo:',
      repositoryScope.owner.valueAsString,
      '@',
      repositoryScope.ownerId.valueAsString,
      '/',
      repository.valueAsString,
      '@',
      repositoryId.valueAsString,
      ':workflow:',
      workflow.valueAsString,
      `:ref:refs/heads/${MAIN_BRANCH}`,
    ]);

    if (condition) {
      return Fn.conditionIf(condition.logicalId, subject, Aws.NO_VALUE);
    }

    return subject;
  });
}

function createRole(
  context: RoleCreationContext,
  configuration: RoleConfiguration,
): iam.Role {
  const conditions = {
    StringEquals: {
      [`${GITHUB_OIDC_HOST}:aud`]: GITHUB_OIDC_AUDIENCE,
      [`${GITHUB_OIDC_HOST}:sub`]: createSubjects(
        context.repositoryScope,
        context.repositories,
        configuration.workflow,
      ),
    },
  };

  return new iam.Role(context.stack, configuration.id, {
    roleName: configuration.roleName,
    assumedBy: new iam.FederatedPrincipal(
      context.provider.attrArn,
      conditions,
      'sts:AssumeRoleWithWebIdentity',
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(configuration.policyName),
    ],
  });
}

function createRoleConfigurations(
  workflows: WorkflowParameters,
): [RoleConfiguration, RoleConfiguration] {
  return [
    {
      id: 'GitHubReadOnlyRole',
      roleName: 'GitHubActionsReadOnly',
      workflow: workflows.readOnly,
      policyName: READ_ONLY_POLICY,
    },
    {
      id: 'GitHubCdkDeployRole',
      roleName: 'GitHubActionsCdkDeploy',
      workflow: workflows.cdkDeploy,
      policyName: CDK_DEPLOY_POLICY,
    },
  ];
}

function createRoles(
  context: RoleCreationContext,
  workflows: WorkflowParameters,
): [iam.Role, iam.Role] {
  const roleConfigurations = createRoleConfigurations(workflows);
  return roleConfigurations.map((configuration) =>
    createRole(context, configuration),
  ) as [iam.Role, iam.Role];
}

function createRoleOutputs(
  stack: Stack,
  readOnlyRole: iam.Role,
  cdkDeployRole: iam.Role,
): void {
  new CfnOutput(stack, 'GitHubReadOnlyRoleArn', {
    value: readOnlyRole.roleArn,
  });
  new CfnOutput(stack, 'GitHubCdkDeployRoleArn', {
    value: cdkDeployRole.roleArn,
  });
}

export class GitHubOidcStack extends Stack {
  constructor(scope: Construct, constructId: string, stackProps?: StackProps) {
    super(scope, constructId, stackProps);

    const repositoryScope = createRepositoryScopeParameters(this);
    const repositories = createRepositoryParameters(this);
    const workflows = createWorkflowParameters(this);
    const provider = createOidcProvider(this);
    const roleContext: RoleCreationContext = {
      stack: this,
      provider,
      repositoryScope,
      repositories,
    };
    const [readOnlyRole, cdkDeployRole] = createRoles(roleContext, workflows);

    createRoleOutputs(this, readOnlyRole, cdkDeployRole);
  }
}
