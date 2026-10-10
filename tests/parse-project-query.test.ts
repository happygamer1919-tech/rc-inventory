import { test, expect } from "@playwright/test";
import { parseProjectQuery } from "../lib/data/projects-list";

test("parseProjectQuery: a valid uuid client id is preserved", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";
  const result = parseProjectQuery({ client: validUuid });
  expect(result.clientId).toBe(validUuid);
});

test("parseProjectQuery: an invalid client id (non-uuid) becomes empty string", () => {
  const result = parseProjectQuery({ client: "abc" });
  expect(result.clientId).toBe("");
});

test("parseProjectQuery: whitespace around invalid client id is trimmed", () => {
  const result = parseProjectQuery({ client: "  abc  " });
  expect(result.clientId).toBe("");
});

test("parseProjectQuery: no client param gives empty string", () => {
  const result = parseProjectQuery({});
  expect(result.clientId).toBe("");
});

test("parseProjectQuery: empty client param gives empty string", () => {
  const result = parseProjectQuery({ client: "" });
  expect(result.clientId).toBe("");
});

test("parseProjectQuery: preserves other query params", () => {
  const result = parseProjectQuery({
    q: "test",
    stare: "active",
    client: "invalid",
    pagina: "2",
  });
  expect(result.q).toBe("test");
  expect(result.clientId).toBe("");
  expect(result.page).toBe(2);
});
