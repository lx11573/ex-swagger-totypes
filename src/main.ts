import vscode from 'vscode'
import { ViewList } from './views/list.view'
import { ViewLocal } from './views/local.view'

import { log, config } from './tools'
import {
  registerCommonCommands,
  registerListCommands,
  registerLocalCommands,
  registerTemplateCommands,
} from './commands'

const viewList = new ViewList()
const viewLocal = new ViewLocal(viewList)

export function activate(ctx: vscode.ExtensionContext) {
  const { reloadWhenSettingsChanged } = config.extConfig
  // global.ctx = ctx

  const listTreeView = vscode.window.createTreeView('view.list', { treeDataProvider: viewList })
  const localTreeView = vscode.window.createTreeView('view.local', { treeDataProvider: viewLocal })

  registerCommonCommands(viewList, viewLocal)
  registerListCommands({ viewList, viewLocal, listTreeView, localTreeView })
  registerLocalCommands(viewList, viewLocal)
  registerTemplateCommands()

  // 监听 settings.json 文件变更
  if (reloadWhenSettingsChanged) {
    vscode.workspace.onDidChangeConfiguration(() => {
      viewList.onConfigurationRefresh()
      viewLocal.onConfigurationRefresh()
    })
  }

  log.info('Extension activated.')
}

// this method is called when your extension is deactivated
export function deactivate() {
  viewLocal.destroy()

  log.info('Extension deactivated.')
}
