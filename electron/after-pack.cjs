const fs = require('node:fs/promises')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const source = path.join(context.appOutDir, 'electron.exe.sig')
  const target = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe.sig`)
  await fs.copyFile(source, target)
  await fs.rm(source)
}
