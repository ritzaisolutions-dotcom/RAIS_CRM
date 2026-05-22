const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const fail = (msg) => {
  console.error(`VALIDATION FAILED: ${msg}`);
  process.exit(1);
};

const count = (needle) => html.split(needle).length - 1;

expectOne("<!DOCTYPE html>", "doctype");
expectOne('<html lang="de">', "html shell");
expectOne("<head>", "head");
expectOne("<body>", "body");

function expectOne(needle, label) {
  const n = count(needle);
  if (n !== 1) fail(`${label} count is ${n}, expected 1`);
}

// Count all opening script tags (with or without attributes)
const scriptOpen = (html.match(/<script[\s>]/g) || []).length;
const scriptClose = count("</script>");
if (scriptOpen !== scriptClose) {
  fail(`script tag mismatch: ${scriptOpen} opens vs ${scriptClose} closes`);
}

const brokenDoctype = count("\nDOCTYPE html>");
if (brokenDoctype) {
  fail(`found ${brokenDoctype} broken doctype fragment(s)`);
}

// Verify the main module script block exists and is non-empty
const moduleScripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1].trim());
if (!moduleScripts.length) fail("no inline module script found");
moduleScripts.forEach((script, idx) => {
  if (!script.length) fail(`inline module script ${idx + 1} is empty`);
});

console.log("Static CRM validation passed.");
