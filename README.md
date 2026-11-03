# AWS GitHub OIDC プロバイダー

## 概要

- **目的：** GitHub ActionsからAWSへOIDCで接続するためのプロバイダーとIAMロールを作成します。
- **テンプレート：** 次の2つを**CloudFormation**で利用します。
  - [`cloudformation/github-oidc-provider.yml`](cloudformation/github-oidc-provider.yml)：OIDCプロバイダー。アカウントに1回だけデプロイします。
  - [`cloudformation/github-oidc-repository.yml`](cloudformation/github-oidc-repository.yml)：ロール。リポジトリごとにデプロイします。
- **詳細：** 権限や設定の詳細は[詳細ドキュメント](docs/details.md)を参照してください。

## 利用手順

- **実行環境：** AWS CloudShellで実行します。
- **インストール：** Node.js、pnpm、CDKは不要です。
- **リージョン：** 実行環境の設定に従います。

### 1. OIDCプロバイダー：アカウントに1回

- **対象：** 同じアカウントで、最初の1回だけ実行します。
  - **既存：** すでに作成済みの場合は不要です。

```sh
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/cloudformation/github-oidc-provider.yml \
  --output github-oidc-provider.yml \
&& aws cloudformation deploy \
  --template-file github-oidc-provider.yml \
  --stack-name github-oidc-provider \
  --capabilities CAPABILITY_IAM
```

### 2. ロール：リポジトリごと

```sh
export OWNER='octo-org' # 変更：GitHubのオーナー名
export REPOSITORY='example-repo' # 変更：リポジトリ名
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/cloudformation/github-oidc-repository.yml \
  --output github-oidc-repository.yml \
&& aws cloudformation deploy \
  --template-file github-oidc-repository.yml \
  --stack-name github-oidc-repository-${REPOSITORY} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubRepository=${OWNER}/${REPOSITORY}
```

- **変数：** `OWNER`と`REPOSITORY`を環境に合わせて設定します。
  - **例：** `OWNER=octo-org`、`REPOSITORY=example-repo`の場合、スタック名は`github-oidc-repository-example-repo`になります。
- **失敗時：** `curl`が失敗すると、`aws cloudformation deploy`は実行されません。

## パラメーター

- **対象：** ロールのスタックのパラメーターです。
- **プロバイダー：** プロバイダーのスタックには、パラメーターはありません。
- **GitHubRepository：** 必須です。`OWNER/REPOSITORY`形式で指定します。
  - **例：** `octo-org/example-repo`
- **CdkDeployGitHubWorkflow：** 任意です。既定値は`cdk-deploy`です。
  - **使う条件：** `GitHubEnvironment`が空のときに使います。
  - **例：** `deploy-prod`
- **GitHubEnvironment：** 任意です。既定値は空です。
  - **効果：** 指定すると、そのEnvironmentを使うジョブだけが利用できます。
  - **例：** `production`
- **CdkBootstrapQualifier：** 任意です。既定値は`hnb659fds`です。
  - **一致：** 対象アカウントの`cdk bootstrap --qualifier`と一致させます。
  - **制限：** 英数字10文字以内です。
  - **例：** `myapp`
- **変更方法：** `--parameter-overrides`に`名前=値`を追加して、同じ`aws cloudformation deploy`を実行します。
  - **例：** `CdkBootstrapQualifier=myapp`

## GitHub Actions側の設定

- **権限：** Workflowに`permissions: id-token: write`を設定します。
- **Workflow名：** `CdkDeployGitHubWorkflow`には、`.yml`のファイル名ではなくWorkflowの`name`を指定します。
  - **例：** `name: deploy-prod`のWorkflowなら`deploy-prod`
- **ロール：** 作成されるロールの名前は`GHACdkDeploy-リポジトリ名`です。
  - **ARN：** スタックの出力`GHACdkDeployRoleArn`で確認します。
- **初回のブートストラップ：** 対象アカウントで`cdk bootstrap`が未実行の場合のみ、サンプルの「Bootstrap CDK (first run only)」ステップを実行します。
- **修飾子を変えた場合：** `--qualifier`の値を`CdkBootstrapQualifier`と一致させてください。
  - **例：** `CdkBootstrapQualifier=myapp`の場合は`pnpm exec cdk bootstrap --qualifier myapp`を実行します。

### サンプル

- **ファイル：** [`examples/cdk-deploy.yml`](examples/cdk-deploy.yml)を、利用するリポジトリの`.github/workflows/`に配置します。
- **置き換え：** ワークフローの`env`にある次の変数を環境に合わせて変更してください。
  - **変数：** `AWS_ACCOUNT_ID`、`REPOSITORY_NAME`、`AWS_REGION`、`CDK_BOOTSTRAP_QUALIFIER`
  - **例：** `AWS_ACCOUNT_ID=123456789012`、`REPOSITORY_NAME=example-repo`、`AWS_REGION=ap-northeast-1`、`CDK_BOOTSTRAP_QUALIFIER=hnb659fds`

## 注意

- **名前ベースの信頼：** リポジトリを削除して同名で作り直すと、ロールに一致します。リポジトリの削除・改名・移管の権限は管理者に限定してください。
- **複数のリポジトリ：** リポジトリごとにロールのスタックを作成します。プロバイダーのスタックは再デプロイしません。
- **削除の順序：** ロールのスタックをすべて削除してから、プロバイダーのスタックを削除してください。
- **詳細：** 信頼条件、権限の範囲、テンプレートの更新方法は[詳細ドキュメント](docs/details.md)にまとめています。
