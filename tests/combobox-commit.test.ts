import { test, expect } from "@playwright/test";
import { decideCommit } from "../lib/data/combobox-commit";

const twoSame = [
  { value: "a", label: "Ion Popescu" },
  { value: "b", label: "Ion Popescu" },
  { value: "c", label: "Maria" },
];

test("P3-210: a click outside closes the list on two same-name options and selects nothing", () => {
  expect(
    decideCommit({
      options: twoSame,
      typed: "Ion Popescu",
      creatable: false,
      dontSelectOnMultipleExactMatches: true,
      fromOutsideClick: true,
    }),
  ).toEqual({ select: null, close: true });
});

test("P3-210: Enter on two same-name options keeps the list open and selects nothing", () => {
  expect(
    decideCommit({
      options: twoSame,
      typed: "Ion Popescu",
      creatable: false,
      dontSelectOnMultipleExactMatches: true,
      fromOutsideClick: false,
    }),
  ).toEqual({ select: null, close: false });
});

test("P3-210: one exact match is still selected and closes", () => {
  expect(
    decideCommit({
      options: twoSame,
      typed: "Maria",
      creatable: false,
      dontSelectOnMultipleExactMatches: true,
      fromOutsideClick: true,
    }),
  ).toEqual({ select: "c", close: true });
});

test("P3-210: without the flag the first of several exact matches is selected", () => {
  expect(
    decideCommit({
      options: twoSame,
      typed: "Ion Popescu",
      creatable: false,
      dontSelectOnMultipleExactMatches: false,
      fromOutsideClick: true,
    }),
  ).toEqual({ select: "a", close: true });
});

test("P3-210: free text is kept only where the list is open-ended", () => {
  const base = {
    options: twoSame,
    typed: "  Nou  ",
    dontSelectOnMultipleExactMatches: false,
    fromOutsideClick: true,
  };
  expect(decideCommit({ ...base, creatable: true })).toEqual({ select: "Nou", close: true });
  expect(decideCommit({ ...base, creatable: false })).toEqual({ select: null, close: true });
});
