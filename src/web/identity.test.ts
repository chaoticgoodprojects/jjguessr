import { describe, expect, it } from "vitest";
import { isToken } from "../shared/protocol";
import { seatToken } from "./identity";

describe("seatToken", () => {
  it("makes a valid token without crypto.randomUUID and keeps it", () => {
    const token = seatToken();
    expect(isToken(token)).toBe(true);
    expect(seatToken()).toBe(token);
  });
});
