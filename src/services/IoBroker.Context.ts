import {
  IConnectedServiceContext,
  ICsLogger,
  OutboundStateChangeCallback,
  ChangeType,
  AcaadAuthentication,
  AcaadHost,
  Component,
  ComponentDescriptor
} from '@acaad/abstractions';

import IoBrokerLogger from './IoBroker.Logger';
import { injectable } from 'tsyringe';
import { Option } from 'effect';
import { Actions } from './IoBroker.Constants';
import { isObject } from 'effect/Predicate';
import { isArray } from 'effect/Array';

@injectable()
export class IoBrokerContext implements IConnectedServiceContext {
  public static Token = 'di-IoBrokerContext';

  public logger: ICsLogger;

  private _adapter: ioBroker.Adapter;

  private _componentState: Record<string, Component> = {};

  private _outboundStateChangeCallback: OutboundStateChangeCallback | null = null;

  constructor(adapter: ioBroker.Adapter) {
    this.logger = new IoBrokerLogger(adapter);
    this._adapter = adapter;
  }

  getConfiguredServers(): AcaadHost[] {
    let target = this._adapter.config.targetServices;
    const authFromCfg = this._adapter.config.auth;

    /* Enable int-tests */
    if (isObject(target) && !isArray(target)) {
      target = Object.values(target);
    }

    if (!target) {
      return [];
    }

    let auth: AcaadAuthentication | undefined;
    if (authFromCfg) {
      auth = new AcaadAuthentication(
        authFromCfg.tokenUrl,
        authFromCfg.clientId,
        authFromCfg.clientSecret,
        []
      );
    }

    return target.map((t) => new AcaadHost(t.name, t.host, t.port, auth, t.signalrPort));
  }

  getNamespace(): string {
    return this._adapter.namespace;
  }

  async extendObjectAsync(
    objectIdentifier: string,
    partialObject: ioBroker.PartialObject
  ): ioBroker.SetObjectPromise {
    return await this._adapter.extendObject(objectIdentifier, partialObject, {
      preserve: { common: ['name'] }
    });
  }

  async registerStateChangeCallbackAsync(cb: OutboundStateChangeCallback): Promise<void> {
    this.logger.logDebug('Received state change callback. Registering.');

    // TODO: Mutex removed

    try {
      this._adapter.subscribeStates(`${this._adapter.namespace}.*`);
      this._outboundStateChangeCallback = cb;
    } finally {
      // TODO: Mutex removed
    }
  }

  async onStateChangeAsync(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (state?.ack === true) {
      return;
    }

    const triggeredForComponent: Component | undefined | null = this._componentState[id];

    if (!triggeredForComponent) {
      this.logger.logWarning(`State change for unknown component with id ${id}`);
      return;
    }

    if (!this._outboundStateChangeCallback) {
      this.logger.logWarning(`State change for component ${triggeredForComponent.name} but no callback set.`);
      return;
    }

    const changeType = this.getChangeType(id);

    if (!changeType) {
      this.logger.logDebug(
        `Change type for state ${id} could not be determined. Assuming user-defined state or update and doing nothing.`
      );
      return;
    }

    // TODO IMPORTANT: Seems a state being deleted triggers the metadata action /lul.
    const triggerVal: Option.Option<unknown> = this.isNullOrUndefined(state?.val)
      ? Option.none()
      : Option.some(state?.val);

    const host = triggeredForComponent.serverMetadata.host;
    const descriptor = this.getComponentDescriptorByComponent(triggeredForComponent);
    const success = await this._outboundStateChangeCallback(host, descriptor, changeType, triggerVal);

    if (success) {
      await this.setStateAsync(id, { ack: true });
    }
  }

  getDevicePrefix(host: AcaadHost): string {
    return this.escapeComponentName(host.friendlyName);
  }

  getComponentDescriptorByComponent(component: Component): ComponentDescriptor {
    const deviceName = `${this.getDevicePrefix(component.serverMetadata.host)}.${component.name}`;
    const escapedName = this.escapeComponentName(deviceName);

    return new ComponentDescriptor(escapedName);
  }

  // TODO: Temporary
  private isNullOrUndefined(val: unknown): boolean {
    return val === null || val === undefined;
  }

  public async setStateAsync(id: string, val: ioBroker.SettableState): Promise<void> {
    this.logger.logTrace(`Setting state ${id} to ${JSON.stringify(val)}`);

    await this._adapter.setState(id, { ...val, ack: true });
  }

  // Hooray for nested ternaries!
  // TODO: Use regex.. map from group 1..
  private getChangeType(id: string): ChangeType | null {
    return id.endsWith(`.${Actions.Sync}`)
      ? 'query'
      : id.endsWith(`.${Actions.Switch}`) || id.endsWith(`.${Actions.Trigger}`)
        ? 'action'
        : null;
  }

  async addObjectAsync(objectIdentifier: string, component: Component): Promise<void> {
    // TODO: Mutex removed

    try {
      if (!this._componentState[objectIdentifier]) {
        this._componentState[objectIdentifier] = component;
        return;
      }

      throw new Error(
        `Component with identifier ${objectIdentifier} already exists. This is invalid and might happen if components contain forbidden characters and are not unique anymore after stripping. Check the configuration on ACAAD side.`
      );
    } finally {
      // TODO: Mutex removed
    }
  }

  escapeComponentName(name: string): string {
    return name.replaceAll(this._adapter.FORBIDDEN_CHARS, '');
  }
}
