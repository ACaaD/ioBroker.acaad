import 'reflect-metadata';

import * as utils from '@iobroker/adapter-core';
import { DependencyContainer } from 'tsyringe';
import {
  FrameworkContainer,
  ComponentManager,
  IConnectedServiceAdapter,
  IConnectedServiceContext
} from '@acaad/core';

import { IoBrokerContext } from './services/IoBroker.Context';
import { IoBrokerCsAdapter } from './services/IoBroker.ConnectedServiceAdapter';

import { Option, pipe } from 'effect';

class Acaad extends utils.Adapter {
  private _fwkContainer: DependencyContainer;
  private _componentManager: Option.Option<ComponentManager> = Option.none();

  // Not using Option here for performance reasons.
  private _context: IoBrokerContext | null = null;

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'acaad'
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));

    this.on('unload', this.onUnload.bind(this));

    if (!this.config.targetServices) {
      this.config.targetServices = [];
    }

    if (!this.config.auth) {
      // TODO: Raise an error later.
      // Here the logger is not yet available.
      console.log('No auth provided.');
    }

    this._fwkContainer = this.createDiContainer();
  }

  private createDiContainer(): DependencyContainer {
    const ioBrokerContext = new IoBrokerContext(this);
    const contextToken = IoBrokerContext.Token;

    return FrameworkContainer.CreateCsContainer<IConnectedServiceAdapter>({
      useClass: IoBrokerCsAdapter
    })
      .WithContext<IConnectedServiceContext>(contextToken, ioBrokerContext)
      .Build();
  }

  private async onReady(): Promise<void> {
    const instance = this._fwkContainer.resolve(ComponentManager) as ComponentManager;
    this._componentManager = Option.some(instance);

    const componentCreation = await instance.createMissingComponentsAsync();

    if (componentCreation) {
      await instance.startAsync();
    } else {
      console.log('Failed to create components.');
      // TODO: Stop the adapter
    }
  }

  private async onUnload(callback: () => void): Promise<void> {
    try {
      // TODO: Add AbortController+Signal to limit shutdown duration, if necessary force-stop.
      // Alternatively, fork (?) an effect and race it as timeout.

      await pipe(
        this._componentManager,
        Option.match({
          onSome: (cm) => cm.shutdownAsync(), // TODO: Add timeout
          onNone: () => Promise.resolve()
        })
      );
    } finally {
      await this._fwkContainer.dispose();
      callback();
    }
  }

  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    await (this._context ??= this._fwkContainer.resolve(
      IoBrokerContext.Token
    ) as IoBrokerContext).onStateChangeAsync(id, state);
  }
}

if (require.main !== module) {
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Acaad(options);
} else {
  (() => new Acaad())();
}
