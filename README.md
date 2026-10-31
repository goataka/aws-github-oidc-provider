# AWS GitHub OIDC プロバイダー

## 概要

- AWS CDKでGitHub Actions用のOIDCプロバイダーとIAMロールを作成します。
- `template.json`はCloudFormation CLIから利用できる生成済みテンプレートです。
- ロール：
  - `GitHubActionsReadOnly`：AWS管理ポリシー`ReadOnlyAccess`
  - `GitHubActionsCdkDeploy`：AWS管理ポリシー`AdministratorAccess`
- 両ロールは指定したWorkflow、リポジトリ、`main`ブランチに制限されます。
- Workflowの既定値：ReadOnlyは`copilot-setup`、CDKデプロイは`cdk-deploy`

## GitHub OIDCの設定

AWS IAMはGitHubのOIDC `aud`と`sub`クレームを使用します。
詳細：[GitHub OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
Workflow単位に制限するには、GitHubのOIDC subjectテンプレートに次の
クレームをこの順序で設定してください。

```json
{
  "include_claim_keys": ["repo", "workflow", "ref"]
}
```

生成されるsubjectは次の形式です。

```text
repo:OWNER@OWNER_ID/REPOSITORY@REPOSITORY_ID:workflow:WORKFLOW_NAME:ref:refs/heads/main
```

- ownerとリポジトリの名前・IDはCloudFormationパラメーターで指定します。
- `workflow`には`.yml`のファイル名でなく、Workflowの`name`を指定します。
- 既存リポジトリでimmutable subjectを使っていない場合は、GitHub側で
  immutable subjectを有効にしてから利用してください。
- Workflowには`permissions: id-token: write`を設定してください。
- GitHub Environmentを使うとsubject形式が変わるため、この設定では利用できません。

## AWS CloudShellからのセットアップ

CloudShellを対象のAWSアカウントとリージョンで開き、実行環境の認証情報を
利用します。

```sh
aws sts get-caller-identity
export AWS_REGION=ap-northeast-1
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm synth
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
pnpm exec cdk bootstrap "aws://${AWS_ACCOUNT_ID}/${AWS_REGION}"
```

`AWS_REGION`はデプロイ先に置き換えてください。CDKを変更した場合は
`pnpm synth`を実行し、生成された`template.json`をリポジトリに含めます。
GitHub Actionsはpushとpull requestごとにテスト・合成し、テンプレート差分を
ログに表示します。合成結果はWorkflow artifactとしても保存されます。

## デプロイ

リポジトリ名と数値IDは最大5組まで指定できます。追加分は
`GitHubRepository2` / `GitHubRepositoryId2`から順に指定します。

```sh
pnpm exec cdk deploy \
  --parameters GitHubOwner=OWNER \
  --parameters GitHubOwnerId=OWNER_ID \
  --parameters GitHubRepository1=REPOSITORY \
  --parameters GitHubRepositoryId1=REPOSITORY_ID \
  --region "$AWS_REGION"
```

Workflow名を変更する場合は、`GitHubReadOnlyWorkflow`または
`GitHubCdkDeployWorkflow`パラメーターを指定します。生成済みの
`template.json`はCloudFormation CLIから直接利用できます。
