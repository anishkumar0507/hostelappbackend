# Stop server running on port 5000
Write-Host "Stopping server on port 5000..." -ForegroundColor Yellow

$processes = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess

if ($processes) {
    $processes | ForEach-Object {
        Stop-Process -Id $_ -Force
        Write-Host "Stopped process: $_" -ForegroundColor Green
    }
    Write-Host "Server stopped successfully!" -ForegroundColor Green
} else {
    Write-Host "No server found running on port 5000" -ForegroundColor Cyan
}
