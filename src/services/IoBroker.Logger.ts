import { ICsLogger } from '@acaad/core';
import { Cause } from 'effect';

class IoBrokerLogger implements ICsLogger {
  private adapter: ioBroker.Adapter;

  constructor(adapter: ioBroker.Adapter) {
    this.adapter = adapter;
  }

  logTrace(...data: any[]): void {
    // TODO: Change from silly debug -> Adjust back
    const logCb = this.adapter.log?.debug;
    this.log(logCb, data);
  }

  logDebug(...data: any[]): void {
    const logCb = this.adapter.log?.debug;
    this.log(logCb, data);
  }

  logInformation(...data: any[]): void {
    const logCb = this.adapter.log?.info;
    this.log(logCb, data);
  }

  logWarning(...data: any[]): void {
    const logCb = this.adapter.log?.warn;
    this.log(logCb, data);
  }

  logError(cause?: Cause.Cause<unknown>, error?: Error, ...data: any[]): void {
    const logCb = this.adapter.log?.error;

    if (cause) {
      this.log(logCb, [Cause.pretty(cause), ...data]);
      return;
    }

    if (error) {
      this.log(logCb, [error, ...data]);
      return;
    }

    this.log(logCb, data);
  }

  private log(logCb: (msg: string) => void | undefined, ...data: any[]): void {
    if (!logCb) {
      console.log(data);
      return;
    }

    data.forEach((d) => {
      logCb(d);
    });
  }
}

export default IoBrokerLogger;
