'use strict';

const awsRequest = require('@serverless/test/aws-request');
const { expect } = require('chai');
const fixtures = require('../fixtures/programmatic');
const { deployService, removeService } = require('../utils/integration');
const { resolveIotEndpoint } = require('../utils/iot');

describe('test/integration/iotFleetProvisioning.test.js', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  const thingName = 'IotDevice';
  const stage = 'dev';
  let stackName;
  let servicePath;
  let certificateId;
  let isDeployed = false;

  const resolveTemplateName = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    return result.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'ProvisioningTemplateName'
    ).OutputValue;
  };
  const resolveIoTPolicyName = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    return result.Stacks[0].Outputs.find((output) => output.OutputKey === 'IoTPolicyName')
      .OutputValue;
  };

  before(async () => {
    let serviceConfig;
    ({ serviceConfig, servicePath } = await fixtures.setup('iotFleetProvisioning'));
    const serviceName = serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(servicePath);
    isDeployed = true;
  });

  after(async () => {
    if (!isDeployed) return;
    const [
      {
        certificateDescription: { certificateArn },
      },
      policyName,
    ] = await Promise.all([
      awsRequest('Iot', 'describeCertificate', {
        certificateId,
      }),
      resolveIoTPolicyName(),
    ]);
    await Promise.all([
      awsRequest('Iot', 'detachThingPrincipal', {
        thingName,
        principal: certificateArn,
      }),
      awsRequest('Iot', 'detachPolicy', {
        policyName,
        target: certificateArn,
      }),
      awsRequest('Iot', 'updateCertificate', {
        certificateId,
        newStatus: 'INACTIVE',
      }),
    ]);
    await Promise.all([
      awsRequest('Iot', 'deleteThing', {
        thingName,
      }),
      awsRequest('Iot', 'deleteCertificate', {
        certificateId,
      }),
    ]);
    await removeService(servicePath);
  });

  it('setup a new IoT Thing with the provisioning template', async () => {
    let provisionnedThingName;
    const [{ certificatePem, keyPair }, iotEndpoint] = await Promise.all([
      awsRequest('Iot', 'createProvisioningClaim', {
        templateName: await resolveTemplateName(),
      }),
      resolveIotEndpoint(),
    ]);

    const { Payload } = await awsRequest('Lambda', 'invoke', {
      FunctionName: `${stackName}-registerDevice`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        iotEndpoint,
        certificatePem,
        privateKey: keyPair.PrivateKey,
      }),
    });
    ({ thingName: provisionnedThingName, certificateId } = JSON.parse(Payload));

    expect(provisionnedThingName).to.equal(thingName);
  });
});
