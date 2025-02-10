"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var IoBroker_Context_exports = {};
__export(IoBroker_Context_exports, {
  IoBrokerContext: () => IoBrokerContext
});
module.exports = __toCommonJS(IoBroker_Context_exports);
var import_abstractions = require("@acaad/abstractions");
var import_IoBroker = __toESM(require("./IoBroker.Logger"));
var import_tsyringe = require("tsyringe");
var import_effect = require("effect");
var import_IoBroker2 = require("./IoBroker.Constants");
var import_Predicate = require("effect/Predicate");
var import_Array = require("effect/Array");
let IoBrokerContext = class {
  logger;
  _adapter;
  _componentState = {};
  _outboundStateChangeCallback = null;
  constructor(adapter) {
    this.logger = new import_IoBroker.default(adapter);
    this._adapter = adapter;
  }
  getConfiguredServers() {
    let target = this._adapter.config.targetServices;
    const authFromCfg = this._adapter.config.auth;
    if ((0, import_Predicate.isObject)(target) && !(0, import_Array.isArray)(target)) {
      target = Object.values(target);
    }
    if (!target) {
      return [];
    }
    let auth;
    if (authFromCfg) {
      auth = new import_abstractions.AcaadAuthentication(
        authFromCfg.tokenUrl,
        authFromCfg.clientId,
        authFromCfg.clientSecret,
        []
      );
    }
    return target.map((t) => new import_abstractions.AcaadHost(t.name, t.host, t.port, auth, t.signalrPort));
  }
  getNamespace() {
    return this._adapter.namespace;
  }
  // TODO: Use preserver
  async extendObjectAsync(objectIdentifier, partialObject) {
    return await this._adapter.extendObject(objectIdentifier, partialObject, {
      preserve: { common: ["name"] }
    });
  }
  async registerStateChangeCallbackAsync(cb) {
    this.logger.logDebug("Received state change callback. Registering.");
    try {
      this._adapter.subscribeStates(`${this._adapter.namespace}.*`);
      this._outboundStateChangeCallback = cb;
    } finally {
    }
  }
  async onStateChangeAsync(id, state) {
    if ((state == null ? void 0 : state.ack) === true) {
      return;
    }
    const triggeredForComponent = this._componentState[id];
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
    const triggerVal = this.isNullOrUndefined(state == null ? void 0 : state.val) ? import_effect.Option.none() : import_effect.Option.some(state == null ? void 0 : state.val);
    const host = triggeredForComponent.serverMetadata.host;
    const descriptor = this.getComponentDescriptorByComponent(triggeredForComponent);
    const success = await this._outboundStateChangeCallback(host, descriptor, changeType, triggerVal);
    if (success) {
      await this.setStateAsync(id, { ack: true });
    }
  }
  getDevicePrefix(host) {
    return this.escapeComponentName(host.friendlyName);
  }
  getComponentDescriptorByComponent(component) {
    const deviceName = `${this.getDevicePrefix(component.serverMetadata.host)}.${component.name}`;
    const escapedName = this.escapeComponentName(deviceName);
    return new import_abstractions.ComponentDescriptor(escapedName);
  }
  // TODO: Temporary
  isNullOrUndefined(val) {
    return val === null || val === void 0;
  }
  async setStateAsync(id, val) {
    this.logger.logTrace(`Setting state ${id} to ${JSON.stringify(val)}`);
    await this._adapter.setState(id, { ...val, ack: true });
  }
  // Hooray for nested ternaries!
  // TODO: Use regex.. map from group 1..
  getChangeType(id) {
    return id.endsWith(`.${import_IoBroker2.Actions.Sync}`) ? "query" : id.endsWith(`.${import_IoBroker2.Actions.Switch}`) || id.endsWith(`.${import_IoBroker2.Actions.Trigger}`) ? "action" : null;
  }
  async addObjectAsync(objectIdentifier, component) {
    try {
      if (!this._componentState[objectIdentifier]) {
        this._componentState[objectIdentifier] = component;
        return;
      }
      throw new Error(
        `Component with identifier ${objectIdentifier} already exists. This is invalid and might happen if components contain forbidden characters and are not unique anymore after stripping. Check the configuration on ACAAD side.`
      );
    } finally {
    }
  }
  escapeComponentName(name) {
    return name.replaceAll(this._adapter.FORBIDDEN_CHARS, "");
  }
};
__publicField(IoBrokerContext, "Token", "di-IoBrokerContext");
IoBrokerContext = __decorateClass([
  (0, import_tsyringe.injectable)()
], IoBrokerContext);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IoBrokerContext
});
//# sourceMappingURL=IoBroker.Context.js.map
