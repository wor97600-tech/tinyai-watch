import { validateManifestShape } from '../scripts/build_kb_1500.mjs'
import { KB_DATA_MANIFEST } from '../scripts/kb_data/manifest.mjs'

if (typeof validateManifestShape !== 'function') throw new Error('缺少 validateManifestShape')
const result = validateManifestShape(KB_DATA_MANIFEST)
if (!result.ok) throw new Error(result.errors.join(' | '))
if (result.domains.length !== KB_DATA_MANIFEST.length) throw new Error('领域数统计错误')
console.log('KB BUILD MANIFEST CHECK PASSED')
