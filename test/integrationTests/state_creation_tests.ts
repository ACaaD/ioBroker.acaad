import { TestContext } from '@iobroker/testing/build/tests/integration';
import { TestHarness } from '@iobroker/testing/build/tests/integration/lib/harness';
// import { createSignalR } from "./mockServices/acaad-signalR-server.ts";
import { createServer } from '@mocks-server/main';
import openApi from './mocks/routes/open-api';
import collections from './mocks/collections';
import { TargetService } from '../../src/lib/types';
// import { createSignalR, SIGNAL_R_PORT } from "./mockServices/acaad-signalR-server.ts";
import { expect } from 'chai';
import { Effect } from 'effect';
import portfinder from 'portfinder';

function stateCreationTests(testContext: TestContext) {
  testContext.suite('stateCreation', (getHarness) => {
    let harness: TestHarness;
    // let signalR;

    const disposables: (() => void)[] = [];
    const asyncDisposables: (() => Promise<void>)[] = [];

    const createMockServer = async (selectedCollection = 'positive') => {
      const nextFreePort = await portfinder.getPortPromise({ port: 8_000 });
      const adminPort = await portfinder.getPortPromise({ port: 20_000 });

      const server = createServer({
        server: {
          port: nextFreePort
        },
        mock: {
          collections: {
            selected: selectedCollection
          }
        },
        plugins: {
          adminApi: {
            port: adminPort
          }
        }
      });
      await server.start().then(async () => {
        const { loadRoutes, loadCollections } = server.mock.createLoaders();
        loadRoutes(openApi);
        loadCollections(collections);
      });

      asyncDisposables.push(() => server.stop());
      return nextFreePort;
    };

    before(async () => {
      // signalR = await createSignalR();

      const mockServerPort1 = await createMockServer();
      const mockServerPort2 = await createMockServer();

      harness = getHarness();

      const service1: TargetService = {
        host: 'localhost',
        port: mockServerPort1,
        signalrPort: 5000, // TODO: Port changed
        name: 'device-1'
      };

      const service2: TargetService = {
        host: 'localhost',
        port: mockServerPort2,
        signalrPort: 5000, // TODO: Port changed
        name: 'device-2'
      };

      const adapterConfiguration = {
        targetServices: [service1, service2]
      };

      await harness.changeAdapterConfig(harness.adapterName, {
        native: adapterConfiguration
      });

      await harness.startAdapterAndWait();

      await Effect.runPromise(Effect.sleep(5000));
    });

    after(async () => {
      disposables.map((d) => d());
      await Promise.all(asyncDisposables.map((d) => d()));
    });

    /* __ BIG TODO __*/
    /* Refactor meeeeee (dont await await await) */
    /* __ BIG TODO __*/

    it('should create device-1 metadata', async () => {
      const deviceName = 'acaad.0.device-1';

      const cs1 = await harness.objects.getObjectAsync(deviceName);

      expect(cs1).to.be.not.null;

      const name: ioBroker.State = await harness.states.getStateAsync(`${deviceName}.name`);
      const version = await harness.states.getStateAsync(`${deviceName}.acaadVersion`);

      // From open-api definition
      expect(name.val).to.equal('device-1');
      expect(version.val).to.equal('commit-hash');
    });

    it('should create device-2 metadata', async () => {
      const deviceName = 'acaad.0.device-2';

      const cs = await harness.objects.getObjectAsync(deviceName);

      expect(cs).to.be.not.null;

      const name: ioBroker.State = await harness.states.getStateAsync(`${deviceName}.name`);
      const version = await harness.states.getStateAsync(`${deviceName}.acaadVersion`);

      // From open-api definition
      expect(name.val).to.equal('device-2');
      expect(version.val).to.equal('commit-hash');
    });

    it('Should map sensor component', async () => {
      const deviceName = 'acaad.0.device-1';
      const channelNamespace = `${deviceName}.oma-service-status`;

      const sensorVal = await harness.objects.getObjectAsync(`${channelNamespace}.Value`);
      const sync = await harness.objects.getObjectAsync(`${channelNamespace}.Sync`);

      expect(sensorVal).to.be.not.null;
      expect(sync).to.be.not.null;
    });
  });
}

export { stateCreationTests };
