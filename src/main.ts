import { Observability, type Config } from "./internal/observability.js";

export { Instrumentations } from "./internal/observability.js";

export class Telemetry {
  private static instance: Observability | null = null;

  static getInstance(config?: Config) {
    if (this.instance) {
      return this.instance;
    }

    if (!config) {
      throw new Error("Telemetry not instantiated");
    }

    this.instance = new Observability(config);
    return this.instance;
  }
}
