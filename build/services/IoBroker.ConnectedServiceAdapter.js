"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result)
    __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var IoBroker_ConnectedServiceAdapter_exports = {};
__export(IoBroker_ConnectedServiceAdapter_exports, {
  IoBrokerCsAdapter: () => IoBrokerCsAdapter
});
module.exports = __toCommonJS(IoBroker_ConnectedServiceAdapter_exports);
var import_abstractions = require("@acaad/abstractions");
var import_core = require("@acaad/core");
var import_tsyringe = require("tsyringe");
var import_IoBroker = require("./IoBroker.Context");
var import_IoBroker2 = require("./IoBroker.Constants");
const STATE_SUFFIXES = {
  ACAAD_VERSION: "acaadVersion",
  CONNECTED: "connected",
  NAME: "name",
  REACHABLE: "reachable"
};
let IoBrokerCsAdapter = class {
  _ioBrokerContext;
  _logger;
  constructor(ioBrokerContext, logger) {
    this._ioBrokerContext = ioBrokerContext;
    this._logger = logger;
  }
  shouldSyncMetadataOnServerConnect() {
    return true;
  }
  getMetadataSyncInterval() {
    return 3e4;
  }
  /*
    Fatal errors (AcaadFatalError), or its subclasses, result in the graceful termination of the ACaaD core framework. 
    It has been confirmed that the only 'unexpected' errors an ioBroker adapter may encounter 
      are related to the database connection going down (or similar). 
    These errors are neither retryable nor recoverable, as the adapter core will shut down the adapter regardless. 
    Therefore, a sophisticated error handler is unnecessary in the case of this ioBroker adapter.
  */
  mapServiceError(functionName, error) {
    const msg = `An unhandled error occurred processing function '${functionName}'.`;
    return new import_abstractions.AcaadFatalError(error, msg);
  }
  async onServerConnectedAsync(server, as) {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;
    await this._ioBrokerContext.setStateAsync(connectedState, { val: true });
  }
  async onServerDisconnectedAsync(server, as) {
    const device = this._ioBrokerContext.getDevicePrefix(server);
    const connectedState = `${device}.${STATE_SUFFIXES.CONNECTED}`;
    await this._ioBrokerContext.setStateAsync(connectedState, { val: false });
  }
  getAllowedConcurrency() {
    return 4;
  }
  async getConnectedServersAsync(as) {
    const hosts = this._ioBrokerContext.getConfiguredServers();
    this._logger.logInformation(
      `Found ${hosts.length} configured servers: ${hosts.map((h) => `${h.friendlyName} (API=${h.restBase()}, SR=${h.signalrBase()})`).join(", ")}`
    );
    return hosts;
  }
  getComponentDescriptorByComponent(component) {
    return this._ioBrokerContext.getComponentDescriptorByComponent(component);
  }
  transformUnitOfMeasure(uom) {
    throw new Error("Method not implemented.");
  }
  async updateComponentStateAsync(cd, inboundStateUpdate, as) {
    const stateId = `${cd.toIdentifier()}.Value`;
    await this._ioBrokerContext.setStateAsync(stateId, {
      val: inboundStateUpdate.determinedTargetState
    });
  }
  async createServerMetadataAsync(deviceId, serverMetadata) {
    const extendObjects = [
      {
        _id: STATE_SUFFIXES.NAME,
        type: "state",
        common: {
          type: "string",
          name: "Servername",
          read: true,
          write: false,
          def: serverMetadata.host.friendlyName,
          desc: "The name of the server as provided by the server itself."
        }
      },
      {
        _id: STATE_SUFFIXES.ACAAD_VERSION,
        type: "state",
        common: {
          type: "string",
          name: "Source Version",
          read: true,
          write: false,
          def: serverMetadata.info.acaad,
          desc: "Git commit hash of the acaad server binary"
        }
      },
      {
        _id: STATE_SUFFIXES.REACHABLE,
        type: "state",
        common: {
          type: "boolean",
          name: "Reachable",
          desc: "True iff the configuration was synced from the server at least once.",
          read: true,
          write: false,
          def: true
        }
      },
      {
        _id: STATE_SUFFIXES.CONNECTED,
        type: "state",
        common: {
          type: "boolean",
          name: "Connected",
          desc: "True if the adapter is currently connected to the server and listening for events.",
          read: true,
          write: false,
          def: false
        }
      }
    ];
    this._logger.logTrace(`Creating ${extendObjects.length} metadata records for device '${deviceId}'.`);
    await Promise.all(
      extendObjects.map(
        ({ _id: suffix, ...payload }) => this._ioBrokerContext.extendObjectAsync(`${deviceId}.${suffix}`, payload)
      )
    );
  }
  async createServerModelAsync(server, as) {
    const deviceId = this._ioBrokerContext.getDevicePrefix(server.host);
    await this._ioBrokerContext.extendObjectAsync(deviceId, {
      type: "device",
      common: {
        name: server.host.friendlyName,
        statusStates: {
          onlineId: `${this._ioBrokerContext.getNamespace()}.${deviceId}.${STATE_SUFFIXES.CONNECTED}`
        }
      }
    });
    await this.createServerMetadataAsync(deviceId, server);
  }
  async createComponentModelAsync(component, as) {
    const componentDescriptor = this.getComponentDescriptorByComponent(component);
    const deviceId = componentDescriptor.toIdentifier();
    await this._ioBrokerContext.extendObjectAsync(deviceId, {
      type: "channel",
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
  async registerStateChangeCallbackAsync(cb, as) {
    await this._ioBrokerContext.registerStateChangeCallbackAsync(cb);
  }
  mapAcaadComponentType(component) {
    const componentMetadata = component.getMetadata();
    if (componentMetadata.type === "Boolean") {
      return "boolean";
    } else if (componentMetadata.type === "Long" || componentMetadata.type === "Decimal") {
      return "number";
    } else {
      return "string";
    }
  }
  handleComponent(component) {
    switch (component.type) {
      case import_abstractions.ComponentType.Button:
        return [
          {
            _id: import_IoBroker2.Actions.Trigger,
            type: "state",
            common: {
              type: "boolean",
              role: "button",
              read: false,
              write: true
            }
          }
        ];
      case import_abstractions.ComponentType.Sensor:
        return [
          {
            _id: "Value",
            type: "state",
            common: {
              type: this.mapAcaadComponentType(component),
              role: "state",
              read: true,
              write: false
            }
          },
          {
            _id: import_IoBroker2.Actions.Sync,
            type: "state",
            common: {
              type: "boolean",
              role: "button",
              read: false,
              write: true,
              name: "Trigger Sync"
            }
          }
        ];
      case import_abstractions.ComponentType.Switch:
        return [
          {
            _id: "Value",
            type: "state",
            common: {
              type: "boolean",
              read: true,
              write: true,
              role: "switch"
            }
          },
          {
            _id: import_IoBroker2.Actions.Sync,
            type: "state",
            common: {
              type: "boolean",
              role: "button",
              read: false,
              write: true,
              name: "Trigger Sync"
            }
          }
        ];
    }
  }
};
IoBrokerCsAdapter = __decorateClass([
  (0, import_tsyringe.singleton)(),
  (0, import_tsyringe.injectable)(),
  __decorateParam(0, (0, import_tsyringe.inject)(import_IoBroker.IoBrokerContext.Token)),
  __decorateParam(1, (0, import_tsyringe.inject)(import_core.DependencyInjectionTokens.Logger))
], IoBrokerCsAdapter);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IoBrokerCsAdapter
});
//# sourceMappingURL=IoBroker.ConnectedServiceAdapter.js.map
