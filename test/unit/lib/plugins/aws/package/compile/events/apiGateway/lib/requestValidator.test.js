'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../../utils/run-serverless');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#compileRequestValidators()', () => {
  let cfResources;
  let naming;

  before(async () => {
    const { cfTemplate, awsNaming } = await runServerless({
      fixture: 'requestSchema',
      command: 'package',
    });
    cfResources = cfTemplate.Resources;
    naming = awsNaming;
  });

  describe(' reusable schemas ', () => {
    it('Should process schema from apiGateway provider, full config', () => {
      const modelLogicalId = naming.getModelLogicalId('TestModel');
      const modelResource = cfResources[modelLogicalId];
      expect(modelResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          Description: 'Test Description',
          Name: 'TestModel',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });
    });

    it('Should process schema from apiGateway provider, missing name and description', () => {
      const modelLogicalId = naming.getModelLogicalId('TestModelSimple');
      const modelResource = cfResources[modelLogicalId];

      expect(modelResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });
    });

    it('Should not create a model that is never referenced in the events', () => {
      const modelLogicalId = naming.getModelLogicalId('UnusedModel');
      const modelResource = cfResources[modelLogicalId] || null;

      expect(modelResource).to.be.null;
    });
  });

  describe('functionConfiguration', () => {
    /** We have already validated that Models exist in the API Provider so this test will
     ** ensure the model can be referenced in the http requestSchema. i.e. not running expect against
     ** api provider models
     **/
    it('should reference model from provider:apiGateway:requestSchemas', () => {
      const modelLogicalId = naming.getModelLogicalId('test-model');
      const validatorLogicalId = naming.getValidatorLogicalId(modelLogicalId);
      const methodLogicalId = naming.getMethodLogicalId('TestDashmodelDashfull', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });
    });

    it('should create a new model from a schema only', () => {
      const modelLogicalId = naming.getEndpointModelLogicalId(
        'TestDashdirectDashsimple',
        'get',
        'application/json'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(
        naming.getModelLogicalId('TestDashdirectDashsimple')
      );
      const methodLogicalId = naming.getMethodLogicalId('TestDashdirectDashsimple', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });

      const modelResource = cfResources[modelLogicalId];

      expect(modelResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Description: undefined,
          Name: undefined,
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });
    });

    it('should create a new model from a schema with name and description', () => {
      const modelLogicalId = naming.getEndpointModelLogicalId(
        'TestDashdirectDashfull',
        'get',
        'application/json'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(
        naming.getModelLogicalId('TestDashdirectDashfull')
      );
      const methodLogicalId = naming.getMethodLogicalId('TestDashdirectDashfull', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });

      const modelResource = cfResources[modelLogicalId];

      expect(modelResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Name: 'TestMethodModel',
          Description: 'Test Method Model Desc',
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });
    });

    it('should allow multiple schemas to be defined', () => {
      const modelJsonLogicalId = naming.getEndpointModelLogicalId(
        'TestDashmultiple',
        'get',
        'application/json'
      );
      const modelPlainTextLogicalId = naming.getEndpointModelLogicalId(
        'TestDashmultiple',
        'get',
        'text/plain'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(
        naming.getModelLogicalId('TestDashmultiple')
      );
      const methodLogicalId = naming.getMethodLogicalId('TestDashmultiple', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelJsonLogicalId,
      });

      expect(methodResource.Properties.RequestModels['text/plain']).to.deep.equal({
        Ref: modelPlainTextLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });

      const modelJsonResource = cfResources[modelJsonLogicalId];
      const modelPlainTextResource = cfResources[modelPlainTextLogicalId];

      expect(modelJsonResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Description: undefined,
          Name: undefined,
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });

      expect(modelPlainTextResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'text/plain',
          Description: undefined,
          Name: undefined,
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: 'foo',
        },
      });
    });

    it('should support existing request:schema property for regression', () => {
      const modelLogicalId = naming.getEndpointModelLogicalId(
        'TestDashdeprecatedDashsimple',
        'get',
        'application/json'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(
        naming.getModelLogicalId('TestDashdeprecatedDashsimple')
      );
      const methodLogicalId = naming.getMethodLogicalId('TestDashdeprecatedDashsimple', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });

      const modelResource = cfResources[modelLogicalId];

      expect(modelResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });
    });

    it('should support multiple request:schema property for regression', () => {
      const modelJsonLogicalId = naming.getEndpointModelLogicalId(
        'TestDashdeprecatedDashmultiple',
        'get',
        'application/json'
      );
      const modelPlainTextLogicalId = naming.getEndpointModelLogicalId(
        'TestDashdeprecatedDashmultiple',
        'get',
        'text/plain'
      );
      const validatorLogicalId = naming.getValidatorLogicalId(
        naming.getModelLogicalId('TestDashdeprecatedDashmultiple')
      );
      const methodLogicalId = naming.getMethodLogicalId('TestDashdeprecatedDashmultiple', 'get');
      const methodResource = cfResources[methodLogicalId];

      expect(methodResource.Properties).to.have.property('RequestModels');
      expect(methodResource.Properties).to.have.property('RequestValidatorId');

      expect(methodResource.Properties.RequestModels['application/json']).to.deep.equal({
        Ref: modelJsonLogicalId,
      });

      expect(methodResource.Properties.RequestModels['text/plain']).to.deep.equal({
        Ref: modelPlainTextLogicalId,
      });

      expect(methodResource.Properties.RequestValidatorId).to.deep.equal({
        Ref: validatorLogicalId,
      });

      const modelJsonResource = cfResources[modelJsonLogicalId];
      const modelPlainTextResource = cfResources[modelPlainTextLogicalId];

      expect(modelJsonResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'application/json',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            definitions: {},
            properties: {
              id: {
                pattern: '[0-9]+',
                title: 'ID for object',
                type: 'number',
              },
            },
            required: ['id'],
            title: 'Test Validation Schema',
            type: 'object',
          },
        },
      });

      expect(modelPlainTextResource).to.deep.equal({
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          ContentType: 'text/plain',
          RestApiId: {
            Ref: 'ApiGatewayRestApi',
          },
          Schema: 'foo',
        },
      });
    });
  });
});
