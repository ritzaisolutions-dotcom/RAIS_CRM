const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const fail = (msg) => {
  console.error(`VALIDATION FAILED: ${msg}`);
  process.exit(1);
};

const count = (needle) => html.split(needle).length - 1;
const expectOne = (needle, label) => {
  const n = count(needle);
  if (n !== 1) fail(`${label} count is ${n}, expected 1`);
};

expectOne("<!DOCTYPE html>", "doctype");
expectOne('<html lang="de">', "html shell");
expectOne("<head>", "head");
expectOne("<body>", "body");

const scriptOpen = count("<script>");
const scriptClose = count("</script>");
if (scriptOpen !== scriptClose) {
  fail(`script tag mismatch: ${scriptOpen} opens vs ${scriptClose} closes`);
}

const brokenDoctype = count("\nDOCTYPE html>");
if (brokenDoctype) {
  fail(`found ${brokenDoctype} broken doctype fragment(s)`);
}

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!inlineScripts.length) fail("no inline scripts found");

inlineScripts.forEach((script, idx) => {
  try {
    new Function(script);
  } catch (err) {
    fail(`inline script ${idx + 1} parse error: ${err.message}`);
  }
});

console.log("Static CRM validation passed.");
