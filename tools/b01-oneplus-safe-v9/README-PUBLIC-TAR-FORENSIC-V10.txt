PASEKA B01 — OFFLINE PUBLIC TAR FORENSICS V10 (Windows PowerShell 5.1)

PURPOSE: investigate the existing V9.1 public TAR failure
PUBLIC_TAR_INVALID_TAR_BLOCK_ALIGNMENT_OR_LENGTH_INVALID
without a second USB transfer, without phone access and without reading user data.

1. Copy ONLY B01-PUBLIC-TAR-FORENSIC-V10.ps1 and
   START-PUBLIC-FORENSIC-ONLY.cmd into your ORIGINAL extracted
   V9.1 folder (beside START.cmd), where results/run-*/public-only-v9.tar
   was created. Do not move or edit TAR files.
2. Double-click START-PUBLIC-FORENSIC-ONLY.cmd.
3. If no old public-only-v9.tar is found, paste the full local path
   of THAT FILE ONLY into the PowerShell prompt. Never select
   private-candidate*.tar or any personal document.
4. Share ONLY the new forensics-results/public-tar-v10-*.json.
   The script never includes an archive filename path, member name, stderr text,
   raw bytes or system build.prop values in the JSON. Do not upload TARs.
5. If it reports BLOCKED, do not try another private capture.

This script NEVER invokes adb, checks the phone, accesses private app data,
extracts archives, modifies or deletes the source file, installs APKs or
connects to a network. Any presented file must literally be named
public-only-v9.tar and live under results/run-*.
This is a forensic triage of a PUBLIC system-file archive only.
The report itself does NOT validate independent recovery or full backup.
