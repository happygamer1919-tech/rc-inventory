import { test, expect } from "@playwright/test";
import { parseTaskQuery } from "../../lib/data/tasks-query";

test("parseTaskQuery: a valid uuid responsabil passes through", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  expect(parseTaskQuery({ responsabil: id }).assigneeId).toBe(id);
});

test("parseTaskQuery: a malformed responsabil gives no assignee filter", () => {
  expect(parseTaskQuery({ responsabil: "abc" }).assigneeId).toBe("");
});

test("parseTaskQuery: an empty or missing responsabil gives no assignee filter", () => {
  expect(parseTaskQuery({ responsabil: "" }).assigneeId).toBe("");
  expect(parseTaskQuery({}).assigneeId).toBe("");
});

test("parseTaskQuery: a truncated uuid gives no assignee filter", () => {
  expect(parseTaskQuery({ responsabil: "550e8400-e29b-41d4-a716" }).assigneeId).toBe("");
});
