param(
  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$Mood,

  [Parameter(Mandatory = $true)]
  [string]$Tags,

  [Parameter(Mandatory = $true)]
  [string]$Content
)

$diaryFile = Join-Path $PSScriptRoot "..\content\diaries.json"
$data = Get-Content -Raw -Encoding UTF8 $diaryFile | ConvertFrom-Json

$today = Get-Date -Format "yyyy-MM-dd"
$slug = ($Title.ToLower() -replace "[^a-z0-9\u4e00-\u9fa5]+", "-").Trim("-")
if ([string]::IsNullOrWhiteSpace($slug)) {
  $slug = [guid]::NewGuid().ToString().Substring(0, 8)
}

$entryId = "$today-$slug"
$tagList = $Tags.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
$contentList = $Content.Split("|") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

$newEntry = [PSCustomObject]@{
  id = $entryId
  date = $today
  mood = $Mood
  title = $Title
  tags = $tagList
  content = $contentList
}

$data.entries += $newEntry
$data.entries = @($data.entries | Sort-Object date -Descending)

$data | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $diaryFile

Write-Output "新增日记完成：$entryId"
Write-Output "请检查 content/diaries.json 内容并按需微调文案。"
