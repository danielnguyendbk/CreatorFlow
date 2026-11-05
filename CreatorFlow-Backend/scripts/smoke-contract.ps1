param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$EvidenceFile = 'storage/e2e-evidence-v2-p0-reliability.json'
)
$ErrorActionPreference = 'Stop'
if (-not $env:CREATORFLOW_API_TOKEN) { throw 'CREATORFLOW_API_TOKEN is required' }
$headers = @{ Authorization = "Bearer $env:CREATORFLOW_API_TOKEN" }
function ExpectStatus([scriptblock]$action, [int]$expected) {
    try {
        $response = & $action
        $actual = [int]$response.StatusCode
    } catch [System.Net.WebException] {
        $actual = [int]$_.Exception.Response.StatusCode
    }
    if ($actual -ne $expected) { throw "Expected HTTP $expected, got $actual" }
}

$paths = @(
    '/api/ideas', '/api/contents', '/api/contents/dashboard-stats',
    '/api/assets', '/api/assets/inbox', '/api/assets/pending-flow-scenes',
    '/api/workflows', '/api/render-jobs', '/api/publication-jobs',
    '/api/activity', '/api/settings'
)
foreach ($path in $paths) {
    ExpectStatus { Invoke-WebRequest -Uri "$BaseUrl$path" -Headers $headers -UseBasicParsing } 200
}
ExpectStatus { Invoke-WebRequest -Uri "$BaseUrl/api/ideas" -UseBasicParsing } 401
ExpectStatus { Invoke-WebRequest -Uri "$BaseUrl/api/ideas" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing } 401
ExpectStatus { Invoke-WebRequest -Uri "$BaseUrl/api/ideas" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -UseBasicParsing } 400

$settings = Invoke-RestMethod -Uri "$BaseUrl/api/settings" -Headers $headers
if ($settings.PSObject.Properties.Name -contains 'apiKey' -or $settings.PSObject.Properties.Name -contains 'refreshToken') {
    throw 'Settings exposed a secret field'
}

if (Test-Path -LiteralPath $EvidenceFile) {
    $evidence = Get-Content -LiteralPath $EvidenceFile -Raw | ConvertFrom-Json
    ExpectStatus { Invoke-WebRequest -Uri "$BaseUrl/api/storyboards/by-content/$($evidence.contentId)" -Headers $headers -UseBasicParsing } 200
    $media = "$BaseUrl/api/assets/$($evidence.finalAssetId)/download"
    ExpectStatus { Invoke-WebRequest -Uri $media -UseBasicParsing } 401
    $download = Invoke-WebRequest -Uri $media -Headers $headers -UseBasicParsing
    if ($download.StatusCode -ne 200 -or $download.Headers.'Content-Type' -notlike 'video/mp4*') { throw 'Authenticated media download failed' }
}
Write-Output "HTTP contract PASS: $($paths.Count) list/settings routes, auth/validation and optional storyboard/media"
