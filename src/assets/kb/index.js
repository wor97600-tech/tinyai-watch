import part01 from './kb_v2_01.js'
import part02 from './kb_v2_02.js'
import part03 from './kb_v2_03.js'
import part04 from './kb_v2_04.js'
import part05 from './kb_v2_05.js'
import part06 from './kb_v2_06.js'
import part07 from './kb_v2_07.js'
import part08 from './kb_v2_08.js'
import part09 from './kb_v2_09.js'
import part10 from './kb_v2_10.js'
import part11 from './kb_v2_11.js'
import part12 from './kb_v2_12.js'
import part13 from './kb_v2_13.js'

export default [
  part01,
  part02,
  part03,
  part04,
  part05,
  part06,
  part07,
  part08,
  part09,
  part10,
  part11,
  part12,
  part13,
].reduce(function (all, part) { return all.concat(part) }, [])
