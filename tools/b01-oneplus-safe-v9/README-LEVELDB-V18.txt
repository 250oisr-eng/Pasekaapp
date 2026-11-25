PASEKA B01 V18 / INDEXEDDB LEVELDB LOG PHYSICAL CRC32C CHECK
================================================================

SCOPE: Offline PC-only verification of the physical checksums and fragment
boundaries of existing LevelDB *.log journal files under app_webview's
IndexedDB directories. This test does NOT decode keys, records, values or
schema and does NOT open an IndexedDB database. It is not an app restore.

ONE TEST / NO OLD TEST PACKAGES
1. Extract the independent V18 ZIP to a NEW local Windows folder.
2. Double-click START.cmd; no Android phone, ADB or Wi-Fi needed.
3. Send ONLY B01-RESULT.json beside START.cmd. DO NOT share .log files,
   original tar, user folders, manifest, source app data or screenshots.

This package finds the latest persistent V16 pc-reconstruction-<GUID>
under %USERPROFILE%\PASEKA-B01-KEEP-PRIVATE-CANDIDATES\. The original
V16 reconstruction and candidate must remain preserved (do not delete).
The program rejects reparse/symlink/junction paths, incomplete
reconstructions, nonlocal drives and oversized trees. It reads data in
32-KiB bounded RAM buffers, checks the LevelDB log header's masked CRC32C
(type + payload), fragmentation and record boundaries. It never prints
or sends byte payloads, file paths, keys or record values.

CRITICAL EVIDENCE LIMITS:
- CRC PASS means ONLY that each scanned LevelDB physical log record was
  syntactically complete and matched its CRC32C. It does not validate
  MANIFEST contents, SSTables, logical database key/value state,
  application migrations, WebView/Android reopen or media completeness.
- It does not prove all journal files or database origins on the PHONE
  were captured, nor full backup or independent restore.
- A CRC failure may indicate damaged or actively written snapshot and
  does NOT authorize changes to app, logs, videos, backups or phone.
- The program reads PRIVATE raw journal bytes on the local PC but never
  interprets records. Protect both original and reconstructed archives.
- Only one sanitized B01-RESULT.json is created in the fresh test folder;
  an existing one is never replaced. No outbound network connection.

B01 remains BLOCKED until a functioning IndexedDB/Android restore on an
isolated clean destination and exhaustive media/backup coverage are proven.
No installs, uninstall, clear, original-video deletion or production writes.
