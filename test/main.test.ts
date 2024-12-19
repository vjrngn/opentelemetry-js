import { beforeEach, describe, expect, test, vi } from "vitest";
import { Observability } from "../src/internal/observability.js";
import { Telemetry } from "../src/main.js";

describe("Telemetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("throws an error if not previously instantiated", () => {
    expect(() => {
      Telemetry.getInstance();
    }).toThrowError("Telemetry not instantiated");
  });

  test("returns an instance of Observability", () => {
    const telemetry = Telemetry.getInstance({
      serviceName: "test-service",
      collectorEndpoint: "localhost:4317",
    });

    expect(telemetry).toBeInstanceOf(Observability);
  });

  test("is a singleton", () => {
    const telemetry = Telemetry.getInstance({
      serviceName: "test-service",
      collectorEndpoint: "localhost:4317",
    });

    const telemetry2 = Telemetry.getInstance({
      serviceName: "test-service",
      collectorEndpoint: "localhost:4317",
    });

    expect(telemetry).toStrictEqual(telemetry2);
  });

  test.todo(
    "passes all config option to underlying Observability instance",
    () => {
      const obsMock = vi.mock("../src/internal/observability.js");
      const config = {
        serviceName: "test-service",
        collectorEndpoint: "localhost:4317",
        autoDetectResources: false,
        instrumentations: {},
      };

      Telemetry.getInstance(config);

      expect(obsMock).toHaveBeenCalledWith(config);
    },
  );
});
