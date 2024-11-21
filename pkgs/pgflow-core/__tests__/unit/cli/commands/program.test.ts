import { describe, it, afterEach, beforeEach, vi, expect } from "vitest";
import program from "../../src/program.ts";

describe("cli program", () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("shows help", async () => {
    const output = program.parse(["install"], { from: "user" });

    expect(output).toBeTruthy();
  });
});
