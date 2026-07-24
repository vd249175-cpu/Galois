# Galois Windows Starter Script - Automatically check dependencies and run the app

Clear-Host
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "        🧬 DNOTE Bionic Workspace 🧬" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

# 1. Check Node.js
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCheck) {
    Write-Host "❌ Error: Node.js was not detected in your system!" -ForegroundColor Red
    Write-Host "Please download and install it from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    Exit 1
}

# 1.5 Check Astral uv (Python environment tool)
$uvCheck = Get-Command uv -ErrorAction SilentlyContinue
$localUvPath = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
$appDataUvPath = Join-Path $env:APPDATA "astral\uv\uv.exe"
$uvExists = ($null -ne $uvCheck) -or (Test-Path $localUvPath) -or (Test-Path $appDataUvPath)

if (-not $uvExists) {
    Write-Host "⚠️ Warning: Astral uv (Python environment manager) was not detected!" -ForegroundColor Yellow
    Write-Host "DNOTE graph calculations and Python scripts depend on uv."
    Write-Host "-------------------------------------------"
    Write-Host "Would you like to install uv now?"
    Write-Host "1) Official PowerShell installation (Recommended)"
    Write-Host "2) Skip (Install manually later)"
    
    $choice = Read-Host "Please enter an option [1-2]"
    if ($choice -eq "1") {
        Write-Host "📦 Installing uv via official PowerShell script..." -ForegroundColor Cyan
        powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
        # Refresh path
        $env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
    } else {
        Write-Host "⏭️ Skipped uv installation." -ForegroundColor Yellow
    }
} else {
    # Ensure uv is in path if installed locally
    if (Test-Path $localUvPath) {
        $env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
    }
    Write-Host "✅ Astral uv environment check passed." -ForegroundColor Green
}

# 2. Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 First-time setup: Installing project dependencies (node_modules)..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error: npm install failed. Please resolve errors manually." -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        Exit 1
    }
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
} else {
    Write-Host "✅ Dependencies check passed (node_modules exists)." -ForegroundColor Green
}

# 3. Run development service
Write-Host "🚀 Launching Galois HMR dev server and Electron app..." -ForegroundColor Green
npm run dev
