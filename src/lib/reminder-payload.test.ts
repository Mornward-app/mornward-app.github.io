import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReminders, EVENING_ID, MORNING_ID } from './reminder-payload.ts'

test('morning and evening are two repeating daily triggers at the chosen minute', () => {
  const [m, e] = buildReminders({ mins: 7 * 60 + 15, body: 'Water first.' }, { mins: 21 * 60 + 30 })
  assert.equal(m.id, MORNING_ID)
  assert.deepEqual(m.schedule, { on: { hour: 7, minute: 15 }, repeats: true, allowWhileIdle: true })
  assert.equal(e.id, EVENING_ID)
  assert.deepEqual(e.schedule, { on: { hour: 21, minute: 30 }, repeats: true, allowWhileIdle: true })
  assert.notEqual(m.id, e.id)
  assert.equal(m.extra.open, 'morning')
  assert.equal(e.extra.open, 'evening')
})

test('nothing fires at set-up time: no immediate `at`, no `every`, no `count`', () => {
  for (const n of buildReminders({ mins: 420, body: 'x' }, { mins: 1260 })) {
    assert.deepEqual(Object.keys(n.schedule).sort(), ['allowWhileIdle', 'on', 'repeats'])
  }
})

test('copy has no exclamation marks and no emoji', () => {
  for (const n of buildReminders({ mins: 420, body: 'Water first.' }, { mins: 1260 })) {
    assert.doesNotMatch(n.title + n.body, /!|\p{Extended_Pictographic}/u)
  }
})
