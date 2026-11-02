param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$speech=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speech.SetOutputToWaveFile($OutputFile)
    $speech.Speak([IO.File]::ReadAllText($TextFile,[Text.Encoding]::UTF8))
} finally {
    $speech.Dispose()
}
