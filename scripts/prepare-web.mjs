import { mkdir, copyFile } from "node:fs/promises";
await mkdir("www", { recursive: true });
await mkdir("www/icons", { recursive: true });
await mkdir("www/js", { recursive: true });
for (const file of ["index.html", "manifest.webmanifest", "sw.js"]) {
  await copyFile(file, `www/${file}`);
}

await copyFile("icons/paseka.svg", "www/icons/paseka.svg");
await copyFile("js/voice-command-parser.js", "www/js/voice-command-parser.js");
