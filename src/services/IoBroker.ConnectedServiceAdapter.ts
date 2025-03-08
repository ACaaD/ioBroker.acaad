import {
  AcaadError,
  AcaadFatalError,
  AcaadHost,
  AcaadOutcome,
  AcaadServerMetadata,
  AcaadUnhandledEventReceivedEvent,
  AcaadUnitOfMeasure,
  Component,
  ComponentCommandOutcomeEvent,
  ComponentDescriptor,
  ComponentType,
  ComponentTypes,
  ConnectedServiceFunction,
  IConnectedServiceAdapter,
  ICsLogger,
  OutboundStateChangeCallback,
  InboundStateUpdate
} from '@acaad/abstractions';

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

  shouldSyncMetadataOnServerConnect(): boolean {
    return true;
  }

  getMetadataSyncInterval(): number | string {
    return 30_000;
  }

  /*
    Fatal errors (AcaadFatalError), or its subclasses, result in the graceful termination of the ACaaD core framework. 
    It has been confirmed that the only 'unexpected' errors an ioBroker adapter may encounter 
      are related to the database connection going down (or similar). 
    These errors are neither retryable nor recoverable, as the adapter core will shut down the adapter regardless. 
    Therefore, a sophisticated error handler is unnecessary in the case of this ioBroker adapter.
  */
  mapServiceError(functionName: ConnectedServiceFunction, error: unknown): AcaadError {
    const msg = `An unhandled error occurred processing function '${functionName}'.`;
    return new AcaadFatalError(error, msg);
  }

  async onServerConnectedAsync(server: AcaadHost, as: AbortSignal): Promise<void> {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;

    await this._ioBrokerContext.setStateAsync(connectedState, { val: true });
  }

  async onServerDisconnectedAsync(server: AcaadHost, as: AbortSignal): Promise<void> {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;

    await this._ioBrokerContext.setStateAsync(connectedState, { val: false });
  }

  getAllowedConcurrency(): number {
    return 4;
  }

  async getConnectedServersAsync(as: AbortSignal): Promise<AcaadHost[]> {
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

  async updateComponentStateAsync(
    cd: ComponentDescriptor,
    inboundStateUpdate: InboundStateUpdate,
    as: AbortSignal
  ): Promise<void> {
    // Identifier can be discovered through cd.type inspection? Does this make sense?
    const stateId = `${cd.toIdentifier()}.Value`;

    // TODO: Hard-cast seems weird. Check why this is here in the first place.
    await this._ioBrokerContext.setStateAsync(stateId, {
      val: inboundStateUpdate.determinedTargetState as ioBroker.StateValue
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

  async createServerModelAsync(server: AcaadServerMetadata, as: AbortSignal): Promise<void> {
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

  async createComponentModelAsync(component: Component, as: AbortSignal): Promise<void> {
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

  async registerStateChangeCallbackAsync(cb: OutboundStateChangeCallback, as: AbortSignal): Promise<void> {
    await this._ioBrokerContext.registerStateChangeCallbackAsync(cb);
  }

  mapAcaadComponentType(component: Component): ioBroker.CommonType {
    const componentMetadata = component.getMetadata();
    if (componentMetadata.type === 'Boolean') {
      return 'boolean';
    } else if (componentMetadata.type === 'Long' || componentMetadata.type === 'Decimal') {
      return 'number';
    } else {
      return 'string';
    }
  }

  handleComponent(component: Component): ioBroker.PartialObject[] {
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
              type: this.mapAcaadComponentType(component),
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
            _id: 'Value',
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
