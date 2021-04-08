'use strict';

/* eslint-disable no-unused-expressions */

const chai = require('chai');
const runServerless = require('../../../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

const NAME_OVER_64_CHARS = 'oneVeryLongAndVeryStrangeAndVeryComplicatedFunctionNameOver64Chars';

const serverlessConfigurationExtension = {
  functions: {
    default: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
            schedule: 'rate(10 minutes)',
          },
        },
      ],
    },
    [NAME_OVER_64_CHARS]: {
      handler: 'index.handler',
      name: 'one-very-long-and-very-strange-and-very-complicated-function-name-over-64-chars',
      events: [
        {
          eventBridge: {
            schedule: 'rate(10 minutes)',
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
          },
        },
      ],
    },
    configureInput: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'arn:aws:events:us-east-1:12345:event-bus/some-event-bus',
            schedule: 'rate(10 minutes)',
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            input: {
              key1: 'value1',
              key2: {
                nested: 'value2',
              },
            },
          },
        },
      ],
    },
    inputPathConfiguration: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            inputPath: '$.stageVariables',
          },
        },
      ],
    },
    inputTransformer: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            pattern: {
              'source': ['aws.cloudformation'],
              'detail-type': ['AWS API Call via CloudTrail'],
              'detail': {
                eventSource: ['cloudformation.amazonaws.com'],
              },
            },
            inputTransformer: {
              inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
              inputPathsMap: {
                eventTime: '$.time',
              },
            },
          },
        },
      ],
    },
    customSaas: {
      handler: 'index.handler',
      events: [
        {
          eventBridge: {
            eventBus: 'custom-saas-events',
            pattern: {
              detail: {
                eventSource: ['saas.external'],
              },
            },
            inputTransformer: {
              inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
              inputPathsMap: {
                eventTime: '$.time',
              },
            },
          },
        },
      ],
    },
  },
};

