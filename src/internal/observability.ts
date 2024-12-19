import api, {
  Meter,
  Tracer,
  ValueType,
  trace as apiTrace,
  isSpanContextValid,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { AmqplibInstrumentation } from "@opentelemetry/instrumentation-amqplib";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { DnsInstrumentation } from "@opentelemetry/instrumentation-dns";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb";
import { MongooseInstrumentation } from "@opentelemetry/instrumentation-mongoose";
import { NetInstrumentation } from "@opentelemetry/instrumentation-net";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { Resource } from "@opentelemetry/resources";
import {
  NodeSDK,
  NodeSDKConfiguration,
  metrics,
  tracing,
} from "@opentelemetry/sdk-node";
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from "@opentelemetry/semantic-conventions";
import isEmpty from "lodash.isempty";
import { pino } from "pino";

type LoggingConfig = {
  customAttributes?: Record<string, unknown> | (() => Record<string, unknown>);
  transports?: pino.TransportMultiOptions;
} & Omit<pino.LoggerOptions, "mixin" | "browser">;

export type Config = {
  collectorEndpoint: string;
  serviceName: string;
  debug?: boolean;
  autoDetectResources?: boolean;
  instrumentations?: {
    [key in Instrumentations]?: {
      enabled: boolean;
      config: Record<string, unknown>;
    };
  };
  logging?: LoggingConfig;
  appAttributes?: {
    serviceVersion?: string;
  };
};

/**
 * The default instrumentations that are enabled
 * and cannot be opted out of.
 */
enum DefaultInstrumentations {
  NODE_NET = "NODE_NET",
  NODE_HTTP = "NODE_HTTP",
  NODE_DNS = "NODE_DNS",
}

/**
 * The instrumentations that need to be opted into.
 */
export enum Instrumentations {
  FASTIFY = "FASTIFY",
  MONGODB = "MONGODB",
  MONGOOSE = "MONGOOSE",
  RABBITMQ = "RABBITMQ",
  AWS_SDK = "AWS_SDK",
  GRAPHQL = "GRAPHQL",
  POSTGRES = "POSTGRES",
}

const InstrumentationMap = {
  [DefaultInstrumentations.NODE_NET]: NetInstrumentation,
  [DefaultInstrumentations.NODE_HTTP]: HttpInstrumentation,
  [DefaultInstrumentations.NODE_DNS]: DnsInstrumentation,

  [Instrumentations.FASTIFY]: FastifyInstrumentation,
  [Instrumentations.MONGODB]: MongoDBInstrumentation,
  [Instrumentations.MONGOOSE]: MongooseInstrumentation,
  [Instrumentations.RABBITMQ]: AmqplibInstrumentation,
  [Instrumentations.AWS_SDK]: AwsInstrumentation,
  [Instrumentations.GRAPHQL]: GraphQLInstrumentation,
  [Instrumentations.POSTGRES]: PgInstrumentation,
};

function toSemanticInstrumentName(text: string): string {
  return text.replace(/-/g, ".");
}

export class Observability {
  private sdk: NodeSDK;
  private sdkConfig: Partial<NodeSDKConfiguration>;
  private logger: pino.Logger;
  private meter: Meter;
  constructor(config: Config) {
    if (isEmpty(config.serviceName)) {
      throw new Error("Service name is required");
    }

    if (isEmpty(config.collectorEndpoint) && !config.debug) {
      throw new Error("Collector endpoint is required");
    }

    const traceExporter = config.debug
      ? new tracing.ConsoleSpanExporter()
      : new OTLPTraceExporter({ url: config.collectorEndpoint });

    const metricsExporter = config.debug
      ? new metrics.ConsoleMetricExporter()
      : new OTLPMetricExporter({ url: config.collectorEndpoint });

    const metricReader = new metrics.PeriodicExportingMetricReader({
      exporter: metricsExporter,
    });

    this.sdkConfig = {
      serviceName: config.serviceName,
      autoDetectResources: config.autoDetectResources ?? true,
      traceExporter,
      metricReader,
      instrumentations: this.getInstrumentations(config),
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]:
          config.appAttributes?.serviceVersion,
      }),
    };

    this.sdk = new NodeSDK(this.sdkConfig);
    this.sdk.start();
    this.meter = api.metrics.getMeter(
      toSemanticInstrumentName(config.serviceName),
    );
    this.logger = this.createLogger(config);

    this.handleProcessShutdown();
  }

  setMeter(meter: Meter) {
    this.meter = meter;
  }

  /**
   * Returns the final configuration used by the
   * OpenTelemetry SDK.
   *
   * @memberof Observability
   */
  getConfig() {
    return this.sdkConfig;
  }

  /**
   * Retrieves the tracer for the service.
   *
   * @return {api.Tracer} The tracer object.
   */
  getTracer(): Tracer {
    return apiTrace.getTracer(
      toSemanticInstrumentName(this.sdkConfig.serviceName!),
    );
  }

  /**
   * Retrieves the meter for the service.
   *
   * @return {api.Meter} The meter object.
   */
  getMeter(): Meter {
    return this.meter;
  }

  getLogger(): pino.Logger {
    return this.logger;
  }

  /**
   * Returns the instrumentations to be enabled.
   *
   * @param {Config} config - The configuration object.
   */
  private getInstrumentations(config: Config) {
    const optInInstrumentations = Object.entries(
      config.instrumentations ?? {},
    ).flatMap(([instrumentationName, config]) => {
      if (config.enabled) {
        const Instance =
          InstrumentationMap[instrumentationName as Instrumentations];
        return new Instance(config);
      }
      return [];
    });

    return [
      new NetInstrumentation(),
      new DnsInstrumentation(),
      new HttpInstrumentation(),
      ...optInInstrumentations,
    ];
  }

  /**
   * Creates a pino logger with the specified configuration.
   *
   * @param {Config} config - The configuration object for the logger.
   * @return {pino.Logger<pino.LoggerOptions>} The created logger.
   */
  private createLogger(config: Config): pino.Logger {
    const transports = pino.transport({
      targets: [
        ...(config.logging?.transports?.targets || []),
        ...[this.getOpenTelemetryTransport(config)],
      ],
    });

    const options = Object.assign({}, config.logging || {}, {
      level: config.logging?.level || "error",
      mixin: () => {
        let record = {};
        const span = api.trace.getSpan(api.context.active());

        if (span) {
          const spanContext = span.spanContext();
          if (isSpanContextValid(spanContext)) {
            record = Object.assign(record, {
              trace_id: spanContext.traceId,
              span_id: spanContext.spanId,
              trace_flags: `0${spanContext.traceFlags.toString(16)}`,
              // Open telemetry transport for pino strips the above keys
              // on propagation. This compensates for that until the
              // upstream has been fixed.
              traceId: spanContext.traceId,
              spanId: spanContext.spanId,
            });
          }
        }

        if (typeof config.logging?.customAttributes === "function") {
          record = Object.assign(record, config.logging.customAttributes());
        }

        if (typeof config.logging?.customAttributes === "object") {
          record = Object.assign(record, config.logging.customAttributes);
        }

        return record;
      },
    });

    return pino(options, transports);
  }

  /**
   * Configures the OpenTelemetry transport for pino
   *
   * @param {Config} config - The configuration object.
   * @return {object} Configured transport.
   */
  private getOpenTelemetryTransport(config: Config) {
    return {
      level: config.logging?.level || "error",
      target: "pino-opentelemetry-transport",
      options: {
        loggerName: config.serviceName,
        resourceAttributes: {
          [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        },
        logRecordProcessorOptions: [
          {
            recordProcessorType: "batch",
            exporterOptions: { protocol: "grpc" },
          },
        ],
      },
    };
  }

  /**
   * Listens for signals from the parent
   * process and correctly shuts down the
   * SDK.
   */
  private handleProcessShutdown() {
    ["SIGTERM", "SIGINT"].forEach((signal) => {
      process.on(signal, () => {
        this.sdk
          .shutdown()
          .then(() => process.exit(0))
          .catch((err) => {
            console.error("Error shutting down Telemetry", err);
            process.exit(1);
          });
      });
    });
  }

  public instrumentFastifyMetrics(app: {
    addHook: (name: any, cb: (req: any, res: any) => void) => void;
  }) {
    const histogram = this.meter.createHistogram("http.request.duration", {
      description: "Records request latency in ms per route",
      unit: "ms",
      valueType: ValueType.DOUBLE,
    });

    const requestCounter = this.meter.createCounter("http.request.count", {
      description: "Records request count per route",
      valueType: ValueType.INT,
    });

    app.addHook("onResponse", async (req, res) => {
      requestCounter.add(1, {
        [SemanticAttributes.HTTP_METHOD]: req.method,
        [SemanticAttributes.HTTP_ROUTE]: req.routerPath,
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
      });

      const responseTime = res.getResponseTime();
      histogram.record(responseTime, {
        [SemanticAttributes.HTTP_METHOD]: req.method,
        [SemanticAttributes.HTTP_ROUTE]: req.routerPath,
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
      });
    });
  }
}
