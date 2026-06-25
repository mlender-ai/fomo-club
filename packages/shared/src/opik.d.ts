declare module "opik" {
  export class Opik {
    trace(input: Record<string, unknown>): {
      span(input: Record<string, unknown>): { end(): void };
      end(input: Record<string, unknown>): void;
    };
    flush?(): Promise<void>;
  }
}
