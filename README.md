# Common Observability

### Installation
```sh
$ npm i @vijayrangan/opentelemetry-js
```

### Usage
The package exposes a single entry point for initialisation. The instace is a singleton and may be used
globally to add custom instrumentations to your application.

> 🚨 This package has not been published on npm yet.

```ts
// Configuration options documented below
const config = {
  serviceName: "test",
  collectorEndpoint: "localhost:4317",
};
const telemetry = Termetry.getInstance(config);
```

##### Custom traces
The library automatically adds trace data for the following components

1. HTTP/HTTPS
2. Net
3. Dns
4. Pino

To add custom traces to your application, you need access to a `Tracer`. For more information on how to create custom spans, refer to the [official docs](https://github.com/open-telemetry/opentelemetry-js-api/blob/main/docs/tracing.md#starting-and-ending-a-span).

```ts
import { Telemetry } from "@vijayrangan/opentelemetry-js";

const tracer = Telemetry.getInstance().getTracer();
// add custom spans
```

##### Custom metrics
The library automatically publishes metrics for the following components

1. HTTP/HTTPS
2. Net
3. Dns
4. Pino

To publish custom metrics for your application, you need access to a `Meter`.

```ts
import { Telemetry } from "@vijayrangan/opentelemetry-js";

const meter = Telemetry.getInstance().getMeter();
const myCustomCounter = meter.createCounter("db_transactions").add(1);
```


### Configuration

| Key                 | Type    | Description                                                                   | Required?                       | Default                        |
| ------------------- | ------- | ----------------------------------------------------------------------------- | ------------------------------- | ------------------------------ |
| serviceName         | String  | The name of the service being instrumented                                    | Yes                             |                                |
| collectorEndpoint   | String  | Coordinates to the OTEL collector                                             | Required unless in `debug` mode |                                |
| autoDetectResources | Boolean | Whether the SDK should automatically detect resources.                        | No                              | true                           |
| debug               | Boolean | Setting the library in `debug` mode outputs all telemetry data to the console | No                              | false                          |
| instrumentations    |         | Opt-in instrumentation configuration                                          | No                              | See instrumentation list below |

### Instrumentations
Instrumentation is the process collecting signals from an app service (such as an API) or system (such as Kubernetes). The library
offers the following instrumentations out of the box. Some need to be explicitly opted-in to. The default ones, like the name suggests,
are available out of the box and need to be explicitly opted-out of. Refer the table below for the full list of supported instrumentations.

> Documentation for each of the following may be found at @opentelemery/instrumentation-{name}

| Instrumentation Name | Description                                | Out of the box            | Documentation                                                                                 |
| -------------------- | ------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| NODE_HTTP            | Node HTTP and HTTPS instrumentations       | Yes                       | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-http)     |
| NODE_NET             | Node Net instrumentation                   | Yes                       | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-net)      |
| NODE_DNS             | Node Dns instrumentation                   | Yes                       | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-dns)      |
| PINO                 | Pino log instrumentation.                  | Yes                       | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-pino)     |
| FASTIFY              | Instrumentation for Fastify applications   | No. User opt-in required. | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-fastify)  |
| MONGODB              | Instrumentation for apps that use MongoDB  | No. User opt-in required. | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-mongodb)  |
| MONGOOSE             | Instrumentation for the mongoose library   | No. User opt-in required. | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-mongoose) |
| RABBITMQ             | Instrumentation for apps that use RabbitMQ | No. User opt-in required. | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-amqplib)  |
| AWS_SDK              | Instrumentation for usage with the AWS SDK | No. User opt-in required. | [Instrumentation docs](https://www.npmjs.com/package/@opentelemetry/instrumentation-aws-sdk)  |


##### Enable / Disable instrumentations
Depending on your usecase / tech stack, you may need to opt-in to instrumentations that are not enabled out of the box. You may enable them
like so:

```ts
import {
  Telemetry,
  Instrumentations,
} from "@vijayrangan/opentelemetry-js";

const telemetry = Telemetry.getInstance({
  //... other config options
  instrumentations: {
    [Instrumentations.FASTIFY]: {
      enabled: true,
      config: {},
    },
    [Instrumentations.AWS_SDK]: {
      enabled: false,
      config: {},
    }
  }
})
```

Configuration for each of the instrumentations may be found by following the relevant link in the table above.


##### Logging

The library exposes a logger that uses pino under the hood. You can use [pino configuration options](https://github.com/pinojs/pino/blob/master/docs/api.md#options) to customise logging.

> Note: The only options not configurable are `mixin` and `browser`. This may change in the future, but are unavailable at this time.

**Example: Custom logging level**
```typescript
const telemetry = Telemetry.getInstance({
  // ... other config options
  logging: {
    level: "info" // <- defaults to "error" when not provided
  }
})
```

**Example: Custom transport**
```typescript
const telemetry = Telemetry.getInstance({
  // ... other config options
  logging: {
    transports: {
      targets: [
        {
          level: "info",
          target: "pino/file",
          options: {},
        },
      ],
    },
  }
})
```
