import {
  assertEquals,
} from "https://deno.land/std@0.69.0/testing/asserts.ts";
import { parse, quote } from "./index.ts";

Deno.test("comment parse", () => {
  assertEquals(parse("beep#boop"), ["beep", { comment: "boop" }]);
  assertEquals(parse("beep #boop"), ["beep", { comment: "boop" }]);
  assertEquals(parse("beep # boop"), ["beep", { comment: "boop" }]);
  assertEquals(parse("beep # > boop"), ["beep", { comment: "> boop" }]);
  assertEquals(parse('beep # "> boop"'), ["beep", { comment: '"> boop"' }]);
  assertEquals(parse('beep "#"'), ["beep", "#"]);
  assertEquals(parse('beep #"#"#'), ["beep", { comment: '"#"#' }]);
  assertEquals(
    parse("beep > boop # > foo"),
    ["beep", { op: ">" }, "boop", { comment: "> foo" }],
  );
});

Deno.test("functional env expansion", () => {
  assertEquals(parse("a $XYZ c", getEnv), ["a", "xxx", "c"]);
  assertEquals(parse("a $XYZ c", getEnvObj), ["a", { op: "@@" }, "c"]);
  assertEquals(parse("a${XYZ}c", getEnvObj), ["a", { op: "@@" }, "c"]);
  assertEquals(parse('"a $XYZ c"', getEnvObj), ["a ", { op: "@@" }, " c"]);

  function getEnv() {
    return "xxx";
  }

  function getEnvObj() {
    return { op: "@@" };
  }
});

Deno.test("expand environment variables", () => {
  assertEquals(parse("a $XYZ c", { XYZ: "b" }), ["a", "b", "c"]);
  assertEquals(parse("a${XYZ}c", { XYZ: "b" }), ["abc"]);
  assertEquals(parse("a${XYZ}c $XYZ", { XYZ: "b" }), ["abc", "b"]);
  assertEquals(parse('"-$X-$Y-"', { X: "a", Y: "b" }), ["-a-b-"]);
  assertEquals(parse("'-$X-$Y-'", { X: "a", Y: "b" }), ["-$X-$Y-"]);
  assertEquals(parse('qrs"$zzz"wxy', { zzz: "tuv" }), ["qrstuvwxy"]);
  assertEquals(parse("qrs'$zzz'wxy", { zzz: "tuv" }), ["qrs$zzzwxy"]);
  assertEquals(parse("qrs${zzz}wxy"), ["qrswxy"]);
  assertEquals(parse("qrs$wxy $"), ["qrs", "$"]);
  assertEquals(parse('grep "xy$"'), ["grep", "xy$"]);
  assertEquals(parse("ab$x", { x: "c" }), ["abc"]);
  assertEquals(parse("ab\\$x", { x: "c" }), ["ab$x"]);
  assertEquals(parse("ab${x}def", { x: "c" }), ["abcdef"]);
  assertEquals(parse("ab\\${x}def", { x: "c" }), ["ab${x}def"]);
  assertEquals(parse('"ab\\${x}def"', { x: "c" }), ["ab${x}def"]);
});

Deno.test("environment variables with metacharacters", () => {
  assertEquals(parse("a $XYZ c", { XYZ: '"b"' }), ["a", '"b"', "c"]);
  assertEquals(parse("a $XYZ c", { XYZ: "$X", X: "5" }), ["a", "$X", "c"]);
  assertEquals(parse('a"$XYZ"c', { XYZ: "'xyz'" }), ["a'xyz'c"]);
});

Deno.test("special shell parameters", () => {
  const chars = "*@#?-$!0_".split("");

  chars.forEach(function (c) {
    const env = {} as any;
    env[c] = "xxx";
    assertEquals(parse("a $" + c + " c", env), ["a", "xxx", "c"]);
  });
});

Deno.test("single operators", () => {
  assertEquals(parse("beep | boop"), ["beep", { op: "|" }, "boop"]);
  assertEquals(parse("beep|boop"), ["beep", { op: "|" }, "boop"]);
  assertEquals(parse("beep \\| boop"), ["beep", "|", "boop"]);
  assertEquals(parse('beep "|boop"'), ["beep", "|boop"]);

  assertEquals(parse("echo zing &"), ["echo", "zing", { op: "&" }]);
  assertEquals(parse("echo zing&"), ["echo", "zing", { op: "&" }]);
  assertEquals(parse("echo zing\\&"), ["echo", "zing&"]);
  assertEquals(parse('echo "zing\\&"'), ["echo", "zing\\&"]);

  assertEquals(parse("beep;boop"), ["beep", { op: ";" }, "boop"]);
  assertEquals(parse("(beep;boop)"), [
    { op: "(" },
    "beep",
    { op: ";" },
    "boop",
    { op: ")" },
  ]);

  assertEquals(parse("beep>boop"), ["beep", { op: ">" }, "boop"]);
  assertEquals(parse("beep 2>boop"), ["beep", "2", { op: ">" }, "boop"]);
  assertEquals(parse("beep<boop"), ["beep", { op: "<" }, "boop"]);
});

