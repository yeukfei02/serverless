'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const BbPromise = require('bluebird');
const AwsProvider = require('../../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../../lib/Serverless');
const CLI = require('../../../../../../lib/classes/CLI');
const { createTmpDir } = require('../../../../../utils/fs');
const {
  addCustomResourceToService,
} = require('../../../../../../lib/plugins/aws/customResources/index.js');
const runServerless = require('../../../../../utils/run-serverless');

const expect = chai.expect;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('#addCustomResourceToService()', () => {
  let tmpDirPath;
  let serverless;
  let provider;
  const serviceName = 'some-service';
  const iamRoleStatements = [
    {
      Effect: 'Allow',
      Resource: 'arn:aws:lambda:*:*:function:custom-resource-func',
      Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
    },
  ];

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    tmpDirPath = createTmpDir();
    serverless = new Serverless();
    serverless.cli = new CLI();
    serverless.pluginManager.cliOptions = options;
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = serviceName;
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    };
    serverless.config.servicePath = tmpDirPath;
    serverless.service.package.artifactDirectoryName = 'artifact-dir-name';
  });

  it('should add one IAM role and the custom resources to the service', () =>
    BbPromise.all([
      // add the custom S3 resource
      addCustomResourceToService(provider, 's3', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: 'arn:aws:s3:::some-bucket',
          Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        },
      ]),
      // add the custom Cognito User Pool resource
      addCustomResourceToService(provider, 'cognitoUserPool', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: '*',
          Action: [
            'cognito-idp:ListUserPools',
            'cognito-idp:DescribeUserPool',
            'cognito-idp:UpdateUserPool',
          ],
        },
      ]),
      // add the custom Event Bridge resource
      addCustomResourceToService(provider, 'eventBridge', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: 'arn:aws:events:*:*:rule/some-rule',
          Action: [
            'events:PutRule',
            'events:RemoveTargets',
            'events:PutTargets',
            'events:DeleteRule',
          ],
        },
        {
          Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
          Effect: 'Allow',
          Resource: 'arn:aws:events:*:*:event-bus/some-event-bus',
        },
      ]),
    ]).then(() => {
      const { Resources } = serverless.service.provider.compiledCloudFormationTemplate;

      // S3 Lambda Function
      expect(Resources.CustomDashresourceDashexistingDashs3LambdaFunction).to.deep.equal({
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'artifact-dir-name/custom-resources.zip',
          },
          FunctionName: `${serviceName}-dev-custom-resource-existing-s3`,
          Handler: 's3/handler.handler',
          MemorySize: 1024,
          Role: {
            'Fn::GetAtt': ['IamRoleCustomResourcesLambdaExecution', 'Arn'],
          },
          Runtime: 'nodejs12.x',
          Timeout: 180,
        },
        DependsOn: ['IamRoleCustomResourcesLambdaExecution'],
      });
      // Cognito User Pool Lambda Function
      expect(Resources.CustomDashresourceDashexistingDashcupLambdaFunction).to.deep.equal({
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'artifact-dir-name/custom-resources.zip',
          },
          FunctionName: `${serviceName}-dev-custom-resource-existing-cup`,
          Handler: 'cognitoUserPool/handler.handler',
          MemorySize: 1024,
          Role: {
            'Fn::GetAtt': ['IamRoleCustomResourcesLambdaExecution', 'Arn'],
          },
          Runtime: 'nodejs12.x',
          Timeout: 180,
        },
        DependsOn: ['IamRoleCustomResourcesLambdaExecution'],
      });
      // Event Bridge Lambda Function
      expect(Resources.CustomDashresourceDasheventDashbridgeLambdaFunction).to.deep.equal({
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'artifact-dir-name/custom-resources.zip',
          },
          FunctionName: `${serviceName}-dev-custom-resource-event-bridge`,
          Handler: 'eventBridge/handler.handler',
          MemorySize: 1024,
          Role: {
            'Fn::GetAtt': ['IamRoleCustomResourcesLambdaExecution', 'Arn'],
          },
          Runtime: 'nodejs12.x',
          Timeout: 180,
        },
        DependsOn: ['IamRoleCustomResourcesLambdaExecution'],
      });
      // Iam Role
      const RoleProps = Resources.IamRoleCustomResourcesLambdaExecution.Properties;
      expect(RoleProps.AssumeRolePolicyDocument).to.deep.equal({
        Statement: [
          {
            Action: ['sts:AssumeRole'],
            Effect: 'Allow',
            Principal: {
              Service: ['lambda.amazonaws.com'],
            },
          },
        ],
        Version: '2012-10-17',
      });
      expect(RoleProps.Policies[0].PolicyDocument.Statement).to.have.deep.members([
        {
          Effect: 'Allow',
          Resource: 'arn:aws:lambda:*:*:function:custom-resource-func',
          Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
        },
        {
          Effect: 'Allow',
          Resource: 'arn:aws:s3:::some-bucket',
          Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        },
        {
          Effect: 'Allow',
          Resource: '*',
          Action: [
            'cognito-idp:ListUserPools',
            'cognito-idp:DescribeUserPool',
            'cognito-idp:UpdateUserPool',
          ],
        },
        {
          Action: [
            'events:PutRule',
            'events:RemoveTargets',
            'events:PutTargets',
            'events:DeleteRule',
          ],
          Effect: 'Allow',
          Resource: 'arn:aws:events:*:*:rule/some-rule',
        },
        {
          Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
          Resource: 'arn:aws:events:*:*:event-bus/some-event-bus',
          Effect: 'Allow',
        },
      ]);
    }));

  it('should use custom role when cfnRole is provided', async () => {
    const role = 'arn:aws:iam::999999999999:role/my-role';
    const { cfTemplate } = await runServerless({
      fixture: 'function',
      command: 'package',
      configExt: {
        provider: {
          cfnRole: role,
        },
        functions: {
          foo: {
            handler: 'foo.bar',
            events: [
              { s3: { bucket: 'my-bucket', existing: true } },
              { cognitoUserPool: { pool: 'my-user-pool', trigger: 'PreSignUp', existing: true } },
              {
                eventBridge: {
                  eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
                  schedule: 'rate(10 minutes)',
                },
              },
            ],
          },
        },
      },
    });

    const { Resources } = cfTemplate;
    expect([
      Resources.CustomDashresourceDashexistingDashs3LambdaFunction.Properties.Role, // S3
      Resources.CustomDashresourceDashexistingDashcupLambdaFunction.Properties.Role, // Cognito User Pool
      Resources.CustomDashresourceDasheventDashbridgeLambdaFunction.Properties.Role, // Event Bridge
    ]).to.eql([role, role, role]);
  });

  it('should setup CloudWatch Logs when logs.frameworkLambda is true', () => {
    serverless.service.provider.logs = { frameworkLambda: true };
    return BbPromise.all([
      // add the custom S3 resource
      addCustomResourceToService(provider, 's3', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: 'arn:aws:s3:::some-bucket',
          Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        },
      ]),
      // add the custom Cognito User Pool resource
      addCustomResourceToService(provider, 'cognitoUserPool', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: '*',
          Action: [
            'cognito-idp:ListUserPools',
            'cognito-idp:DescribeUserPool',
            'cognito-idp:UpdateUserPool',
          ],
        },
      ]),
      // add the custom Event Bridge resource
      addCustomResourceToService(provider, 'eventBridge', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: 'arn:aws:events:*:*:rule/some-rule',
          Action: [
            'events:PutRule',
            'events:RemoveTargets',
            'events:PutTargets',
            'events:DeleteRule',
          ],
        },
        {
          Action: ['events:CreateEventBus', 'events:DeleteEventBus'],
          Effect: 'Allow',
          Resource: 'arn:aws:events:*:*:event-bus/some-event-bus',
        },
      ]),
    ]).then(() => {
      const { Resources } = serverless.service.provider.compiledCloudFormationTemplate;

      // S3 Lambda Function
      expect(Resources.CustomDashresourceDashexistingDashs3LambdaFunction.DependsOn).to.include(
        'CustomDashresourceDashexistingDashs3LogGroup'
      );
      // Cognito User Pool Lambda Function
      expect(Resources.CustomDashresourceDashexistingDashcupLambdaFunction.DependsOn).to.include(
        'CustomDashresourceDashexistingDashcupLogGroup'
      );
      // Event Bridge Lambda Function
      expect(Resources.CustomDashresourceDasheventDashbridgeLambdaFunction.DependsOn).to.include(
        'CustomDashresourceDasheventDashbridgeLogGroup'
      );
      // Iam Role
      const RoleProps = Resources.IamRoleCustomResourcesLambdaExecution.Properties;

      expect(RoleProps.Policies[0].PolicyDocument.Statement).to.include.deep.members([
        {
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:CreateLogGroup'],
          Resource: [
            {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                ':log-group:/aws/lambda/some-service-dev*:*',
            },
          ],
        },
        {
          Effect: 'Allow',
          Action: ['logs:PutLogEvents'],
          Resource: [
            {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                ':log-group:/aws/lambda/some-service-dev*:*:*',
            },
          ],
        },
      ]);
    });
  });

  it('should throw when an unknown custom resource is used', () => {
    return expect(addCustomResourceToService(provider, 'unknown', [])).to.be.rejectedWith(
      'No implementation found'
    );
  });

  it("should ensure function name doesn't extend maximum length", () => {
    serverless.service.service = 'some-unexpectedly-long-service-name';
    return BbPromise.all([
      // add the custom S3 resource
      addCustomResourceToService(provider, 's3', [
        ...iamRoleStatements,
        {
          Effect: 'Allow',
          Resource: 'arn:aws:s3:::some-bucket',
          Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        },
      ]),
    ]).then(() => {
      const { Resources } = serverless.service.provider.compiledCloudFormationTemplate;
      // S3 Lambda Function
      expect(
        Resources.CustomDashresourceDashexistingDashs3LambdaFunction.Properties.FunctionName.length
      ).to.be.below(65);
    });
  });
});
