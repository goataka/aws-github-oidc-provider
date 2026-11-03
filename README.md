# AWS GitHub OIDC プロバイダー

## 概要

- **目的：** GitHub ActionsからAWSへOIDCで接続するためのプロバイダーとIAMロールを作成します。
- **テンプレート：** [`cloudformation/github-oidc.yml`](cloudformation/github-oidc.yml)を**CloudFormation**で利用します。
- **詳細：** 権限や設定の詳細は[詳細ドキュメント](docs/details.md)を参照してください。

## 利用手順

AWS CloudShellで実行します。Node.js、pnpm、CDKのインストールは不要です。

- **cdk bootstrap：** 対象のAWSアカウントで未実行の前提です。初回は後述のWorkflow手順で実行してください。
- **リージョン：** 実行環境のリージョン設定に従います。

```sh
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/cloudformation/github-oidc.yml \
  --output github-oidc.yml \
&& aws cloudformation deploy \
  --template-file github-oidc.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubRepository=OWNER/REPOSITORY
```

- **失敗時：** `curl`が失敗すると、`aws cloudformation deploy`は実行されません。
- **注意：** OIDCプロバイダーはアカウントに1つだけ作成できます。別のスタック名で重ねて作成しないでください。

## パラメーター

- **GitHubRepository：** 必須です。`OWNER/REPOSITORY`形式で指定します。
- **CdkDeployGitHubWorkflow：** 任意です。既定値は`cdk-deploy`です。`GitHubEnvironment`が空のときに使います。
- **GitHubEnvironment：** 任意です。既定値は空です。指定すると、そのEnvironmentを使うジョブだけが利用できます。
- **CdkBootstrapQualifier：** 任意です。既定値は`hnb659fds`です。対象アカウントの`cdk bootstrap --qualifier`と一致させます。

変更する場合は、`--parameter-overrides`に`名前=値`を追加して、同じ`aws cloudformation deploy`を実行します。

## GitHub Actions側の設定

- **権限：** Workflowに`permissions: id-token: write`を設定します。
- **Workflow名：** `CdkDeployGitHubWorkflow`には、`.yml`のファイル名ではなくWorkflowの`name`を指定します。
- **ロール：** 作成されるロールの名前は`GHACdkDeploy-リポジトリ名`です。ARNは、スタックの出力`GHACdkDeployRoleArn`で確認します。
- **初回のブートストラップ：** 対象アカウントで`cdk bootstrap`が未実行の場合は、ロールを引き受けた後、デプロイの前に次のステップを実行します。実行は初回だけで十分です。

```yaml
- name: Bootstrap CDK
  run: pnpm exec cdk bootstrap --qualifier hnb659fds
```

- **修飾子を変えた場合：** `--qualifier`の値を`CdkBootstrapQualifier`と一致させてください。

## 注意

- **名前ベースの信頼：** リポジトリを削除して同名で作り直すと、ロールに一致します。リポジトリの削除・改名・移管の権限は管理者に限定してください。
- **詳細：** 信頼条件、権限の範囲、テンプレートの更新方法は[詳細ドキュメント](docs/details.md)にまとめています。
