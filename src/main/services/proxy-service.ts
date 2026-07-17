import { app, session } from 'electron'

export class ProxyService {
  configure(proxyUrl: string | null): void {
    // session.defaultSession 在 app ready 之前不可用。
    // 构造期 / settings 初始化时调用要延后到 ready 之后。
    const apply = (): void => {
      const ses = session.defaultSession
      // 始终绕过局域网/本地地址，避免代理转发 LAN 请求（如 Ollama at 192.168.x.x）导致 503。
      // 覆盖 RFC 1918 私有地址段 + loopback + 本地主机名。
      // 必要性：不加 bypass 时，开启代理后所有流量（含 LAN）走代理，代理无法访问 LAN -> 503。
      const proxyBypassRules = '<local>,127.0.0.1/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
      if (proxyUrl) {
        ses.setProxy({ proxyRules: proxyUrl, proxyBypassRules })
      } else {
        ses.setProxy({ proxyRules: '', proxyBypassRules })
      }
      ses.closeAllConnections()
    }

    if (app.isReady()) {
      apply()
    } else {
      app.whenReady().then(apply)
    }
  }
}
