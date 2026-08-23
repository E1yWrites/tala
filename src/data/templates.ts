import {
  bulletList,
  codeBlock,
  doc,
  emptyP,
  h,
  hr,
  orderedList,
  p,
  quote,
  taskList,
} from './docBuilders'
import type { NoteTemplate } from '@/types/models'

/* ---------------------------------------------------------------------------
   Note templates — shown in the "+ New Note" picker.
   Add a new entry here and it appears automatically in the UI.
--------------------------------------------------------------------------- */

export const TEMPLATES: NoteTemplate[] = [
  {
    id: 'lecture-notes',
    name: 'Lecture Notes',
    description: 'Structured layout for classes and lectures',
    icon: 'GraduationCap',
    suggestedTags: ['school'],
    doc: () =>
      doc(
        p({ type: 'text', text: 'Course: ', marks: [{ type: 'bold' }] }, '—'),
        p({ type: 'text', text: 'Date: ', marks: [{ type: 'bold' }] }, '—'),
        h(2, 'Key Concepts'),
        bulletList('Concept one — short explanation', 'Concept two — short explanation'),
        h(2, 'Details'),
        emptyP(),
        quote('Anything the professor repeats twice is probably on the exam.'),
        hr,
        h(2, 'Questions to follow up'),
        bulletList('…'),
      ),
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Agenda, discussion points, action items',
    icon: 'Users',
    suggestedTags: ['work'],
    doc: () =>
      doc(
        p({ type: 'text', text: 'Attendees: ', marks: [{ type: 'bold' }] }, '—'),
        h(2, 'Agenda'),
        taskList([false, 'Topic one'], [false, 'Topic two']),
        h(2, 'Discussion'),
        bulletList('…'),
        h(2, 'Action Items'),
        taskList([false, 'Owner — task'], [false, 'Owner — task']),
      ),
  },
  {
    id: 'todo-list',
    name: 'To-Do List',
    description: 'Simple checklist to power through tasks',
    icon: 'ListChecks',
    doc: () =>
      doc(
        h(2, 'Today'),
        taskList([false, '…'], [false, '…'], [false, '…']),
        h(2, 'Later'),
        taskList([false, '…']),
      ),
  },
  {
    id: 'project-planning',
    name: 'Project Planning',
    description: 'Goals, milestones, resources',
    icon: 'KanbanSquare',
    doc: () =>
      doc(
        quote('One sentence describing what "done" looks like.'),
        h(2, 'Milestones'),
        orderedList('Research', 'Prototype', 'Build', 'Review'),
        h(2, 'Tasks'),
        taskList([false, '…'], [false, '…']),
        h(2, 'Resources'),
        bulletList('Links, references, files…'),
      ),
  },
  {
    id: 'daily-journal',
    name: 'Daily Journal',
    description: 'Reflect on the day in a few lines',
    icon: 'NotebookPen',
    suggestedTags: ['journal'],
    doc: () =>
      doc(
        p({ type: 'text', text: 'How am I feeling? ', marks: [{ type: 'italic' }] }),
        emptyP(),
        h(2, 'Highlights'),
        bulletList('…'),
        h(2, 'Grateful for'),
        bulletList('…'),
        h(2, 'Tomorrow'),
        taskList([false, 'One thing I will do']),
      ),
  },
  {
    id: 'study-notes',
    name: 'Study Notes',
    description: 'Active-recall style study sheet',
    icon: 'BookOpen',
    suggestedTags: ['exam'],
    doc: () =>
      doc(
        h(2, 'Key Terms'),
        bulletList({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Term — ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'definition in your own words' },
          ],
        }),
        h(2, 'Self-quiz'),
        taskList([false, 'Question one'], [false, 'Question two']),
        h(2, 'Summary'),
        emptyP(),
      ),
  },
  {
    id: 'brain-dump',
    name: 'Brain Dump',
    description: 'Clear your head, organize later',
    icon: 'Lightbulb',
    doc: () => doc(bulletList('…', '…', '…')),
  },
  {
    id: 'code-notes',
    name: 'Code Notes',
    description: 'Snippets, gotchas, solutions',
    icon: 'SquareCode',
    suggestedTags: ['programming'],
    doc: () =>
      doc(
        h(2, 'Problem'),
        p('What are we solving?'),
        h(2, 'Snippet'),
        codeBlock('ts', '// paste code here\n'),
        h(2, 'Notes & gotchas'),
        bulletList('…'),
      ),
  },
]
