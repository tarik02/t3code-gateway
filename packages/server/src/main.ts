import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Layer from "effect/Layer";

import { layer as nodeGatewayCryptoLayer } from "./crypto/node-gateway-crypto.ts";
import { runtimeLayer } from "./http/app.ts";

NodeRuntime.runMain(Layer.launch(runtimeLayer.pipe(Layer.provide(nodeGatewayCryptoLayer))));