describe('EventBridgeEvents', () => {
  describe('using custom resources deployment pattern', () => {
    let cfResources;
    let naming;

    before(async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        configExt: serverlessConfigurationExtension,
        command: 'package',
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
    });

    function getEventBridgeConfigById(resourceLogicalId) {
      const eventBridgeId = naming.getCustomResourceEventBridgeResourceLogicalId(
        resourceLogicalId,
        1
      );
      return cfResources[eventBridgeId].Properties.EventBridgeConfig;
    }

    it('should create the correct policy Statement', () => {
      const roleId = naming.getCustomResourcesRoleLogicalId('default', '12345');

      const [firstStatement, secondStatement, thirdStatment] = cfResources[
        roleId
      ].Properties.Policies[0].PolicyDocument.Statement;
      expect(firstStatement.Effect).to.be.eq('Allow');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('arn');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('events');
      expect(firstStatement.Resource['Fn::Join'][1]).to.deep.include('event-bus/*');
      expect(firstStatement.Action).to.be.deep.eq([
        'events:CreateEventBus',
        'events:DeleteEventBus',
      ]);

      expect(secondStatement.Effect).to.be.eq('Allow');
      expect(secondStatement.Resource['Fn::Join'][1]).to.deep.include('events');
      expect(secondStatement.Resource['Fn::Join'][1]).to.deep.include('rule/*');
      expect(secondStatement.Action).to.be.deep.eq([
        'events:PutRule',
        'events:RemoveTargets',
        'events:PutTargets',
        'events:DeleteRule',
      ]);

      expect(thirdStatment.Effect).to.be.eq('Allow');
      expect(thirdStatment.Resource['Fn::Join'][1]).to.deep.include('function');
      expect(thirdStatment.Resource['Fn::Join'][1]).to.deep.include('lambda');
      expect(thirdStatment.Action).to.be.deep.eq([
        'lambda:AddPermission',
        'lambda:RemovePermission',
      ]);
    });
    it('should create the necessary resource', () => {
      const eventBridgeConfig = getEventBridgeConfigById('default');
      expect(eventBridgeConfig.RuleName).to.include('dev-default-rule-1');
    });

    it("should ensure rule name doesn't exceed 64 chars", () => {
      const eventBridgeConfig = getEventBridgeConfigById(NAME_OVER_64_CHARS);
      expect(eventBridgeConfig.RuleName.endsWith('rule-1')).to.be.true;
      expect(eventBridgeConfig.RuleName).lengthOf.lte(64);
    });

    it('should support input configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('configureInput');
      expect(eventBridgeConfig.Input.key1).be.eq('value1');
      expect(eventBridgeConfig.Input.key2).be.deep.eq({
        nested: 'value2',
      });
    });

    it('should support arn at eventBus', () => {
      const eventBridgeConfig = getEventBridgeConfigById('configureInput');
      expect(eventBridgeConfig.EventBus).be.eq(
        'arn:aws:events:us-east-1:12345:event-bus/some-event-bus'
      );
    });
    it('should support inputPath configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('inputPathConfiguration');
      expect(eventBridgeConfig.InputPath).be.eq('$.stageVariables');
    });

    it('should support inputTransformer configuration', () => {
      const eventBridgeConfig = getEventBridgeConfigById('inputTransformer');
      const {
        InputTemplate,
        InputPathsMap: { eventTime },
      } = eventBridgeConfig.InputTransformer;
      expect(InputTemplate).be.eq('{"time": <eventTime>, "key1": "value1"}');
      expect(eventTime).be.eq('$.time');
    });

    it('should register created and delete event bus permissions for non default event bus', () => {
      const roleId = naming.getCustomResourcesRoleLogicalId('customSaas', '12345');
      const [firstStatement] = cfResources[roleId].Properties.Policies[0].PolicyDocument.Statement;
      expect(firstStatement.Action[0]).to.be.eq('events:CreateEventBus');
      expect(firstStatement.Action[1]).to.be.eq('events:DeleteEventBus');
      expect(firstStatement.Effect).to.be.eq('Allow');
    });

    it('should fail when trying to reference event bus via CF intrinsic function', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          configExt: {
            functions: {
              foo: {
                events: [
                  {
                    eventBridge: {
                      eventBus: { Ref: 'ImportedEventBus' },
                      schedule: 'rate(10 minutes)',
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ERROR_INVALID_REFERENCE_TO_EVENT_BUS_CUSTOM_RESOURCE'
      );
    });
  });

  describe('using native CloudFormation', () => {
    describe('when event bus is created as a part of the stack', () => {
      let cfResources;
      let naming;
      let eventBusLogicalId;
      let ruleResource;
      let ruleTarget;
      let inputPathRuleTarget;
      let inputTransformerRuleTarget;
      const schedule = 'rate(10 minutes)';
      const eventBusName = 'nondefault';
      const pattern = {
        source: ['aws.cloudformation'],
      };
      const input = {
        key1: 'value1',
        key2: {
          nested: 'value2',
        },
      };
      const inputPath = '$.stageVariables';
      const inputTransformer = {
        inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        inputPathsMap: {
          eventTime: '$.time',
        },
      };

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          configExt: {
            provider: {
              eventBridge: {
                useCloudFormation: true,
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      input,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      inputPath,
                    },
                  },
                  {
                    eventBridge: {
                      eventBus: eventBusName,
                      schedule,
                      pattern,
                      inputTransformer,
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        eventBusLogicalId = naming.getEventBridgeEventBusLogicalId(eventBusName);
        ruleResource = Object.values(cfResources).find(
          (resource) =>
            resource.Type === 'AWS::Events::Rule' && resource.Properties.Name.endsWith('1')
        );
        ruleTarget = ruleResource.Properties.Targets[0];
        const inputPathRuleResource = Object.values(cfResources).find(
          (resource) =>
            resource.Type === 'AWS::Events::Rule' && resource.Properties.Name.endsWith('2')
        );
        inputPathRuleTarget = inputPathRuleResource.Properties.Targets[0];
        const inputTransformerRuleResource = Object.values(cfResources).find(
          (resource) =>
            resource.Type === 'AWS::Events::Rule' && resource.Properties.Name.endsWith('3')
        );
        inputTransformerRuleTarget = inputTransformerRuleResource.Properties.Targets[0];
      });

      it('should create an EventBus resource', () => {
        expect(cfResources[eventBusLogicalId].Properties).to.deep.equal({ Name: eventBusName });
      });

      it('should correctly set ScheduleExpression on a created rule', () => {
        expect(ruleResource.Properties.ScheduleExpression).to.equal('rate(10 minutes)');
      });

      it('should correctly set EventPattern on a created rule', () => {
        expect(ruleResource.Properties.EventPattern).to.deep.equal(JSON.stringify(pattern));
      });

      it('should correctly set Input on the target for the created rule', () => {
        expect(ruleTarget.Input).to.deep.equal(JSON.stringify(input));
      });

      it('should correctly set InputPath on the target for the created rule', () => {
        expect(inputPathRuleTarget.InputPath).to.deep.equal(inputPath);
      });

      it('should correctly set InputTransformer on the target for the created rule', () => {
        expect(inputTransformerRuleTarget.InputTransformer.InputPathsMap).to.deep.equal(
          inputTransformer.inputPathsMap
        );
        expect(inputTransformerRuleTarget.InputTransformer.InputTemplate).to.deep.equal(
          inputTransformer.inputTemplate
        );
      });

      it('should create a rule that depends on created EventBus', () => {
        expect(ruleResource.DependsOn).to.equal(eventBusLogicalId);
      });

      it('should create a rule that references correct function in target', () => {
        expect(ruleTarget.Arn['Fn::GetAtt'][0]).to.equal(naming.getLambdaLogicalId('foo'));
      });

      it('should create a lambda permission resource that correctly references event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('foo', 1)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal(eventBusName);
      });
    });

    describe('when it references already existing EventBus or uses default one', () => {
      let cfResources;
      let naming;

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              eventBridge: {
                useCloudFormation: true,
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: 'arn:xxxxx',
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: { Ref: 'ImportedEventBus' },
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                      eventBus: 'default',
                    },
                  },
                  {
                    eventBridge: {
                      schedule: 'rate(10 minutes)',
                    },
                  },
                ],
              },
            },
          },
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should not create an EventBus if it is provided or default', async () => {
        expect(Object.values(cfResources).some((value) => value.Type === 'AWS::Events::EventBus'))
          .to.be.false;
      });

      it('should create a lambda permission resource that correctly references arn event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('foo', 1)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal('arn:xxxxx');
      });

      it('should create a lambda permission resource that correctly references CF event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('foo', 2)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.deep.equal({ Ref: 'ImportedEventBus' });
      });

      it('should create a lambda permission resource that correctly references explicit default event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('foo', 3)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1][1]
        ).to.equal('default');
      });

      it('should create a lambda permission resource that correctly references implicit default event bus in SourceArn', () => {
        const lambdaPermissionResource =
          cfResources[naming.getEventBridgeLambdaPermissionLogicalId('foo', 4)];

        expect(
          lambdaPermissionResource.Properties.SourceArn['Fn::Join'][1][5]['Fn::Join'][1]
        ).not.to.include('default');
      });
    });
  });
});
