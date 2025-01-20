"use strict";

// Makes ts-node ignore warnings, so mocha --watch does work

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
import sinonChai from "sinon-chai";
import chaiAsPromised from "chai-as-promised";
import { should, use } from "chai";

process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
process.env.TS_NODE_PROJECT = "tsconfig.json";
process.env.TS_NODE_FILES = "TRUE";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
    throw e;
});

should();
use(sinonChai);
use(chaiAsPromised);
