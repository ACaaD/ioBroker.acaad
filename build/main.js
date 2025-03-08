"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var import_reflect_metadata = require("reflect-metadata");
var utils = __toESM(require("@iobroker/adapter-core"));
var import_core = require("@acaad/core");
var import_IoBroker = require("./services/IoBroker.Context");
var import_IoBroker2 = require("./services/IoBroker.ConnectedServiceAdapter");
var import_effect = require("effect");
class Acaad extends utils.Adapter {
  _fwkContainer;
  _componentManager = import_effect.Option.none();
  // Not using Option here for performance reasons.
  _context = null;
  constructor(options = {}) {
    super({
      ...options,
      name: "acaad"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    if (!this.config.targetServices) {
      this.config.targetServices = [];
    }
    if (!this.config.auth) {
      console.log("No auth provided.");
    }
    this._fwkContainer = this.createDiContainer();
  }
  createDiContainer() {
    const ioBrokerContext = new import_IoBroker.IoBrokerContext(this);
    const contextToken = import_IoBroker.IoBrokerContext.Token;
    return import_core.FrameworkContainer.CreateCsContainer({
      useClass: import_IoBroker2.IoBrokerCsAdapter
    }).WithContext(contextToken, ioBrokerContext).Build();
  }
  async onReady() {
    const instance = this._fwkContainer.resolve(import_core.ComponentManager);
    this._componentManager = import_effect.Option.some(instance);
    await instance.startAsync();
  }
  async onUnload(callback) {
    try {
      await (0, import_effect.pipe)(
        this._componentManager,
        import_effect.Option.match({
          onSome: (cm) => cm.shutdownAsync(),
          // TODO: Add timeout
          onNone: () => Promise.resolve()
        })
      );
    } finally {
      await this._fwkContainer.dispose();
      callback();
    }
  }
  async onStateChange(id, state) {
    var _a;
    await ((_a = this._context) != null ? _a : this._context = this._fwkContainer.resolve(
      import_IoBroker.IoBrokerContext.Token
    )).onStateChangeAsync(id, state);
  }
}
if (require.main !== module) {
  module.exports = (options) => new Acaad(options);
} else {
  (() => new Acaad())();
}
//# sourceMappingURL=main.js.map
