// Release helper. Usage:
//   npm run release -- 2.1.0          bump versions, check CHANGELOG, commit, tag (local only; push yourself)
//   node scripts/release.mjs --notes v2.1.0   print that version's CHANGELOG section (used by CI)
//   node scripts/release.mjs --check v2.1.0   fail unless the tag, app versions and CHANGELOG agree (used by CI)
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const FILES = {
  pkg: ['package.json', /("version":\s*")([^"]+)/],
  tauri: ['src-tauri/tauri.conf.json', /("version":\s*")([^"]+)/],
  cargo: ['src-tauri/Cargo.toml', /^(version\s*=\s*")([^"]+)/m],
}
const read = (f) => readFileSync(f, 'utf8')
const fail = (m) => { console.error(m); process.exit(1) }
const semver = (v) => (/^\d+\.\d+\.\d+$/.test(v) ? v : fail(`"${v}" is not X.Y.Z`))

function notes(v) {
  const m = read('CHANGELOG.md').match(new RegExp(`^## \\[${v.replaceAll('.', '\\.')}\\][^\\r\\n]*\\r?\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'm'))
  return m ? m[1].trim() : fail(`CHANGELOG.md has no "## [${v}]" section`)
}

const [a, b] = process.argv.slice(2)
if (a === '--notes') console.log(notes(semver(b.replace(/^v/, ''))))
else if (a === '--check') {
  const v = semver(b.replace(/^v/, ''))
  for (const [f, re] of Object.values(FILES)) {
    const found = read(f).match(re)
    if (found?.[2] !== v) fail(`${f} is ${found?.[2]}, tag is ${v}`)
  }
  notes(v)
  console.log(`ok: ${v}`)
} else {
  const v = semver(a ?? '')
  if (execSync('git status --porcelain').toString().trim()) fail('Working tree is not clean')
  notes(v)
  for (const [f, re] of Object.values(FILES)) writeFileSync(f, read(f).replace(re, (_, pre) => pre + v))
  execSync(`npm version ${v} --no-git-tag-version --allow-same-version`, { stdio: 'ignore' }) // keeps package-lock.json in step
  execSync('npm run typecheck && npm test', { stdio: 'inherit' })
  execSync(`git commit -am "chore: release v${v}" && git tag -a v${v} -m "Tala v${v}"`, { stdio: 'inherit' })
  console.log(`\nTagged v${v}. Publish with: git push origin HEAD v${v}`)
}
