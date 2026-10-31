# AWS GitHub OIDC provider

AWS CDK project that synthesizes a CloudFormation template for GitHub Actions
OIDC access. The stack creates the GitHub OIDC provider and two roles:

- `GitHubActionsReadOnly` with the AWS managed `ReadOnlyAccess` policy.
- `GitHubActionsCdkDeploy` with the AWS managed `AdministratorAccess` policy,
  which permits CDK deployments. Review whether this level of access is
  appropriate for your account.

Both roles are restricted to the `main` branch, the configured workflow name,
and the configured repositories. The workflow parameters default to
`copilot-setup` and `cdk-deploy`.

## GitHub OIDC subject setup

AWS supports GitHub's `aud` and `sub` claims, but not custom OIDC claims as
separate IAM condition keys. To restrict each role to its own workflow, the
GitHub `sub` claim must be customized before using this template. Configure the
repository or organization OIDC subject template to include these claims in
this order:

```json
{
  "include_claim_keys": ["repo", "workflow", "ref"]
}
```

Opt the repository in to its organization's template if required. The
resulting subject must have this format:

```text
repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:workflow:WORKFLOW_NAME:ref:refs/heads/main
```

GitHub includes owner and repository IDs in the `repo` segment for immutable
subject claims. Supply IDs matching the repository names and order below.
Set the workflow's `name` to the configured value (not merely its file name).
Jobs must run from `main` and must not use a GitHub environment, which changes
the subject format. Each workflow also needs `permissions: id-token: write` to
request an OIDC token.

## Synthesize and deploy

Use the account and region configured in the current AWS environment. Install
dependencies and generate the checked-in CloudFormation template with pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm synth
```

`pnpm synth` updates `template.json`; include this generated artifact in pull
requests when changing the CDK application.

Deploy with the repository owner, numeric owner ID, repository name, and its
numeric repository ID:

```sh
pnpm exec cdk deploy \
  --parameters GitHubOwner=OWNER \
  --parameters GitHubOwnerId=OWNER_ID \
  --parameters GitHubRepository1=REPOSITORY \
  --parameters GitHubRepositoryId1=REPOSITORY_ID
```

The template supports up to five repositories. For each additional repository,
pass its name and matching ID as `GitHubRepository2` / `GitHubRepositoryId2`,
and so on through slot 5. Unused slots default to empty. To change the allowed
workflow names, pass `GitHubReadOnlyWorkflow` and/or `GitHubCdkDeployWorkflow`
as stack parameters. The generated `template.json` can also be deployed
directly with CloudFormation.
