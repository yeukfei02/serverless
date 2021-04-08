'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../utils/run-serverless');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('AwsCompileMSKEvents', () => {
  const arn = 'arn:aws:kafka:us-east-1:111111111111:cluster/ClusterName/a1a1a1a1a1a1a1a1a';
  const topic = 'TestingTopic';
  const enabled = false;
  const startingPosition = 'LATEST';
  const batchSize = 5000;

  describe('when there are msk events defined', () => {
    let minimalEventSourceMappingResource;
    let allParamsEventSourceMappingResource;
    let defaultIamRole;
    let naming;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  msk: {
                    topic,
                    arn,
                  },
                },
              ],
            },
            other: {
              events: [
                {
                  msk: {
                    topic,
                    arn,
                    batchSize,
                    enabled,
                    startingPosition,
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      naming = awsNaming;
      minimalEventSourceMappingResource =
        cfTemplate.Resources[naming.getMSKEventLogicalId('foo', 'ClusterName', 'TestingTopic')];
      allParamsEventSourceMappingResource =
        cfTemplate.Resources[naming.getMSKEventLogicalId('other', 'ClusterName', 'TestingTopic')];
      defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
    });

    it('should correctly compile EventSourceMapping resource properties with minimal configuration', () => {
      expect(minimalEventSourceMappingResource.Properties).to.deep.equal({
        EventSourceArn: arn,
        StartingPosition: 'TRIM_HORIZON',
        Topics: [topic],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('foo'), 'Arn'],
        },
      });
    });

    it('should update default IAM role with MSK statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
        Resource: [arn],
      });
    });

    it('should update default IAM role with EC2 statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeVpcs',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
        ],
        Resource: '*',
      });
    });

    it('should correctly compile EventSourceMapping resource DependsOn ', () => {
      expect(minimalEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
      expect(allParamsEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
    });

    it('should correctly complie EventSourceMapping resource with all parameters', () => {
      expect(allParamsEventSourceMappingResource.Properties).to.deep.equal({
        BatchSize: batchSize,
        Enabled: enabled,
        EventSourceArn: arn,
        StartingPosition: startingPosition,
        Topics: [topic],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('other'), 'Arn'],
        },
      });
    });
  });

  describe('when no msk events are defined', () => {
    it('should not modify the default IAM role', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
      });

      const defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
        Effect: 'Allow',
        Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
        Resource: [],
      });

      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
        Effect: 'Allow',
        Action: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeVpcs',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
        ],
        Resource: '*',
      });
    });
  });
});
