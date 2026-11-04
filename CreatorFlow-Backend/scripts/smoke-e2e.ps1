param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$Ffprobe = 'ffprobe',
    [string]$EvidenceFile = 'storage/e2e-evidence.json'
)
$ErrorActionPreference = 'Stop'
if (-not $env:CREATORFLOW_API_TOKEN) { throw 'CREATORFLOW_API_TOKEN is required' }
$headers = @{ Authorization = "Bearer $env:CREATORFLOW_API_TOKEN" }
function PostJson([string]$route, [object]$payload) {
    return Invoke-RestMethod -Uri "$BaseUrl$route" -Method Post -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 10)
}
function GetJson([string]$route) { return Invoke-RestMethod -Uri "$BaseUrl$route" -Headers $headers }
function ExpectHttp([scriptblock]$action, [int]$expected) {
    try { & $action | Out-Null; throw "Expected HTTP $expected" }
    catch [System.Net.WebException] {
        $actual = [int]$_.Exception.Response.StatusCode
        if ($actual -ne $expected) { throw "Expected HTTP $expected, got $actual" }
    }
}

$idea = PostJson '/api/ideas' @{ title='E2E sample'; hook='A short narrated sample'; category='OTHER'; format='EXPLAINER'; estimatedDurationSec=15; language='en'; niche='smoke'; notes='Synthetic fixture' }
$content = PostJson '/api/contents' @{ title='E2E sample'; topic='CreatorFlow test'; niche='smoke'; language='en'; ideaId=[string]$idea.id }
$board = PostJson '/api/storyboards' @{ contentId=[string]$content.id; title='E2E storyboard'; scenes=@(@{ durationSec=15; narration='This is a CreatorFlow end to end test with real voice and subtitles.'; visualType='IMAGE'; prompt='A simple test slide' }) }
$workflow = PostJson '/api/workflows' @{ contentId=[string]$content.id }
ExpectHttp { PostJson "/api/workflows/$($workflow.id)/resume" @{} } 409

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(720,1280)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(20,38,62))
$font = New-Object System.Drawing.Font('Arial',32)
$graphics.DrawString('CreatorFlow E2E', $font, [System.Drawing.Brushes]::White, 70, 500)
$imagePath = [IO.Path]::Combine([IO.Path]::GetTempPath(),[Guid]::NewGuid().ToString('N') + '.png')
try { $bitmap.Save($imagePath,[System.Drawing.Imaging.ImageFormat]::Png) }
finally { $graphics.Dispose(); $font.Dispose(); $bitmap.Dispose() }

try {
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$env:CREATORFLOW_API_TOKEN)
    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $media = [System.Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes($imagePath))
    $media.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('image/png')
    $multipart.Add($media,'file','sample.png')
    $multipart.Add([System.Net.Http.StringContent]::new([string]$content.id),'contentId')
    $multipart.Add([System.Net.Http.StringContent]::new([string]$board.scenes[0].id),'sceneId')
    $response = $client.PostAsync("$BaseUrl/api/assets",$multipart).GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) { throw "Upload HTTP $([int]$response.StatusCode)" }
    $asset = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
} finally { Remove-Item -LiteralPath $imagePath -ErrorAction SilentlyContinue }

$voice = PostJson "/api/contents/$($content.id)/voice" @{}
$workflow = PostJson "/api/workflows/$($workflow.id)/resume" @{}
$render = PostJson '/api/render-jobs' @{ contentId=[string]$content.id }
$duplicate = PostJson '/api/render-jobs' @{ contentId=[string]$content.id }
if ($duplicate.id -ne $render.id) { throw 'Duplicate render job created' }
$deadline = (Get-Date).AddMinutes(4)
do {
    Start-Sleep -Seconds 2
    $render = GetJson "/api/render-jobs/$($render.id)"
    if ($render.status -eq 'FAILED') { throw "Render failed: $($render.error)" }
    if ((Get-Date) -gt $deadline) { throw 'Render timed out' }
} until ($render.status -eq 'SUCCESS')
$finalAsset = GetJson "/api/assets/$($render.outputAssetId)"
$videoPath = Join-Path (Split-Path -Parent $EvidenceFile) 'e2e-output.mp4'
Invoke-WebRequest -Uri "$BaseUrl$($finalAsset.url)" -Headers $headers -UseBasicParsing -OutFile $videoPath | Out-Null
$probe = & $Ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name -of json $videoPath | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or [double]$probe.format.duration -lt 15 -or [double]$probe.format.duration -gt 30) { throw 'Invalid MP4 duration' }
$types = @($probe.streams | ForEach-Object codec_type)
foreach ($required in @('video','audio','subtitle')) { if ($types -notcontains $required) { throw "Missing $required stream" } }
$publication = PostJson '/api/publication-jobs' @{ contentId=[string]$content.id; platform='YOUTUBE_SHORTS'; scheduledAt=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o'); caption='Synthetic fixture'; title='E2E sample'; hashtags=@('smoke','creatorflow') }
ExpectHttp { PostJson "/api/publication-jobs/$($publication.id)/publish-now" @{} } 409
$publication = PostJson "/api/publication-jobs/$($publication.id)/approve" @{}
ExpectHttp { PostJson "/api/publication-jobs/$($publication.id)/publish-now" @{} } 503
$publication = GetJson "/api/publication-jobs/$($publication.id)"
if ($publication.status -ne 'FAILED' -or $publication.platformPostId -or $publication.error -notlike 'NOT_CONFIGURED*') { throw 'Publication did not fail closed' }
$evidence = @{ ideaId=$idea.id; contentId=$content.id; storyboardId=$board.id; sceneId=$board.scenes[0].id; assetId=$asset.id; voiceAssetId=$voice.assetId; workflowId=$workflow.id; renderJobId=$render.id; finalAssetId=$finalAsset.id; publicationId=$publication.id; durationSec=[double]$probe.format.duration; mediaStreams=$types; publicationStatus=$publication.status }
$target = Join-Path (Get-Location) $EvidenceFile
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
$evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $target -Encoding UTF8
Write-Output "E2E PASS: $($render.id), $($probe.format.duration)s, streams: $($types -join ', ')"
