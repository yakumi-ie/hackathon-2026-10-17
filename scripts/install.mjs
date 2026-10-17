import { spawnSync } from 'node:child_process'

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
const result = spawnSync('npm', ['install', `--before=${cutoff}`], { stdio: 'inherit' })
process.exit(result.status ?? 1)
