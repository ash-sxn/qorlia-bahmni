import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/README.md",
  "docs/developer-start-here.md",
  "docs/setup-guide.md",
  "docs/architecture.md",
  "docs/project-structure.md",
  "docs/module-guide.md",
  "docs/api-integration-guide.md",
  "docs/testing-guide.md",
  "docs/team-workflow.md",
  "docs/first-contribution.md",
  "docs/task-brief-template.md",
];
let links = 0;
for (const name of files) {
  const source = fs.readFileSync(path.join(root, name), "utf8");
  assert(!source.includes("\u2014"), `No em dashes in ${name}`);
  for (const match of source.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^https?:\/\//.test(target)) continue;
    const [relative, anchor] = target.split("#");
    const resolved = path.resolve(
      root,
      path.dirname(name),
      relative || path.basename(name),
    );
    assert(
      resolved.startsWith(root + path.sep),
      `Repository-local link required: ${name}: ${target}`,
    );
    assert(fs.existsSync(resolved), `Missing link in ${name}: ${target}`);
    if (anchor) {
      const headings = [
        ...fs.readFileSync(resolved, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm),
      ].map((value) =>
        value[1]
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s/g, "-"),
      );
      assert(
        headings.includes(anchor),
        `Missing heading in ${name}: ${target}`,
      );
    }
    links += 1;
  }
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const name of files.filter((name) => name !== "README.md"))
  assert(readme.includes(`](${name})`), `README must reach ${name}`);
stdout.write(
  JSON.stringify({
    contributorDocuments: files.length,
    localLinksChecked: links,
    noEmDashes: true,
  }) + "\n",
);
