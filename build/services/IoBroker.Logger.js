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
var IoBroker_Logger_exports = {};
__export(IoBroker_Logger_exports, {
  default: () => IoBroker_Logger_default
});
module.exports = __toCommonJS(IoBroker_Logger_exports);
var import_effect = require("effect");
class IoBrokerLogger {
  adapter;
  constructor(adapter) {
    this.adapter = adapter;
  }
  logTrace(...data) {
    var _a;
    const logCb = (_a = this.adapter.log) == null ? void 0 : _a.silly;
    this.log(logCb, data);
  }
  logDebug(...data) {
    var _a;
    const logCb = (_a = this.adapter.log) == null ? void 0 : _a.debug;
    this.log(logCb, data);
  }
  logInformation(...data) {
    var _a;
    const logCb = (_a = this.adapter.log) == null ? void 0 : _a.info;
    this.log(logCb, data);
  }
  logWarning(...data) {
    var _a;
    const logCb = (_a = this.adapter.log) == null ? void 0 : _a.warn;
    this.log(logCb, data);
  }
  logError(cause, error, ...data) {
    var _a;
    const logCb = (_a = this.adapter.log) == null ? void 0 : _a.error;
    if (cause) {
      this.log(logCb, [import_effect.Cause.pretty(cause), ...data]);
      return;
    }
    if (error) {
      this.log(logCb, [error, ...data]);
      return;
    }
    this.log(logCb, data);
  }
  log(logCb, ...data) {
    if (!logCb) {
      console.log(data);
      return;
    }
    data.forEach((d) => {
      logCb(d);
    });
  }
}
var IoBroker_Logger_default = IoBrokerLogger;
//# sourceMappingURL=IoBroker.Logger.js.map
