import { assertEquals } from "@std/assert";
import {
  isCodeFont,
  isDensity,
  isMotion,
  isTheme,
  isTypeScale,
} from "./display-preferences.ts";

Deno.test("display preference guards accept only documented semantic values", () => {
  assertEquals(
    ["system", "light", "dark", "paper", "terminal", "contrast", "color-safe"]
      .every(isTheme),
    true,
  );
  assertEquals(isTheme("purple-neon"), false);
  assertEquals(isDensity("compact"), true);
  assertEquals(isDensity("tiny"), false);
  assertEquals(isTypeScale("large"), true);
  assertEquals(isTypeScale(2), false);
  assertEquals(isCodeFont("sans"), true);
  assertEquals(isCodeFont("comic"), false);
  assertEquals(isMotion("reduced"), true);
  assertEquals(isMotion("autoplay"), false);
});
