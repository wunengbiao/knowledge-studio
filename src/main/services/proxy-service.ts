import { app, session } from 'electron'

export class ProxyService {
  configure(proxyUrl: string | null): void {
    // session.defaultSession 在 app ready 之前不可用。
    // 构造期 / settings 初始化时调用要延后到 ready 之后。
    const apply = (): void => {
      const ses = session.defaultSession
      if (proxyUrl) {
        ses.setProxy({ proxyRules: proxyUrl })
      } else {
        ses.setProxy({ proxyRules: '' })
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
