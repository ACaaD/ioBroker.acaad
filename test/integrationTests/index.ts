import { stateCreationTests } from "./state_creation_tests";
import { TestContext } from "@iobroker/testing/build/tests/integration";

function runTests(testContext: TestContext) {
    stateCreationTests(testContext);
}

export { runTests };
