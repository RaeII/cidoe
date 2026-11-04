import { describe, expect, test } from "bun:test";
import { pageWindow } from "../src/lib/pagination";

describe("pageWindow", () => {
  test("lista tudo enquanto cabe, sem reticências", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 4)).toEqual([1, 2, "…", 4]);
  });

  test("no meio, corta dos dois lados", () => {
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });

  test("nas pontas, corta só do lado que tem buraco", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "…", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "…", 9, 10]);
  });

  test("buraco de uma página vira o número, não reticências", () => {
    expect(pageWindow(4, 6)).toEqual([1, "…", 3, 4, 5, 6]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  test("nunca repete nem sai do intervalo", () => {
    for (let total = 1; total <= 12; total++) {
      for (let page = 1; page <= total; page++) {
        const nums = pageWindow(page, total).filter((p): p is number => p !== "…");
        expect(nums).toEqual([...new Set(nums)].sort((a, b) => a - b));
        expect(nums.every((n) => n >= 1 && n <= total)).toBe(true);
        expect(nums).toContain(page);
      }
    }
  });
});
