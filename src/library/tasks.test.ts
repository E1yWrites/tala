import Dexie from 'dexie'
import type { JSONContent } from '@tiptap/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { addPage, createNote, flush, markOnDisk, savePageContent, trashNotes } from './notes'
import { listTasks, toggleTask } from './tasks'

const p = (t: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
const item = (t: string, checked = false, ...nested: JSONContent[]): JSONContent => ({
  type: 'taskItem',
  attrs: { checked },
  content: [p(t), ...(nested.length ? [{ type: 'taskList', content: nested }] : [])],
})
const doc = (...blocks: JSONContent[]): JSONContent => ({ type: 'doc', content: blocks })
const list = (...items: JSONContent[]): JSONContent => ({ type: 'taskList', content: items })

const all = () => listTasks(useNoteStore.getState().notes, usePageStore.getState().pagesByNote)

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
})

describe('listTasks', () => {
  it('finds tasks on every page, with sub-tasks and their own text', async () => {
    const n = createNote({ title: 'Revision' })
    await savePageContent(n.id, n.id, doc(p('intro'), list(item('read ch 1', true), item('essay', false, item('outline'), item('draft', true)))))
    const p2 = addPage(n.id)
    await savePageContent(n.id, p2.id, doc(list(item('page two task'))))

    const tasks = all()
    expect(tasks.map((t) => [t.text, t.checked, t.pageNumber])).toEqual([
      ['read ch 1', true, 1],
      ['essay', false, 1], // not "essay outline draft"
      ['outline', false, 1],
      ['draft', true, 1],
      ['page two task', false, 2],
    ])
  })

  it('skips trashed notes', async () => {
    const n = createNote({ title: 'gone' })
    await savePageContent(n.id, n.id, doc(list(item('x'))))
    expect(all()).toHaveLength(1)
    trashNotes([n.id])
    expect(all()).toHaveLength(0)
  })
})

describe('toggleTask', () => {
  it('ticks and unticks a nested task and saves the page', async () => {
    const n = createNote({ title: 'Revision' })
    await savePageContent(n.id, n.id, doc(list(item('essay', false, item('outline')))))
    const outline = all().find((t) => t.text === 'outline')!

    expect(await toggleTask(outline)).toBe('saved')
    expect(all().find((t) => t.text === 'outline')!.checked).toBe(true)
    // persisted, and the parent task is untouched
    const stored = (await db.pages.get(n.id))!
    expect(JSON.stringify(stored.content)).toContain('"checked":true')
    expect(all().find((t) => t.text === 'essay')!.checked).toBe(false)

    await toggleTask(all().find((t) => t.text === 'outline')!)
    expect(all().find((t) => t.text === 'outline')!.checked).toBe(false)
    await flush()
  })

  it('does nothing when the task is gone', async () => {
    const n = createNote({ title: 'x' })
    await savePageContent(n.id, n.id, doc(list(item('a'))))
    const ref = all()[0]!
    await savePageContent(n.id, n.id, doc(p('rewritten')))
    expect(await toggleTask(ref)).toBe('gone')
  })
})
