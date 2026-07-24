!macro customInit
  MessageBox MB_OK|MB_ICONINFORMATION "重要网络配置提醒 / Important Network Setup Notice:$\r$\n$\r$\n使用本软件前，请务必在您的系统中开启以下服务：$\r$\n1. 全局代理 (Global Proxy)$\r$\n2. 虚拟网卡 (TUN) 模式 (例如 Clash 的 Tun 模式)$\r$\n$\r$\n本软件的大模型 API 交互、依赖包下载及运行时管理等功能需要无阻碍的国外网络环境。若未开启全局代理和虚拟网卡模式，部分功能及自动部署将无法正常工作！"
!macroend
