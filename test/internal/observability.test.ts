import { Meter, Tracer } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { DnsInstrumentation } from "@opentelemetry/instrumentation-dns";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NetInstrumentation } from "@opentelemetry/instrumentation-net";
import { metrics, tracing } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { pino } from "pino";
import { beforeAll, describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  Instrumentations,
  Observability,
} from "../../src/internal/observability.js";

describe("Observability", () => {
  vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
    getNodeAutoInstrumentations: () => new HttpInstrumentation(),
  }));
  describe("Config", () => {
    beforeAll(() => {
      vi.restoreAllMocks();
    });

    test("Throws if service name is not provided", () => {
      expect(
        () => new Observability({ serviceName: "", collectorEndpoint: "" }),
      ).toThrow("Service name is required");
    });

    test("Throws if collector endpoint is not provided", () => {
      expect(
        () =>
          new Observability({
            serviceName: "test-service",
            collectorEndpoint: "",
          }),
      ).toThrow("Collector endpoint is required");
    });

    test("Does not throw if collector endpoint is absent in debug mode", () => {
      expect(
        () =>
          new Observability({
            serviceName: "test-service",
            collectorEndpoint: "",
            debug: true,
          }),
      ).not.toThrow();
    });

    test("Prod settings", () => {
      vi.mock("@opentelemetry/instrumentation-net");
      vi.mock("@opentelemetry/instrumentation-dns");
      vi.mock("@opentelemetry/instrumentation-http");

      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
      });

      const finalConfig = observability.getConfig();

      expect(finalConfig).toMatchObject({
        autoDetectResources: true,
        traceExporter: expect.any(OTLPTraceExporter),
        metricReader: expect.any(metrics.PeriodicExportingMetricReader),
        instrumentations: expect.arrayContaining([
          expect.any(NetInstrumentation),
          expect.any(DnsInstrumentation),
          expect.any(HttpInstrumentation),
        ]),
      });

      // @ts-ignore
      expect(finalConfig.traceExporter.url).toEqual("localhost:4317");
      // @ts-ignore
      expect(finalConfig.metricReader._exporter).toBeInstanceOf(
        OTLPMetricExporter,
      );
      // @ts-ignore
      expect(finalConfig.metricReader._exporter._otlpExporter.url).toEqual(
        "localhost:4317",
      );
    });

    test("Debug settings", () => {
      vi.mock("@opentelemetry/instrumentation-net");
      vi.mock("@opentelemetry/instrumentation-dns");
      vi.mock("@opentelemetry/instrumentation-http");

      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
        debug: true,
      });

      const finalConfig = observability.getConfig();

      expect(finalConfig).toMatchObject({
        autoDetectResources: true,
        traceExporter: expect.any(tracing.ConsoleSpanExporter),
        metricReader: expect.any(metrics.PeriodicExportingMetricReader),
        instrumentations: expect.arrayContaining([
          expect.any(NetInstrumentation),
          expect.any(DnsInstrumentation),
          expect.any(HttpInstrumentation),
        ]),
      });

      // @ts-ignore
      expect(finalConfig.traceExporter).toBeInstanceOf(
        tracing.ConsoleSpanExporter,
      );
      // @ts-ignore
      expect(finalConfig.metricReader._exporter).toBeInstanceOf(
        metrics.ConsoleMetricExporter,
      );
    });

    test("Allows opt-in instrumentation", () => {
      vi.mock("@opentelemetry/instrumentation-net");
      vi.mock("@opentelemetry/instrumentation-dns");
      vi.mock("@opentelemetry/instrumentation-http");
      vi.mock("@opentelemetry/instrumentation-pino");
      vi.mock("@opentelemetry/instrumentation-fastify");

      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
        instrumentations: {
          [Instrumentations.FASTIFY]: {
            enabled: true,
            config: {},
          },
        },
      });

      const finalConfig = observability.getConfig();

      expect(
        finalConfig,
        "Could not find Fastify instrumentation in list",
      ).toHaveProperty(
        "instrumentations",
        expect.arrayContaining([expect.any(FastifyInstrumentation)]),
      );
    });

    test("Does not add instrumentation if disabled", () => {
      vi.mock("@opentelemetry/instrumentation-net");
      vi.mock("@opentelemetry/instrumentation-dns");
      vi.mock("@opentelemetry/instrumentation-http");
      vi.mock("@opentelemetry/instrumentation-pino");
      vi.mock("@opentelemetry/instrumentation-fastify");

      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
        instrumentations: {
          [Instrumentations.FASTIFY]: {
            enabled: false,
            config: {},
          },
        },
      });

      const finalConfig = observability.getConfig();

      expect(
        finalConfig,
        "Could not find Fastify instrumentation in list",
      ).not.toHaveProperty(
        "instrumentations",
        expect.arrayContaining([expect.any(FastifyInstrumentation)]),
      );
    });

    test("Resource attributes", () => {
      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
        appAttributes: {
          serviceVersion: "1.0",
        },
      });

      const config = observability.getConfig();

      expect(config.resource?.attributes).toEqual({
        [SemanticResourceAttributes.SERVICE_NAME]: "test-service",
        [SemanticResourceAttributes.SERVICE_VERSION]: "1.0",
      });
    });
  });

  describe("Tracer", () => {
    test("Returns a tracer", () => {
      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
      });

      const tracer = observability.getTracer();
      expectTypeOf(tracer).toEqualTypeOf<Tracer>();
      //@ts-ignore
      expect(tracer.instrumentationLibrary.name).toEqual("test.service");
    });
  });

  describe("Metrics", () => {
    test("Returns a meter", () => {
      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
      });

      const meter = observability.getMeter();
      expectTypeOf(meter).toEqualTypeOf<Meter>();
      //@ts-ignore
      expect(meter._meterSharedState._instrumentationScope.name).toEqual(
        "test.service",
      );
    });
  });

  describe("Logging", () => {
    test("Uses pino for logging", () => {
      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
      });

      expectTypeOf(observability.getLogger()).toEqualTypeOf<pino.Logger>();
    });

    describe("config", () => {
      test("adds opentelemetry transport", () => {
        const logger = vi.spyOn(pino, "transport");

        new Observability({
          serviceName: "test-service",
          collectorEndpoint: "localhost:4317",
          logging: {
            level: "info",
          },
        });

        expect(logger).toHaveBeenCalledWith({
          targets: [
            {
              level: "info",
              target: "pino-opentelemetry-transport",
              options: {
                loggerName: "test-service",
                resourceAttributes: {
                  [SemanticResourceAttributes.SERVICE_NAME]: "test-service",
                },
                logRecordProcessorOptions: [
                  {
                    recordProcessorType: "batch",
                    exporterOptions: {
                      protocol: "grpc",
                    },
                  },
                ],
              },
            },
          ],
        });
      });

      test("adds user configured transports", () => {
        const logger = vi.spyOn(pino, "transport");

        new Observability({
          serviceName: "test-service",
          collectorEndpoint: "localhost:4317",
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
          },
        });

        expect(logger).toBeCalledWith({
          targets: [
            {
              level: "info",
              target: "pino/file",
              options: {},
            },
            {
              level: "error",
              target: "pino-opentelemetry-transport",
              options: {
                loggerName: "test-service",
                resourceAttributes: {
                  [SemanticResourceAttributes.SERVICE_NAME]: "test-service",
                },
                logRecordProcessorOptions: [
                  {
                    recordProcessorType: "batch",
                    exporterOptions: {
                      protocol: "grpc",
                    },
                  },
                ],
              },
            },
          ],
        });
      });

      test("adds user configured options to the logger", () => {
        const observability = new Observability({
          serviceName: "test-service",
          collectorEndpoint: "localhost:4317",
          logging: {
            level: "trace",
            // TODO: test that this is actually added
            customAttributes: {
              foo: "bar",
            },
          },
        });

        const logger = observability.getLogger();
        expect(logger.level).toEqual("trace");
      });
    });
  });

  describe("Instrumentations", () => {
    test("supported list of opt-in instrumentations", () => {
      expect(Object.keys(Instrumentations)).toEqual([
        "FASTIFY",
        "MONGODB",
        "MONGOOSE",
        "RABBITMQ",
        "AWS_SDK",
        "GRAPHQL",
        "POSTGRES",
      ]);
    });
  });

  describe("Custom Metrics Instrumentation", () => {
    test("should call the metric for request", async () => {
      const addHookMock = vi.fn();
      const app = { addHook: addHookMock };

      const observability = new Observability({
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
      });

      observability.instrumentFastifyMetrics(app);

      const req = { method: "POST", routerPath: "/test" };
      const res = { statusCode: 200, getResponseTime: () => 100 };
      await (addHookMock.mock.calls[0][1] as any)(req, res, () => {});
      expect(addHookMock).toHaveBeenCalledOnce();
    });
  });
});
