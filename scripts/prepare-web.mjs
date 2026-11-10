import { mkdir, copyFile } from "node:fs/promises";
await mkdir("www", { recursive: true });
for (const file of ["index.html", "manifest.webmanifest", "sw.js"]) {
  await copyFile(file, `www/${file}`);
}
