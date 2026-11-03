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
- **OIDCプロバイダー：** 同じURLのOIDCプロバイダーは、AWSアカウントに1つだけ作成できます。リポジトリごとには作成できません。同じアカウントで別のリポジトリ用に再度デプロイすると、プロバイダーの作成で失敗します。

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
- **修飾子を変えた場合：** `--qualifier`の値を`CdkBootstrapQualifier`と一致させてください。

### サンプル

`.github/workflows/cdk-deploy.yml`の例です。`123456789012`、`example-repo`、`ap-northeast-1`は環境に合わせて置き換えてください。

```yaml
name: cdk-deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 26.13.0

      - name: Enable pnpm
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Assume CDK deploy role
        uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GHACdkDeploy-example-repo
          aws-region: ap-northeast-1

      - name: Bootstrap CDK (first run only)
        run: pnpm exec cdk bootstrap --qualifier hnb659fds

      - name: Deploy
        run: pnpm exec cdk deploy --all --require-approval never
```

- **Workflow名：** この例の`name: cdk-deploy`は、`CdkDeployGitHubWorkflow`の既定値と一致しています。
- **ロール名：** `role-to-assume`は`GHACdkDeploy-リポジトリ名`です。

## 注意

- **名前ベースの信頼：** リポジトリを削除して同名で作り直すと、ロールに一致します。リポジトリの削除・改名・移管の権限は管理者に限定してください。
- **詳細：** 信頼条件、権限の範囲、テンプレートの更新方法は[詳細ドキュメント](docs/details.md)にまとめています。
