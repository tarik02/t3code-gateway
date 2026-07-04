import * as Schema from "effect/Schema";

export class TraefikWriteError extends Schema.TaggedErrorClass<TraefikWriteError>()(
  "TraefikWriteError",
  {
    message: Schema.String,
  },
) {}
