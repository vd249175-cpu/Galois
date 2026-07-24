# Galois Windows Setup & Installer Wizard
# Automatically checks the environment, installs dependencies, reminds of proxy requirements, and creates a desktop shortcut.

Clear-Host
$ErrorActionPreference = "Stop"

# Define colors
$cyan = "Cyan"
$green = "Green"
$yellow = "Yellow"
$red = "Red"
$white = "White"

Write-Host "=========================================================" -ForegroundColor $cyan
Write-Host "        🧬 Galois Workspace Setup Wizard 🧬" -ForegroundColor $cyan
Write-Host "=========================================================" -ForegroundColor $cyan
Write-Host ""

# ──────────────────────────────────────────────────────────────────────────
# STEP 1: Proxy & TUN Mode Reminder
# ──────────────────────────────────────────────────────────────────────────
Write-Host "┌────────────────────────────────────────────────────────┐" -ForegroundColor $yellow
Write-Host "│  ⚠️  重要网络配置提醒 / IMPORTANT NETWORK SETUP NOTICE   │" -ForegroundColor $yellow
Write-Host "├────────────────────────────────────────────────────────┤" -ForegroundColor $yellow
Write-Host "│  请在安装与后续使用前，务必确认已开启以下网络设置：    │" -ForegroundColor $white
Write-Host "│                                                        │" -ForegroundColor $white
Write-Host "│  1. 全局代理模式 (Global Proxy Mode)                   │" -ForegroundColor $white
Write-Host "│  2. 虚拟网卡代理模式 (TUN 模式 / Enhance Mode)          │" -ForegroundColor $white
Write-Host "│                                                        │" -ForegroundColor $white
Write-Host "│  说明：若未开启 TUN 模式，Python 环境同步 (uv sync)、  │" -ForegroundColor $yellow
Write-Host "│  npm 依赖下载以及大模型 API 的请求可能会因网络拦截失败。│" -ForegroundColor $yellow
Write-Host "└────────────────────────────────────────────────────────┘" -ForegroundColor $yellow
Write-Host ""

$confirm = Read-Host "我已开启全局代理和虚拟网卡 (TUN) 模式，继续安装？[Y/N]"
if ($confirm.Trim().ToUpper() -ne "Y") {
    Write-Host "❌ 安装已中止。请配置好代理环境后再运行本程序。" -ForegroundColor $red
    Exit 1
}

Write-Host ""
Write-Host "🚀 开始进行系统环境检测..." -ForegroundColor $cyan
Write-Host "---------------------------------------------------------"

# ──────────────────────────────────────────────────────────────────────────
# STEP 2: Node.js Check
# ──────────────────────────────────────────────────────────────────────────
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCheck) {
    Write-Host "❌ 错误: 未检测到 Node.js 环境！" -ForegroundColor $red
    Write-Host "请前往 https://nodejs.org/ 下载并安装 Node.js LTS 版本，然后再重新运行此安装程序。" -ForegroundColor $yellow
    Read-Host "按回车键退出..."
    Exit 1
} else {
    $nodeVersion = &(node -v)
    Write-Host "✅ 检测到 Node.js ($nodeVersion) 环境。" -ForegroundColor $green
}

# ──────────────────────────────────────────────────────────────────────────
# STEP 3: Astral uv Check & Installation
# ──────────────────────────────────────────────────────────────────────────
$uvCheck = Get-Command uv -ErrorAction SilentlyContinue
$localUvPath = Join-Path $env:USERPROFILE ".local\bin\uv.exe"
$appDataUvPath = Join-Path $env:APPDATA "astral\uv\uv.exe"
$uvExists = ($null -ne $uvCheck) -or (Test-Path $localUvPath) -or (Test-Path $appDataUvPath)

if (-not $uvExists) {
    Write-Host "⚠️  未检测到 Astral uv (Python 依赖管理工具)！" -ForegroundColor $yellow
    Write-Host "正在自动为您安装 Astral uv (官方推荐安装方式)..." -ForegroundColor $cyan
    try {
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
        $env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
        Write-Host "✅ Astral uv 安装成功！" -ForegroundColor $green
    } catch {
        Write-Host "❌ 自动安装 uv 失败，这可能是由于网络代理不稳定导致。" -ForegroundColor $red
        Write-Host "您可以稍后手动在终端中运行以下命令安装：" -ForegroundColor $yellow
        Write-Host "powershell -c `"irm https://astral.sh/uv/install.ps1 | iex`"" -ForegroundColor $yellow
    }
} else {
    if (Test-Path $localUvPath) {
        $env:PATH = "$env:USERPROFILE\.local\bin;" + $env:PATH
    }
    Write-Host "✅ 检测到 Astral uv 环境。" -ForegroundColor $green
}

# ──────────────────────────────────────────────────────────────────────────
# STEP 4: Install Project Dependencies (npm install)
# ──────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "📦 正在安装项目 npm 依赖，请稍候..." -ForegroundColor $cyan
Write-Host "---------------------------------------------------------"
try {
    # Set progress bar visibility off for speed
    $ProgressPreference = 'SilentlyContinue'
    npm install
    Write-Host "✅ npm 依赖安装完成！" -ForegroundColor $green
} catch {
    Write-Host "❌ npm install 失败。请检查您的网络代理设置后重试。" -ForegroundColor $red
    Read-Host "按回车键退出..."
    Exit 1
}

# ──────────────────────────────────────────────────────────────────────────
# STEP 5: Compile / Build the Application
# ──────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🏗️  正在编译并构建 Galois 项目..." -ForegroundColor $cyan
Write-Host "---------------------------------------------------------"
try {
    npm run build
    Write-Host "✅ Galois 编译成功！" -ForegroundColor $green
} catch {
    Write-Host "❌ 编译项目时出错，请查看上方编译报错信息。" -ForegroundColor $red
    Read-Host "按回车键退出..."
    Exit 1
}

# ──────────────────────────────────────────────────────────────────────────
# STEP 6: Create Desktop Shortcut
# ──────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "🖥️  正在为您创建桌面快捷方式..." -ForegroundColor $cyan
Write-Host "---------------------------------------------------------"
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Galois Workspace.lnk"
    
    $Shortcut = $WshShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = Join-Path $PWD "run.cmd"
    $Shortcut.WorkingDirectory = $PWD
    $Shortcut.Description = "启动 Galois 知识工作台"
    
    $icoPath = Join-Path $PWD "assets\app-icon.ico"
    if (Test-Path $icoPath) {
        $Shortcut.IconLocation = $icoPath
    }
    
    $Shortcut.Save()
    Write-Host "✅ 快捷方式 'Galois Workspace' 已成功保存至您的桌面！" -ForegroundColor $green
} catch {
    Write-Host "⚠️  创建快捷方式失败：" $_.Exception.Message -ForegroundColor $yellow
}

# ──────────────────────────────────────────────────────────────────────────
# Setup Completion
# ──────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================================" -ForegroundColor $green
Write-Host "        🎉 Galois 安装配置已全部圆满完成！ 🎉" -ForegroundColor $green
Write-Host "=========================================================" -ForegroundColor $green
Write-Host "您现在可以直接双击桌面上的 [Galois Workspace] 图标启动该软件。" -ForegroundColor $white
Write-Host "祝您使用愉快！" -ForegroundColor $cyan
Write-Host ""
Read-Host "按回车键完成退出..."
