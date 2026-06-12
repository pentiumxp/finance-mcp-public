---
name: windows-utf8-safe-editing
description: Use when editing text files on Windows, especially from PowerShell, when files may contain Chinese or other non-ASCII text, when changing static version strings, or when doing bulk textual rewrites. Prevents BOM insertion, mojibake, and accidental whole-file encoding churn.
---

# Windows UTF-8 Safe Editing

Use this skill before editing files on Windows when any target file may contain non-ASCII text, or when a command would read and rewrite a whole text file.

## Hard Rules

- Prefer `apply_patch` for manual edits, even for version-string changes.
- Do not use Windows PowerShell 5.1 `Get-Content | Set-Content`, `(Get-Content) -replace ... | Set-Content`, `Out-File`, or `Add-Content` to rewrite source files that may contain non-ASCII text.
- Do not use `Set-Content -Encoding utf8` on Windows PowerShell 5.1 for source rewrites; it writes UTF-8 with BOM and can corrupt non-ASCII text during round-trip.
- Do not pipe scripts containing Chinese path literals or source text through PowerShell stdin.
- If a bulk rewrite is unavoidable, use a deterministic UTF-8 no-BOM writer and verify before continuing.

## Safe Patterns

For small or targeted source edits:

```text
Use apply_patch.
```

For a mechanical whole-file rewrite when `apply_patch` is impractical:

```powershell
$path = "relative-or-absolute-path"
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$text = $text.Replace("old-ascii-token", "new-ascii-token")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
```

Only use that pattern when the replacement tokens are ASCII or already known-safe Unicode literals. Prefer a checked-in script for repeated operations.

## Required Verification

After any Windows text rewrite on files that may contain non-ASCII:

1. Check BOM on edited files:

```powershell
$files = @("path1", "path2")
foreach ($p in $files) {
  $b = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $p))
  [pscustomobject]@{ path = $p; first3 = (($b[0..([Math]::Min(2, $b.Length - 1))]) -join " ") }
}
```

UTF-8 BOM is `239 187 191`; it should not appear unless the file already intentionally used BOM.

2. Run syntax checks for changed JS/JSON/HTML-adjacent files where available, for example:

```powershell
node --check path\to\file.js
```

3. Inspect the focused diff:

```powershell
git diff -- path\to\file
git diff --check
```

If the diff shows unrelated mojibake changes, restore the file from git and redo the edit with `apply_patch` or UTF-8 no-BOM APIs.

## Recovery

If corruption is detected:

- For tracked files, restore only the damaged file from the last good commit, then reapply the intended change with `apply_patch`.
- Do not run broad destructive git commands.
- Preserve unrelated user changes and untracked files.
