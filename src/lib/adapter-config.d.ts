// This file extends the AdapterConfig type from "@types/iobroker"

import { native } from "../../io-package.json";
import { TargetService, Authentication } from "./types";

type _AdapterConfig = Partial<typeof native>;

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        export interface AdapterConfig extends _AdapterConfig {
            targetServices: TargetService[];
            auth: Authentication | undefined;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