Deno.test("double operators", () => {
  assertEquals(parse("beep || boop"), ["beep", { op: "||" }, "boop"]);
  assertEquals(parse("beep||boop"), ["beep", { op: "||" }, "boop"]);
  assertEquals(parse("beep ||boop"), ["beep", { op: "||" }, "boop"]);
  assertEquals(parse("beep|| boop"), ["beep", { op: "||" }, "boop"]);
  assertEquals(parse("beep  ||   boop"), ["beep", { op: "||" }, "boop"]);

  assertEquals(parse("beep && boop"), ["beep", { op: "&&" }, "boop"]);
  assertEquals(
    parse("beep && boop || byte"),
    ["beep", { op: "&&" }, "boop", { op: "||" }, "byte"],
  );
  assertEquals(
    parse("beep&&boop||byte"),
    ["beep", { op: "&&" }, "boop", { op: "||" }, "byte"],
  );
  assertEquals(
    parse("beep\\&\\&boop||byte"),
    ["beep&&boop", { op: "||" }, "byte"],
  );
  assertEquals(
    parse("beep\\&&boop||byte"),
    ["beep&", { op: "&" }, "boop", { op: "||" }, "byte"],
  );
  assertEquals(
    parse("beep;;boop|&byte>>blip"),
    ["beep", { op: ";;" }, "boop", { op: "|&" }, "byte", { op: ">>" }, "blip"],
  );

  assertEquals(parse("beep 2>&1"), ["beep", "2", { op: ">&" }, "1"]);

  assertEquals(
    parse("beep<(boop)"),
    ["beep", { op: "<(" }, "boop", { op: ")" }],
  );
  assertEquals(
    parse("beep<<(boop)"),
    ["beep", { op: "<" }, { op: "<(" }, "boop", { op: ")" }],
  );
});

Deno.test("glob patterns", () => {
  assertEquals(
    parse("tap test/*.test.js"),
    ["tap", { op: "glob", pattern: "test/*.test.js" }],
  );

  assertEquals(parse('tap "test/*.test.js"'), ["tap", "test/*.test.js"]);
});

Deno.test("parse shell commands", () => {
  assertEquals(parse('"a \\" b"'), ['a " b']);
  assertEquals(parse("'a \\\" b'"), ['a \\" b']);
  assertEquals(parse("a 'b' \"c\""), ["a", "b", "c"]);
  assertEquals(
    parse('beep "boop" \'foo bar baz\' "it\'s \\"so\\" groovy"'),
    ["beep", "boop", "foo bar baz", 'it\'s "so" groovy'],
  );
  assertEquals(parse("a b\\ c d"), ["a", "b c", "d"]);
  assertEquals(parse("\\$beep bo\\`op"), ["$beep", "bo`op"]);
  assertEquals(parse('echo "foo = \\"foo\\""'), ["echo", 'foo = "foo"']);
  assertEquals(parse(""), []);
  assertEquals(parse(" "), []);
  assertEquals(parse("\t"), []);
  assertEquals(parse('a"b c d"e'), ["ab c de"]);
  assertEquals(parse('a\\ b"c d"\\ e f'), ["a bc d e", "f"]);
  assertEquals(parse("a\\ b\"c d\"\\ e'f g' h"), ["a bc d ef g", "h"]);
  assertEquals(parse("x \"bl'a\"'h'"), ["x", "bl'ah"]);
  assertEquals(parse("x bl^'a^'h'", {}, { escape: "^" }), ["x", "bl'a'h"]);
});

Deno.test("quote", () => {
  assertEquals(quote(["a", "b", "c d"]), "a b 'c d'");
  assertEquals(
    quote(["a", "b", 'it\'s a "neat thing"']),
    'a b "it\'s a \\"neat thing\\""',
  );
  assertEquals(
    quote(["$", "`", "'"]),
    '\\$ \\` "\'"',
  );
  assertEquals(quote([]), "");
  assertEquals(quote(["a '\" b"]), '"a \'\\" b"');
  assertEquals(quote(['a \\" b']), "'a \\\" b'");
  assertEquals(quote(["a\nb"]), "'a\nb'");
  assertEquals(quote([" #(){}*|][!"]), "' #(){}*|][!'");
  assertEquals(quote(["'#(){}*|][!"]), '"\'#(){}*|][\\!"');
  assertEquals(quote(["X#(){}*|][!"]), "X\\#\\(\\)\\{\\}\\*\\|\\]\\[\\!");
  assertEquals(quote(["a\n#\nb"]), "'a\n#\nb'");
  assertEquals(quote(["><;{}"]), "\\>\\<\\;\\{\\}");
  assertEquals(quote(["a", 1, true, false]), "a 1 true false");
  assertEquals(quote(["a", 1, null, undefined]), "a 1 null undefined");
  assertEquals(quote(["a\\x"]), "a\\\\x");
});

Deno.test("quote ops", () => {
  assertEquals(quote(["a", { op: "|" }, "b"]), "a \\| b");
  assertEquals(
    quote(["a", { op: "&&" }, "b", { op: ";" }, "c"]),
    "a \\&\\& b \\; c",
  );
});

Deno.test("set", () => {
  assertEquals(
    parse("ABC=444 x y z"),
    ["ABC=444", "x", "y", "z"],
  );
  assertEquals(
    parse("ABC=3\\ 4\\ 5 x y z"),
    ["ABC=3 4 5", "x", "y", "z"],
  );
  assertEquals(
    parse('X="7 8 9" printx'),
    ["X=7 8 9", "printx"],
  );
  assertEquals(
    parse('X="7 8 9"; printx'),
    ["X=7 8 9", { op: ";" }, "printx"],
  );
  assertEquals(
    parse('X="7 8 9"; printx', function () {
      throw new Error("should not have matched any keys");
    }),
    ["X=7 8 9", { op: ";" }, "printx"],
  );
});
