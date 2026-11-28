# Convert one .docx to PDF with the installed Microsoft Word (no extra software).
# Called by drive-upload.mjs: iPhones can't reliably show a .docx in Google
# Drive (Drive converts it page by page and fails on image-heavy modules), so
# students get the PDF link. Read-only open; Word is always closed afterwards.
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open((Resolve-Path $Src).Path, $false, $true)
  try { $doc.ExportAsFixedFormat($Out, 17) } finally { $doc.Close($false) }
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
if (-not (Test-Path $Out)) { throw "Word did not write $Out" }
Write-Output $Out
