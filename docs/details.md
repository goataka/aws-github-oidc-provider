# 詳細ドキュメント

## 目次

- [GitHub OIDCの信頼条件](#github-oidcの信頼条件)
- [名前ベースの注意](#名前ベースの注意)
- [ロールと出力](#ロールと出力)
- [権限の範囲](#権限の範囲)
- [テンプレートの更新](#テンプレートの更新)
- [Workflow名の変更](#workflow名の変更)

## GitHub OIDCの信頼条件

- **参照：** [GitHub OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
- **クレーム：** Workflow単位に制限する場合、OIDC subjectに`repo`、`workflow`、`ref`を含めます。
- **設定例：**

```json
{
  "include_claim_keys": ["repo", "workflow", "ref"]
}
```

### subjectの形式

- **Environment未指定：** `repo:OWNER/REPOSITORY:workflow:WORKFLOW_NAME:ref:refs/heads/main`
- **Environment指定：** `repo:OWNER/REPOSITORY:environment:ENVIRONMENT_NAME`

### Environmentの注意

- **ref：** Environment指定時のsubjectには`ref`が含まれません。対象Environmentの**Deployment branches**で`main`だけを許可してください。
- **確認：** 実際のsubjectは、テスト用のWorkflowでOIDCトークンを確認してから利用してください。

### その他の注意

- **immutable subject：** **無効**のままにしてください。有効にするとsubjectがIDを含む形式に変わり、ロールと一致しなくなります。
- **Workflow名：** `WORKFLOW_NAME`には`.yml`のファイル名ではなく、Workflowの`name`を指定します。

## 名前ベースの注意

- **仕組み：** 信頼条件はリポジトリのIDではなく名前で判定します。
- **リスク：** リポジトリを削除して同名で作り直した場合や、オーナーの名前変更で別のリポジトリが同じ名前を取った場合も、ロールに一致します。
- **対策：** リポジトリの削除・改名・移管の権限は管理者だけに限定してください。

## OIDCプロバイダーとロールの分割

- **プロバイダー：** 同じURLのOIDCプロバイダーは、AWSアカウントに1つだけ作成できます。リポジトリごとには作成できません。
- **分割の理由：** プロバイダーとロールを同じスタックに入れると、2つ目のリポジトリで同じプロバイダーを作成しようとして失敗します。また、プロバイダーのスタックを削除すると、他のリポジトリのロールが使えなくなります。
- **分割の方法：** プロバイダーは`GitHubOidcProviderStack`、ロールは`GitHubOidcRepositoryStack`に分けています。ロールは、プロバイダーのARNを文字列で参照するため、スタック間の依存はありません。
- **プロバイダーのARN：** `arn:aws:iam::アカウントID:oidc-provider/token.actions.githubusercontent.com`の形式です。プロバイダーのスタックの出力`GitHubOidcProviderArn`でも確認できます。
- **権限：** プロバイダーのスタックには`CAPABILITY_IAM`が必要です。ロールのスタックは、ロール名を指定しているため`CAPABILITY_NAMED_IAM`が必要です。

## ロールと出力

- **ロール名：** `GHACdkDeploy-リポジトリ名`です。
- **リポジトリ名の上限：** `REPOSITORY`部分は51文字以内です。IAMのロール名の上限は64文字のため、接頭辞と区切りを除いた長さです。
- **出力：** スタックの出力`GHACdkDeployRoleArn`にロールのARNを出力します。
- **権限の構成：** 次の2つのインラインポリシーに分けています。
  - **`CdkDeployAccess`：** `cdk deploy`に必要な権限です。
  - **`CdkBootstrapAccess`：** `cdk bootstrap`に必要な権限です。

## 権限の範囲

### CdkDeployAccess

- **目的：** `cdk deploy`でブートストラップのロールを使うための権限です。
- **AssumeCdkBootstrapRoles：** アカウント内の`cdk-修飾子-*`ロールだけを引き受けます。
- **ReadCdkBootstrapVersion：** `/cdk-bootstrap/修飾子/version`だけを読みます。

### CdkBootstrapAccess

- **目的：** `cdk bootstrap`で、ブートストラップ用のリソースを作成・更新するための権限です。
- **ValidateCloudFormationTemplate：** テンプレートの検証です。対象は`*`です。
- **ManageCdkToolkitStack：** `CDKToolkit`スタックの作成・更新です。
- **ManageCdkIamRoles：** `cdk-修飾子-*`ロールの作成・更新です。
- **ManageCdkAssetBucket：** `cdk-修飾子-assets-アカウントID-*`バケットの作成・設定です。
- **ManageCdkContainerRepository：** `cdk-修飾子-container-assets-アカウントID-*`リポジトリの作成・設定です。
- **ManageCdkVersionParameter：** `/cdk-bootstrap/修飾子/version`の作成・更新です。

### 注意

- **対象の範囲：** `CDKToolkit`という既定のスタック名と、既定の資産用の名前だけを対象にしています。`--toolkit-stack-name`などを変えた場合は、権限の対象も変える必要があります。
- **検証：** 権限の一覧は、CDKのブートストラップで作られるリソースから導いています。実際の`cdk bootstrap`で不足が出た場合は、この一覧を追加してください。
- **強い権限になる点：** `cdk deploy`で引き受けるブートストラップのデプロイロールは、CDKの既定では広い権限を持つ実行ロールを使います。そのため、`sts:AssumeRole`の範囲でも実質的に強い権限になります。

## テンプレートの更新

- **生成元：** `lib/oidc-stack.ts`を`pnpm synth`で合成し、CDKの標準出力をYAMLとして保存します。
  - `GitHubOidcProviderStack`：`cloudformation/github-oidc-provider.yml`
  - `GitHubOidcRepositoryStack`：`cloudformation/github-oidc-repository.yml`
- **実行タイミング：** pushとpull requestのたびに、型チェックと`pnpm synth`を実行します。
- **コミット：** 差分がある場合、同一リポジトリのブランチにコミットします。`main`への pushでも同じです。
- **PRの差分：** 生成された更新はPRの差分に含まれます。
- **Fork：** ForkからのPRは書き込み権限がないためコミットしません。警告を表示するので、`pnpm synth`を実行し、生成された`cloudformation/`内のYAMLをコミットしてください。

## Workflow名の変更

- **パラメーター：** `CdkDeployGitHubWorkflow`で指定します。ロールのスタックにだけ適用します。
- **手順：** `--parameter-overrides`に`CdkDeployGitHubWorkflow=WORKFLOW名`を追加し、ロールのスタックで`aws cloudformation deploy`を実行します。
