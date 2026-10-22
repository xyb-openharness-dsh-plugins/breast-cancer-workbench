/**
 * 解析失败的人话映射（public/js/parse-fault.js）单测。
 *
 * 钉三件事：
 * 1. 已知错误码必须落到登记过的标题与提示，不能漏（漏了用户又会看到裸英文码）；
 * 2. 未知码**不猜原因**：没有登记就老实说"没有记录到具体原因"，只有原文本身是中文时才借用；
 * 3. 提示里不能出现诊断/处置类措辞，也不能长到 toast 里读不完。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { PARSE_FAULTS, parseFault, faultLabel } from '../public/js/parse-fault.js'

const BANNED = ['建议治疗', '可能复发', '无需就医', '可以停药', '偏高', '偏低', '异常', '严重']

test('已知错误码都有人话标题与下一步，且提示里写明原件仍保留', () => {
  for (const [code, item] of Object.entries(PARSE_FAULTS)) {
    assert.ok(item.label?.trim(), `${code} 缺短标签`)
    assert.ok(item.title?.trim(), `${code} 缺标题`)
    assert.ok(item.hint?.trim(), `${code} 缺提示`)
    assert.match(item.hint, /原件/, `${code} 的提示必须说明原件还在`)
    assert.ok(item.label.length <= 10, `${code} 的短标签要能塞进表格一格`)
    assert.ok(item.hint.length <= 110, `${code} 的提示太长，toast 读不完`)
  }
})

test('Token 类失败引导去设置，超时/云端失败可直接重试', () => {
  assert.equal(parseFault('NO_TOKEN').settings, true)
  assert.equal(parseFault('NO_TOKEN').retry, false, '没 Token 时先配 Token，别让用户点重试空转')
  assert.equal(parseFault('UNAUTHORIZED').settings, true)
  assert.equal(parseFault('TIMEOUT').retry, true)
  assert.equal(parseFault('TASK_FAILED').retry, true)
  assert.equal(parseFault('CONSENT_REQUIRED').settings, false, '同意开关就在导入框上，不用跳设置')
})

test('未知错误码不猜原因，只给通用下一步', () => {
  const fault = parseFault('SOMETHING_NEW', 'TypeError: fetch failed')
  assert.equal(fault.label, '解析失败')
  assert.match(fault.hint, /没有记录到具体原因/)
  assert.ok(!fault.hint.includes('fetch'), '纯英文报文不当人话提示')
  assert.equal(fault.settings, false)
  assert.equal(fault.retry, true)
})

test('未知码但原文是中文时借用原文，并仍声明原件保留', () => {
  const fault = parseFault('WEIRD', '云端返回的表结构无法识别')
  assert.ok(fault.hint.includes('云端返回的表结构无法识别'))
  assert.match(fault.hint, /原件保留/)
})

test('空码/空原文也给出可用结论，不抛错', () => {
  const fault = parseFault(undefined, undefined)
  assert.equal(fault.code, 'parse_error')
  assert.equal(fault.title, '这次解析没有成功')
  assert.equal(faultLabel(null, null), '解析失败')
})

test('全部提示不含诊断与处置类措辞（A18 红线）', () => {
  const texts = [
    ...Object.values(PARSE_FAULTS).flatMap((x) => [x.label, x.title, x.hint]),
    parseFault('UNKNOWN_CODE').title,
    parseFault('UNKNOWN_CODE').hint,
  ]
  for (const text of texts) {
    for (const word of BANNED) {
      assert.ok(!text.includes(word), `出现红线措辞「${word}」：${text}`)
    }
  }
})
