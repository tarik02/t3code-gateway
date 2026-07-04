import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Layer from "effect/Layer";

import { runtimeLayer } from "./http/app.ts";

NodeRuntime.runMain(Layer.launch(runtimeLayer));
