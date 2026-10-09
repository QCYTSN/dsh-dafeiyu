import { readFileSync } from 'node:fs'

const { name, version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const section = changelog.split(/^## /m).find((entry) => entry.split(/\r?\n/)[0].split(' · ')[0] === version)
if (!section) throw new Error(`CHANGELOG.md has no entry for ${version}`)

const releases = 'https://github.com/QCYTSN/dsh-dafeiyu/releases'
const archive = `${name}-${version}.tgz`
const notice = version.includes('-')
  ? '> 这是预览版本。普通用户请安装[最新稳定版](' + releases + '/latest)。\n> This is a prerelease. For normal use, install the [latest stable version](' + releases + '/latest).'
  : '> 安装请使用[最新稳定版](' + releases + '/latest)；如果本页已成为历史记录，请转到该入口。\n> Use the [latest stable release](' + releases + '/latest) for installation; older pages are historical records.'

process.stdout.write([
  notice,
  '',
  '## 安装 / Install',
  '',
  `- 官方桌面端：插件 → 添加插件 → 输入 \`${name}@${version}\` → 安装并启用。`,
  `- Official Desktop: Plugins → Add plugin → \`${name}@${version}\` → Install and enable.`,
  `- 离线安装 / Offline install: [${archive}](${releases}/download/v${version}/${archive}).`,
  '- Windows、Linux 和 macOS 共用一个包。无需解压；GitHub 的 Source code (zip / tar.gz) 不是安装包。',
  '- One package supports Windows, Linux, and macOS. Do not unpack it; GitHub Source code archives are not installable packages.',
  '',
  '## 本版变更 / Changes',
  '',
  section.replace(/^[^\r\n]+\r?\n/, '').trim(),
  '',
].join('\n'))
