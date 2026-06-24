#!/bin/bash

# DNOTE 开发者启动脚本 - 自动检查依赖并运行

# 切换到脚本所在目录
CWD="$(cd "$(dirname "$0")" && pwd)"
cd "$CWD"

echo "==========================================="
echo "        🧬 DNOTE Bionic Workspace 🧬"
echo "==========================================="

# 1. 检查 Node.js 环境
if ! command -v node &> /dev/null; then
  echo "❌ 错误: 系统未检测到 Node.js！"
  echo "请前往官网下载并安装: https://nodejs.org/"
  echo "或在终端运行: brew install node"
  read -p "按下回车键退出..."
  exit 1
fi

# 1.5 检查并配置 Astral uv 环境 (图谱与后台脚本必需)
if ! command -v uv &> /dev/null && [ ! -f "$HOME/.local/bin/uv" ]; then
  echo "⚠️ 警告: 系统未检测到 Astral uv (Python 环境管理工具)！"
  echo "DNOTE 的图谱计算与 Python 脚本插件依赖 uv 才能运行。"
  echo "-------------------------------------------"
  echo "是否现在安装 uv？"
  echo "1) 官方 curl 安装 (推荐: curl -LsSf https://astral.sh/uv/install.sh | sh)"
  echo "2) Homebrew 命令行安装 (brew install uv)"
  echo "3) 稍后手动安装 (跳过)"
  read -p "请输入选项 [1-3]: " uv_choice
  
  case $uv_choice in
    1)
      echo "📦 正在使用 curl 下载并安装 uv..."
      curl -LsSf https://astral.sh/uv/install.sh | sh
      export PATH="$HOME/.local/bin:$PATH"
      ;;
    2)
      if command -v brew &> /dev/null; then
        echo "📦 正在使用 Homebrew 安装 uv..."
        brew install uv
      else
        echo "❌ 未检测到 Homebrew，尝试使用 curl 安装..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
      fi
      ;;
    *)
      echo "⏭️ 已跳过 uv 安装，请确保后续手动安装以保证自动标签与关系图谱正常工作。"
      ;;
  esac
fi

# 双向校验并刷新 PATH 环境变量
if [ -f "$HOME/.local/bin/uv" ]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

if command -v uv &> /dev/null; then
  echo "✅ Astral uv 环境检查通过。"
else
  echo "⚠️ 提示: 未检测到有效的 uv 命令，部分 Python 计算服务可能会受到限制。"
fi

# 2. 检查并安装 npm 依赖
if [ ! -d "node_modules" ]; then
  echo "📦 正在首次安装项目依赖 (node_modules)，请稍候..."
  npm install
  if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败，请手动在终端运行 'npm install' 排查错误。"
    read -p "按下回车键退出..."
    exit 1
  fi
  echo "✅ 依赖安装成功！"
else
  echo "✅ 依赖检查通过 (node_modules 已存在)。"
fi

# 2.5 确保 PTY 启动辅助程序具有可执行权限 (防止 macOS 上 posix_spawnp failed)
if [ -f "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" ]; then
  chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper &>/dev/null
fi
if [ -f "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper" ]; then
  chmod +x node_modules/node-pty/prebuilds/darwin-x64/spawn-helper &>/dev/null
fi


# 3. 运行本地热更新开发服务
echo "🚀 正在启动 DNOTE 热更新服务与桌面窗口..."
npm run dev
