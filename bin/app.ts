#!/usr/bin/env node
import { App, DefaultStackSynthesizer } from 'aws-cdk-lib';
import { GitHubOidcProviderStack, GitHubOidcRepositoryStack } from '../lib/oidc-stack';

const app = new App();

const stackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
};

new GitHubOidcProviderStack(app, 'GitHubOidcProviderStack', stackProps);
new GitHubOidcRepositoryStack(app, 'GitHubOidcRepositoryStack', stackProps);
