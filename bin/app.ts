#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { GitHubOidcStack } from '../lib/oidc-stack';

const app = new App();

new GitHubOidcStack(app, 'GitHubOidcStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
