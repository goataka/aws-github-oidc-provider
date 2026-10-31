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

CloudShellを対象のAWSアカウントとリージョンで開き、実行環境の認証情報と
AWS CLIを利用します。Node.js、pnpm、CDKのインストールは不要です。

```sh
aws sts get-caller-identity
export AWS_REGION=ap-northeast-1
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/template.json \
  --output template.json
aws cloudformation deploy \
  --template-file template.json \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOwner=OWNER \
    GitHubOwnerId=OWNER_ID \
    GitHubRepository1=REPOSITORY \
    GitHubRepositoryId1=REPOSITORY_ID \
  --region "$AWS_REGION"
```

`AWS_REGION`とパラメーター値を環境に合わせてください。複数リポジトリを
許可する場合は、対応する`GitHubRepository2` / `GitHubRepositoryId2`から
最大5組までパラメーターを追加します。

CDK変更時のテンプレート更新：pushとpull requestでGitHub Actionsが合成し、
同一リポジトリのブランチに`template.json`の更新をコミットします。PRの差分に
この更新が含まれます。合成テンプレートはWorkflow artifactにも保存されます。
ForkからのPRには自動コミットされないため、artifactを取得してテンプレートを
反映してください。

## デプロイ

Workflow名を変更する場合は、`--parameter-overrides`に
`GitHubReadOnlyWorkflow=WORKFLOW名`または
`GitHubCdkDeployWorkflow=WORKFLOW名`を追加します。更新後も同じ
`aws cloudformation deploy`コマンドを実行してください。
