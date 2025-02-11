import {
  IConnectedServiceAdapter,
  ICsLogger,
  AcaadHost,
  Component,
  ComponentType,
  ComponentDescriptor,
  ComponentTypes,
  AcaadOutcome,
  AcaadServerMetadata,
  AcaadUnitOfMeasure,
  AcaadError,
  ConfigurationError,
  OutboundStateChangeCallback
} from '@acaad/abstractions/src';

import { DependencyInjectionTokens } from '@acaad/core';

import { inject, injectable, singleton } from 'tsyringe';
import { IoBrokerContext } from './IoBroker.Context';
import { Actions } from './IoBroker.Constants';

const STATE_SUFFIXES = {
  ACAAD_VERSION: 'acaadVersion',
  CONNECTED: 'connected',
  NAME: 'name',
  REACHABLE: 'reachable'
};

@singleton()
@injectable()
export class IoBrokerCsAdapter implements IConnectedServiceAdapter {
  private _ioBrokerContext: IoBrokerContext;
  private _logger: ICsLogger;

  constructor(
    @inject(IoBrokerContext.Token) ioBrokerContext: IoBrokerContext,
    @inject(DependencyInjectionTokens.Logger) logger: ICsLogger
  ) {
    this._ioBrokerContext = ioBrokerContext;
    this._logger = logger;
  }

  async onServerConnectedAsync(server: AcaadHost): Promise<void> {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;

    await this._ioBrokerContext.setStateAsync(connectedState, { val: true });
  }

  async onServerDisconnectedAsync(server: AcaadHost): Promise<void> {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;

    await this._ioBrokerContext.setStateAsync(connectedState, { val: false });
  }

  getAllowedConcurrency(): number {
    return 4;
  }

  async getConnectedServersAsync(): Promise<AcaadHost[]> {
    const hosts = this._ioBrokerContext.getConfiguredServers();

    this._logger.logInformation(
      `Found ${hosts.length} configured servers: ${hosts.map((h) => `${h.friendlyName} (API=${h.restBase()}, SR=${h.signalrBase()})`).join(', ')}`
    );

    return hosts;
  }

  getComponentDescriptorByComponent(component: Component): ComponentDescriptor {
    return this._ioBrokerContext.getComponentDescriptorByComponent(component);
  }

  transformUnitOfMeasure(uom: AcaadUnitOfMeasure): unknown {
    throw new Error('Method not implemented.');
  }

  async updateComponentStateAsync(cd: ComponentDescriptor, obj: unknown): Promise<void> {
    // Identifier can be discovered through cd.type inspection? Does this make sense?
    const stateId = `${cd.toIdentifier()}.Value`;

    await this._ioBrokerContext.setStateAsync(stateId, {
      val: (obj as AcaadOutcome)?.outcomeRaw ?? ''
    });
  }

  async createServerMetadataAsync(deviceId: string, serverMetadata: AcaadServerMetadata): Promise<void> {
    const extendObjects: ioBroker.PartialObject[] = [
      {
        _id: STATE_SUFFIXES.NAME,
        type: 'state',
        common: {
          type: 'string',
          name: 'Servername',
          read: true,
          write: false,
          def: serverMetadata.host.friendlyName,
          desc: 'The name of the server as provided by the server itself.'
        }
      },
      {
        _id: STATE_SUFFIXES.ACAAD_VERSION,
        type: 'state',
        common: {
          type: 'string',
          name: 'Source Version',
          read: true,
          write: false,
          def: serverMetadata.info.acaad,
          desc: 'Git commit hash of the acaad server binary'
        }
      },
      {
        _id: STATE_SUFFIXES.REACHABLE,
        type: 'state',
        common: {
          type: 'boolean',
          name: 'Reachable',
          desc: 'True iff the configuration was synced from the server at least once.',
          read: true,
          write: false,
          def: true
        }
      },
      {
        _id: STATE_SUFFIXES.CONNECTED,
        type: 'state',
        common: {
          type: 'boolean',
          name: 'Connected',
          desc: 'True if the adapter is currently connected to the server and listening for events.',
          read: true,
          write: false,
          def: false
        }
      }
    ];

    this._logger.logTrace(`Creating ${extendObjects.length} metadata records for device '${deviceId}'.`);

    await Promise.all(
      extendObjects.map(({ _id: suffix, ...payload }) =>
        this._ioBrokerContext.extendObjectAsync(`${deviceId}.${suffix}`, payload)
      )
    );
  }

  async createServerModelAsync(server: AcaadServerMetadata): Promise<void> {
    const deviceId = this._ioBrokerContext.getDevicePrefix(server.host);

    await this._ioBrokerContext.extendObjectAsync(deviceId, {
      type: 'device',
      common: {
        name: server.host.friendlyName,
        statusStates: {
          onlineId: `${this._ioBrokerContext.getNamespace()}.${deviceId}.${STATE_SUFFIXES.CONNECTED}`
        }
      }
    });

    await this.createServerMetadataAsync(deviceId, server);
  }

  async createComponentModelAsync(component: Component): Promise<void> {
    const componentDescriptor = this.getComponentDescriptorByComponent(component);

    const deviceId = componentDescriptor.toIdentifier();

    await this._ioBrokerContext.extendObjectAsync(deviceId, {
      type: 'channel',
      common: {
        name: component.type
      }
    });

    await Promise.all(
      this.handleComponent(component).map(async ({ _id: idSuffix, ...ioBrokerObject }) => {
        const sId = `${deviceId}.${idSuffix}`;
        this._logger.logTrace(`Extending object with identifier: '${sId}'.`);
        await this._ioBrokerContext.extendObjectAsync(sId, ioBrokerObject);

        await this._ioBrokerContext.addObjectAsync(
          `${this._ioBrokerContext.getNamespace()}.${sId}`,
          component
        );
      })
    );
  }

  async registerStateChangeCallbackAsync(cb: OutboundStateChangeCallback): Promise<void> {
    await this._ioBrokerContext.registerStateChangeCallbackAsync(cb);
  }

  handleComponent(component: ComponentTypes): ioBroker.PartialObject[] {
    switch (component.type) {
      case ComponentType.Button:
        return [
          {
            _id: Actions.Trigger,
            type: 'state',
            common: {
              type: 'boolean',
              role: 'button',
              read: false,
              write: true
            }
          }
        ];
      case ComponentType.Sensor:
        return [
          {
            _id: 'Value',
            type: 'state',
            common: {
              type: 'string', // TODO -> Only user knows
              role: 'state',
              read: true,
              write: false
            }
          },
          {
            _id: Actions.Sync,
            type: 'state',
            common: {
              type: 'boolean',
              role: 'button',
              read: false,
              write: true,
              name: 'Trigger Sync'
            }
          }
        ];
      case ComponentType.Switch:
        return [
          {
            _id: Actions.Switch,
            type: 'state',
            common: {
              type: 'boolean',
              read: true,
              write: true,
              role: 'switch'
            }
          },
          {
            _id: Actions.Sync,
            type: 'state',
            common: {
              type: 'boolean',
              role: 'button',
              read: false,
              write: true,
              name: 'Trigger Sync'
            }
          }
        ];
    }
  }
}
