'use strict';

const { expect } = require('chai');

const path = require('path');
const fs = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const { version } = require('../../../package');
const programmaticFixturesEngine = require('../../fixtures/programmatic');

const serverlessPath = path.resolve(__dirname, '../../../scripts/serverless.js');
const programmaticFixturesPath = path.resolve(__dirname, '../../fixtures/programmatic');
const cliFixturesPath = path.resolve(__dirname, '../../fixtures/cli');

describe('test/unit/scripts/serverless.test.js', () => {
  it('should display version when "--version" option', async () => {
    const output = String((await spawn('node', [serverlessPath, '-v'])).stdoutBuffer);
    expect(output).to.include(`Framework Core: ${version}`);
  });

  it('should not prevent help output with invalid service configuration', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(cliFixturesPath, 'configSyntaxError'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('You can run commands with');
  });

  it('should report with an error invalid configuration', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(cliFixturesPath, 'configSyntaxError'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });

  it('should handle exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(programmaticFixturesPath, 'exception'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });

  it('should handle uncaught exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(cliFixturesPath, 'uncaughtException'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });

  it('should handle local serverless installation', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: (await programmaticFixturesEngine.setup('locallyInstalledServerless')).servicePath,
        })
      ).stdoutBuffer
    );
    expect(output).to.include('Running "serverless" installed locally');
  });

  it('should handle no service related commands', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, 'plugin', 'list'], {
          cwd: path.resolve(cliFixturesPath, 'configSyntaxError'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('To install a plugin run');
  });

  it('should resolve variables', async () => {
    expect(
      String(
        (
          await spawn('node', [serverlessPath, 'print'], {
            cwd: path.resolve(cliFixturesPath, 'variables'),
          })
        ).stdoutBuffer
      )
    ).to.include('nestedInPrototype: bar-in-prototype');
  });

  it('should rejected unresolved "provider" section', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await programmaticFixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210326', provider: '${foo:bar}' },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"provider.stage" property is not accessible');
    }
  });

  it('should rejected unresolved "provider.stage" property', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await programmaticFixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210326', provider: { stage: '${foo:bar}' } },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"provider.stage" property is not accessible');
    }
  });

  it('should load env variables from dotenv files', async () => {
    const { servicePath } = await programmaticFixturesEngine.setup('aws', {
      configExt: {
        useDotenv: true,
        custom: {
          fromDefaultEnv: '${env:DEFAULT_ENV_VARIABLE}',
        },
      },
    });
    await fs.writeFile(path.resolve(servicePath, '.env'), 'DEFAULT_ENV_VARIABLE=valuefromdefault');
    expect(
      String((await spawn('node', [serverlessPath, 'print'], { cwd: servicePath })).stdoutBuffer)
    ).to.include('fromDefaultEnv: valuefromdefault');
  });

  it('should reject unresolved "plugins" property', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await programmaticFixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210326', plugins: '${foo:bar}' },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"plugins" property is not accessible');
    }
  });

  it('should show help when requested and in context of invalid service configuration', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(programmaticFixturesPath, 'configInvalid'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('Documentation: http://slss.io/docs');
  });

  it('should print general --help to stdout', async () => {
    const output = String((await spawn('node', [serverlessPath, '--help'])).stdoutBuffer);
    expect(output).to.include('Documentation: http://slss.io/docs');
  });

  it('should print command --help to stdout', async () => {
    const output = String((await spawn('node', [serverlessPath, 'deploy', '--help'])).stdoutBuffer);
    expect(output).to.include('deploy');
    expect(output).to.include('stage');
  });

  it('should show help when running container command', async () => {
    // Note: Arbitrarily picked "plugin" command for testing
    const output = String((await spawn('node', [serverlessPath, 'plugin'])).stdoutBuffer);
    expect(output).to.include('plugin install .......');
  });

  it('should crash in required option is missing', async () => {
    try {
      await spawn('node', [serverlessPath, 'config', 'credentials', '-k', 'foo', '-s', 'bar']);
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('command requires the');
    }
  });
});
