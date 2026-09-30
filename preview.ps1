param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$PreviewRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$PreviewRootPrefix = $PreviewRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$PreviewAddress = "http://127.0.0.1:$Port/?demo=1"
$MimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.csv'  = 'text/csv; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function Write-HttpResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType,
    [bool]$IncludeBody = $true
  )

  $Headers = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Headers)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  if ($IncludeBody -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
  $Listener.Start()
} catch {
  throw "Unable to start local preview on port $Port. The port may be in use; try .\preview.ps1 -Port 8766."
}

Write-Host ''
Write-Host 'DrugScope local preview is running.' -ForegroundColor Green
Write-Host "URL: $PreviewAddress"
Write-Host 'The page automatically loads clearly labeled demo data.'
Write-Host 'Press Ctrl+C to stop the server.'
Write-Host ''

if (-not $NoBrowser) {
  Start-Process $PreviewAddress
}

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    $Reader = $null
    $Stream = $null
    try {
      $Stream = $Client.GetStream()
      $Reader = [System.IO.StreamReader]::new($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($RequestLine)) { continue }

      while (-not [string]::IsNullOrEmpty($Reader.ReadLine())) { }
      $RequestParts = $RequestLine.Split(' ')
      if ($RequestParts.Length -lt 2 -or $RequestParts[0] -notin @('GET', 'HEAD')) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
        Write-HttpResponse -Stream $Stream -StatusCode 405 -StatusText 'Method Not Allowed' -Body $Body -ContentType 'text/plain; charset=utf-8'
        continue
      }

      $RequestUri = [System.Uri]::new("http://127.0.0.1:$Port$($RequestParts[1])")
      $RelativePath = [System.Uri]::UnescapeDataString($RequestUri.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($RelativePath)) { $RelativePath = 'index.html' }
      $RelativePath = $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $CandidatePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PreviewRoot, $RelativePath))

      if (-not $CandidatePath.StartsWith($PreviewRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        Write-HttpResponse -Stream $Stream -StatusCode 403 -StatusText 'Forbidden' -Body $Body -ContentType 'text/plain; charset=utf-8'
        continue
      }
      if ([System.IO.Directory]::Exists($CandidatePath)) {
        $CandidatePath = [System.IO.Path]::Combine($CandidatePath, 'index.html')
      }
      if (-not [System.IO.File]::Exists($CandidatePath)) {
        $Body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        Write-HttpResponse -Stream $Stream -StatusCode 404 -StatusText 'Not Found' -Body $Body -ContentType 'text/plain; charset=utf-8' -IncludeBody ($RequestParts[0] -eq 'GET')
        continue
      }

      $Body = [System.IO.File]::ReadAllBytes($CandidatePath)
      $Extension = [System.IO.Path]::GetExtension($CandidatePath).ToLowerInvariant()
      $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { 'application/octet-stream' }
      Write-HttpResponse -Stream $Stream -StatusCode 200 -StatusText 'OK' -Body $Body -ContentType $ContentType -IncludeBody ($RequestParts[0] -eq 'GET')
    } catch {
      Write-Warning "Request failed: $($_.Exception.Message)"
    } finally {
      if ($null -ne $Reader) { $Reader.Dispose() }
      if ($null -ne $Stream) { $Stream.Dispose() }
      $Client.Dispose()
    }
  }
} finally {
  $Listener.Stop()
}
