!macro customInit
  MessageBox MB_OK|MB_ICONINFORMATION "重要网络配置提醒 / Important Network Setup Notice:$\r$\n$\r$\n使用本软件前，请务必在您的系统中开启以下服务：$\r$\n1. 全局代理 (Global Proxy)$\r$\n2. 虚拟网卡 (TUN) 模式 (例如 Clash 的 Tun 模式)$\r$\n$\r$\n由于本软件依赖 Python 运行时、npm 依赖自动下载以及 LLM API 网络通信，若未开启 TUN 模式，环境部署及大模型连接可能会因网络受限而失败。"
!macroend

!macro customInstall
  DetailPrint "🧬 开始进行 Galois 环境自动配置..."
  
  ; 1. 检查 Node.js 环境
  DetailPrint "正在检测 Node.js..."
  nsExec::ExecToStack 'cmd.exe /c "where node"'
  Pop $0 ; 获取退出码 (0代表已安装, 非0代表未安装)
  
  ${If} $0 != 0
    DetailPrint "未检测到 Node.js，准备下载 Node.js LTS 安装包..."
    
    ; 使用 PowerShell 下载 Node.js MSI 官方安装包 (v20.11.1 x64)
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host \"Downloading Node.js v20...\" ; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile(\"https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi\", \"$TEMP\node-setup.msi\")"'
    
    DetailPrint "正在静默安装 Node.js (这可能需要 1-2 分钟)..."
    ; 静默运行 MSI 安装
    nsExec::ExecToLog 'msiexec.exe /i "$TEMP\node-setup.msi" /qn /norestart'
    
    DetailPrint "Node.js 安装成功！"
  ${Else}
    DetailPrint "✅ 检测到 Node.js 已安装，跳过。"
  ${EndIf}

  ; 2. 检查 Astral uv 环境
  DetailPrint "正在检测 Astral uv..."
  nsExec::ExecToStack 'cmd.exe /c "where uv"'
  Pop $0
  
  ${If} $0 != 0
    DetailPrint "未检测到 Astral uv，正在下载并安装..."
    ; 使用官方 PowerShell 脚本一键安装 uv
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"'
    DetailPrint "Astral uv 安装成功！"
  ${Else}
    DetailPrint "✅ 检测到 Astral uv 已安装，跳过。"
  ${EndIf}

  DetailPrint "🎉 Galois 运行环境自动配置完毕！"
!macroend
