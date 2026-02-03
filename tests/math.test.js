const { clamp } = require("./math");

test("clamp returns min when value is below range", () => {
  expect(clamp(-1, 0, 10)).toBe(0);
});

test("clamp returns max when value is above range", () => {
  expect(clamp(42, 0, 10)).toBe(10);
});

test("clamp returns value when in range", () => {
  expect(clamp(5, 0, 10)).toBe(5);
});
