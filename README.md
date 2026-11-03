# AWS GitHub OIDC プロバイダー

## 概要

- **目的：** GitHub ActionsからAWSへOIDCで接続するためのプロバイダーとIAMロールを作成します。
- **テンプレート：** 次の2つを**CloudFormation**で利用します。
  - [`cloudformation/github-oidc-provider.yml`](cloudformation/github-oidc-provider.yml)：OIDCプロバイダー。アカウントに1回だけデプロイします。
  - [`cloudformation/github-oidc-repository.yml`](cloudformation/github-oidc-repository.yml)：ロール。リポジトリごとにデプロイします。
- **詳細：** 権限や設定の詳細は[詳細ドキュメント](docs/details.md)を参照してください。

## 利用手順

AWS CloudShellで実行します。Node.js、pnpm、CDKのインストールは不要です。

### 1. OIDCプロバイダー：アカウントに1回

- **対象：** 同じアカウントで、最初の1回だけ実行します。すでに作成済みなら不要です。

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
curl --fail --location --silent --show-error \
  https://raw.githubusercontent.com/goataka/aws-github-oidc-provider/main/cloudformation/github-oidc-repository.yml \
  --output github-oidc-repository.yml \
&& aws cloudformation deploy \
  --template-file github-oidc-repository.yml \
  --stack-name github-oidc-repository-REPOSITORY \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubRepository=OWNER/REPOSITORY
```

- **スタック名：** リポジトリごとに別の名前にします。例：`github-oidc-repository-example-repo`
- **失敗時：** `curl`が失敗すると、`aws cloudformation deploy`は実行されません。
- **実行環境：** リージョンは実行環境の設定に従います。

## パラメーター

- **対象：** ロールのスタックのパラメーターです。
- **プロバイダー：** プロバイダーのスタックには、パラメーターはありません。
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
- **修飾子を変えた場合：** `--qualifier`の値を`CdkBootstrapQualifier`と一致させてください。

### サンプル

- **ファイル：** [`examples/cdk-deploy.yml`](examples/cdk-deploy.yml)を、利用するリポジトリの`.github/workflows/`に配置します。
- **置き換え：** `123456789012`、`example-repo`、`ap-northeast-1`は環境に合わせて置き換えてください。

## 注意

- **名前ベースの信頼：** リポジトリを削除して同名で作り直すと、ロールに一致します。リポジトリの削除・改名・移管の権限は管理者に限定してください。
- **複数のリポジトリ：** リポジトリごとにロールのスタックを作成します。プロバイダーのスタックは再デプロイしません。
- **削除の順序：** ロールのスタックをすべて削除してから、プロバイダーのスタックを削除してください。
- **詳細：** 信頼条件、権限の範囲、テンプレートの更新方法は[詳細ドキュメント](docs/details.md)にまとめています。
