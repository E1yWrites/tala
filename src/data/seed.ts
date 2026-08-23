import { db } from '@/database/db'
import { DEFAULT_SETTINGS } from './defaults'
import { bulletList, codeBlock, doc, h, orderedList, p, quote, taskList } from './docBuilders'
import { createId } from '@/utils/id'
import type { AppSettings, Folder, Note, Tag } from '@/types/models'

/* ---------------------------------------------------------------------------
   First-run demo content. Created once (settings.seededAt === null) so the
   app feels alive immediately; users can remove it via Settings → Data.
--------------------------------------------------------------------------- */

const hrAgo = (h: number): number => Date.now() - h * 3_600_000
const day = (d: number): number => Date.now() - d * 86_400_000

export async function seedDemoData(): Promise<void> {
  const folderSchool: Folder = { id: createId(), name: 'School', createdAt: day(21) }
  const folderPersonal: Folder = { id: createId(), name: 'Personal', createdAt: day(20) }
  const folderProjects: Folder = { id: createId(), name: 'Projects', createdAt: day(14) }

  const tag = (name: string, color: string): Tag => ({
    id: createId(),
    name,
    color,
    createdAt: day(14),
  })
  const tComp6 = tag('COMP6', 'iris')
  const tProgramming = tag('Programming', 'teal')
  const tExam = tag('Exam', 'amber')
  const tIdeas = tag('Ideas', 'rose')
  const tJournal = tag('Journal', 'sky')
  const tReading = tag('Reading', 'lime')

  let n = 0
  const note = (
    title: string,
    content: Note['content'],
    opts: Partial<
      Pick<Note, 'folderId' | 'tagIds' | 'isPinned' | 'isFavorite' | 'isArchived' | 'isDeleted'>
    >,
    updatedAt: number,
  ): Note => ({
    id: createId(),
    title,
    content,
    folderId: null,
    tagIds: [],
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: opts.isDeleted ? day(2) : null,
    createdAt: Math.min(updatedAt, day(n++)),
    updatedAt,
    ...opts,
  })

  const notes: Note[] = [
    note(
      'COMP 6 — Data Structures Lecture',
      doc(
        h(2, 'Overview'),
        p(
          'Week 4 covered asymptotic analysis and why constant factors matter less as n grows.',
        ),
        h(3, 'Big-O cheat sheet'),
        bulletList('Array access — O(1)', 'Binary search — O(log n)', 'Merge sort — O(n log n)'),
        h(3, 'Example'),
        codeBlock(
          'ts',
          'function binarySearch(xs: number[], target: number): number {\n  let lo = 0, hi = xs.length - 1\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1\n    if (xs[mid] === target) return mid\n    if (xs[mid] < target) lo = mid + 1\n    else hi = mid - 1\n  }\n  return -1\n}',
        ),
        quote('Tip repeated twice by the professor: know the recursion tree for merge sort.'),
      ),
      { folderId: folderSchool.id, tagIds: [tComp6.id, tProgramming.id], isPinned: true },
      hrAgo(2),
    ),
    note(
      'Project Ideas',
      doc(
        p("Side project candidates for this semester — pick one before September."),
        bulletList(
          'Pomodoro app with a physical desk timer integration',
          'CLI that summarizes git activity into a standup digest',
          'Flashcard app that schedules reviews around class schedule',
        ),
        h(3, 'Criteria'),
        orderedList('Shippable in ~6 weeks', 'Uses something new to me', 'Actually useful daily'),
      ),
      { folderId: folderProjects.id, tagIds: [tIdeas.id], isFavorite: true },
      hrAgo(5),
    ),
    note(
      'Study Group — Kickoff',
      doc(
        p({ type: 'text', text: 'Attendees: ', marks: [{ type: 'bold' }] }, 'Lanz, Mia, Josh, Priya'),
        h(2, 'Agenda'),
        taskList([true, 'Pick weekly slot — Thursday 7pm'], [true, 'Divide chapters'], [false, 'Set up shared drive']),
        h(2, 'Discussion'),
        bulletList('Chapter 5 (trees) is the hardest per Mia — spend two sessions on it.', 'Josh found past exams; will share PDFs.'),
        h(2, 'Action items'),
        taskList([true, 'Lanz — book library room'], [false, 'Mia — summary sheet for ch. 5'], [false, 'Priya — quiz questions']),
      ),
      { folderId: folderSchool.id, tagIds: [tComp6.id, tExam.id] },
      day(1),
    ),
    note(
      'Semester Checklist',
      doc(
        taskList(
          [true, 'Enroll in COMP 6 lab section'],
          [true, 'Renew library card'],
          [true, 'Buy reference book'],
          [true, 'Set up note system'],
          [false, 'Apply for scholarship'],
          [false, 'Print transcripts'],
          [false, 'Book advisor meeting'],
        ),
      ),
      { folderId: folderPersonal.id },
      day(1),
    ),
    note(
      'useEffect Cheatsheet',
      doc(
        p('Common dependency-array patterns and when each runs.'),
        codeBlock(
          'tsx',
          '// Runs after every render\nuseEffect(fn)\n\n// Runs once on mount\nuseEffect(fn, [])\n\n// Runs when `id` changes\nuseEffect(fn, [id])',
        ),
        h(3, 'Gotchas'),
        bulletList('Objects/arrays in deps compare by reference — memoize them.', "Cleanup prevents stale subscriptions."),
      ),
      { folderId: folderProjects.id, tagIds: [tProgramming.id] },
      day(2),
    ),
    note(
      'Daily Journal — Aug 20',
      doc(
        p({ type: 'text', text: 'Feeling: ', marks: [{ type: 'italic' }] }, 'quietly productive.'),
        h(2, 'Highlights'),
        bulletList('Locked in a 90-minute deep-work block before class.', 'Study group kickoff went well.'),
        h(2, 'Grateful for'),
        bulletList('Coffee. Obviously.'),
      ),
      { folderId: folderPersonal.id, tagIds: [tJournal.id] },
      day(2),
    ),
    note(
      'Reading List',
      doc(
        orderedList('The Pragmatic Programmer', 'A Philosophy of Software Design', 'Thinking, Fast and Slow'),
      ),
      { folderId: folderPersonal.id, tagIds: [tReading.id] },
      day(4),
    ),
    note(
      'Midterms Schedule',
      doc(
        bulletList('COMP 6 — Sep 12, 9:00 AM, Hall B', 'MATH 2 — Sep 15, 13:00, Hall A', 'PHYS 1 — Sep 18, 9:00, Lab 3'),
        p({ type: 'text', text: 'Target: ', marks: [{ type: 'bold' }] }, 'nothing below 90.'),
      ),
      { folderId: folderSchool.id, tagIds: [tExam.id], isFavorite: true },
      day(6),
    ),
    note(
      'Old Semester Plan',
      doc(p('Archived plan from last semester — kept for reference.'), bulletList('…')),
      { isArchived: true },
      day(30),
    ),
    note('Groceries', doc(taskList([true, 'Oat milk'], [true, 'Eggs'])), {
      isDeleted: true,
    }, day(3)),
  ]

  const settings: AppSettings = { ...DEFAULT_SETTINGS, seededAt: Date.now() }

  // Re-check inside the write transaction: two tabs can both pass hydration's
  // probe on very first launch; only the one that wins the transaction seeds.
  await db.transaction('rw', db.folders, db.tags, db.notes, db.settings, async () => {
    if (await db.settings.get('app')) return
    await db.folders.bulkPut([folderSchool, folderPersonal, folderProjects])
    await db.tags.bulkPut([tComp6, tProgramming, tExam, tIdeas, tJournal, tReading])
    await db.notes.bulkPut(notes)
    await db.settings.put(settings)
  })
}
