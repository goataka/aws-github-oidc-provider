# AWS GitHub OIDC プロバイダー

## 目次

- [概要](#概要)
- [GitHub OIDCの設定](#github-oidcの設定)
- [AWS CloudShellからのセットアップ](#aws-cloudshellからのセットアップ)
- [パラメーター](#パラメーター)
- [テンプレートの更新](#テンプレートの更新)
- [Workflow名の変更](#workflow名の変更)

## 概要

- **目的：** GitHub ActionsからAWSへOIDCで接続するためのプロバイダーとIAMロールを作成します。
- **テンプレート：** [`cloudformation/github-oidc.yml`](cloudformation/github-oidc.yml)は**CloudFormation**で利用できる生成済みテンプレートです。
- **ロール名：** `GitHubActionsCdkDeploy-リポジトリ名`です。リポジトリ名はIAMのロール名の上限に合わせ、41文字以内です。
- **ARN：** スタックの出力`GitHubCdkDeployRoleArn`で確認します。
  - **権限：** CDKのブートストラップロールを引き受ける`sts:AssumeRole`と、ブートストラップのバージョンを読む`ssm:GetParameter`だけです。
  - **対象：** アカウント内の`cdk-hnb659fds-*`ロールと`/cdk-bootstrap/hnb659fds/version`パラメーターに限定します。
  - **前提：** 対象アカウントで`cdk bootstrap`を実行済みであることが必要です。`cdk bootstrap`の既定の修飾子`hnb659fds`を使います。
- **制限：** ロールは指定したリポジトリ、Workflow、`main`ブランチに限定されます。
- **既定のWorkflow：** `cdk-deploy`

## GitHub OIDCの設定

- **参照：** [GitHub OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
- **クレーム：** Workflow単位に制限するには、OIDC subjectに`repo`、`workflow`、`ref`を含めます。
- **設定例：**

```json
{
  "include_claim_keys": ["repo", "workflow", "ref"]
}
```

- **subjectの形式：**

```text
repo:OWNER/REPOSITORY:workflow:WORKFLOW_NAME:ref:refs/heads/main
```

- **リポジトリ：** `GitHubRepository`に`OWNER/REPOSITORY`形式で指定します。
- **Workflow名：** `WORKFLOW_NAME`には`.yml`のファイル名ではなく、Workflowの`name`を指定します。
- **権限設定：** Workflowには`permissions: id-token: write`を設定します。
- **immutable subject：** **無効**のままにしてください。有効にするとsubjectがIDを含む形式に変わり、ロールと一致しなくなります。
- **制限事項：** GitHub Environmentを使うとsubject形式が変わるため、この設定では利用できません。

### 名前ベースの注意

- **リスク：** IDを使わないため、リポジトリを削除して同名で作り直した場合や、オーナーの名前を変更して別のリポジトリが同じ名前を取った場合も、ロールに一致します。
- **対策：** リポジトリの削除・改名・移管の権限を管理者だけに限定してください。

## AWS CloudShellからのセットアップ

- **実行環境：** 対象のAWSアカウントとリージョンでCloudShellを開きます。
- **認証情報：** CloudShellの認証情報とAWS CLIを利用します。
- **不要な作業：** Node.js、pnpm、CDKのインストールは不要です。
- **リージョン：** `aws cloudformation deploy`は実行環境のリージョン設定に従います。

```sh
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/cloudformation/github-oidc.yml \
  --output github-oidc.yml
aws cloudformation deploy \
  --template-file github-oidc.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubRepository=OWNER/REPOSITORY
```

- **パラメーター：** `OWNER/REPOSITORY`を環境に合わせて置き換えます。
- **対象の変更：** 別のリポジトリを許可する場合は、パラメーターを変更して同じスタックを更新します。
- **注意：** OIDCプロバイダーはアカウントに1つだけ作成できるため、同じテンプレートを別のスタック名で重ねて作成しないでください。

## テンプレートの更新

- **生成元：** `lib/oidc-stack.ts`を`pnpm synth`で合成し、CDKの標準出力をYAMLとして`cloudformation/github-oidc.yml`に保存します。
- **合成：** pushとpull requestのたびに、GitHub Actionsが型チェックと`pnpm synth`を実行します。
- **コミット：** 差分がある場合、同一リポジトリのブランチにコミットします。
- **PRの差分：** 生成された更新はPRの差分に含まれます。
- **artifact：** 合成結果はartifactとして保存しません。
- **既定ブランチ：** `main`へのpushではコミットしません。
- **Fork：** ForkからのPRは書き込み権限がないためコミットしません。警告を表示するので、`pnpm synth`を実行し、生成された`cloudformation/github-oidc.yml`をコミットしてください。

## パラメーター

- **GitHubRepository：** 必須です。`OWNER/REPOSITORY`形式で指定します。例：`octo-org/example-repo`
- **リポジトリ名の上限：** `REPOSITORY`部分は41文字以内です。ロール名に含めるためです。
- **GitHubCdkDeployWorkflow：** 任意です。既定値は`cdk-deploy`です。Workflowの`name`を指定します。

## Workflow名の変更

- **パラメーター：** `GitHubCdkDeployWorkflow`で指定します。
- **手順：** `--parameter-overrides`に`GitHubCdkDeployWorkflow=WORKFLOW名`を追加し、同じ`aws cloudformation deploy`を実行します。
