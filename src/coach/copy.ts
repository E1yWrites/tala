/*
  Every word Bituin says lives in this file, so the owner can review the
  English and the Filipino touches in one place. Keep lines short, warm and
  free of guilt: Bituin cheers, it never nags.
*/

export const BITUIN = {
  name: 'Bituin',

  home: {
    line: 'Ready when you are.',
  },

  welcome: {
    title: 'Kumusta! I’m Bituin.',
    body: 'I live in the corner of Tala. I’ll cheer when you study and stay out of your way when you write.',
  },

  empty: {
    notes: {
      title: 'A clean desk. Tara, simulan na natin!',
      body: 'Tap + to start a note, or import a PDF and mark it up.',
    },
    search: {
      title: 'Walang nahanap.',
      body: 'Nothing matches that. Try other words, or check the spelling.',
    },
    tasks: {
      title: 'No tasks yet.',
      body: 'Start a checklist in any note by typing "[ ] " at the start of a line.',
    },
    tasksDone: 'All ticked off. Galing!',
    folder: {
      title: 'This folder is empty.',
      body: 'Move a note here, or start a new one.',
    },
    trash: {
      title: 'Trash is empty.',
      body: 'Deleted notes wait here until you remove them for good.',
    },
    favorites: {
      title: 'No starred notes yet.',
      body: 'Star a note to keep it close.',
    },
  },

  nudge: {
    backup: {
      title: 'Back up your notes?',
      body: (days: number): string =>
        days <= 1
          ? 'A quick copy keeps your notes safe, whatever happens to this device.'
          : `It’s been ${days} days. A quick copy keeps your notes safe, whatever happens to this device.`,
      action: 'Back up now',
      later: 'Later',
    },
    installIos: {
      title: 'Keep your notes safe',
      body: 'Safari can clear a website’s notes if you haven’t opened it in a while. Add Tala to your Home Screen to protect them.',
      action: 'Show me how',
      later: 'Not now',
    },
    installAndroid: {
      title: 'Install Tala',
      body: 'Install it for a full-screen notebook that works offline and keeps your notes protected.',
      action: 'Install',
      later: 'Not now',
    },
  },

  reaction: {
    backupDone: 'Backed up. Ingat ka!',
    backupShared: 'Backup ready. Ingat ka!',
  },

  install: {
    title: 'Add Tala to your Home Screen',
    iosSteps: [
      'Tap the Share button in Safari’s toolbar.',
      'Scroll down and tap “Add to Home Screen”.',
      'Tap “Add”. Open Tala from your Home Screen from now on.',
    ],
    androidSteps: [
      'Open the browser menu (the three dots).',
      'Tap “Install app” or “Add to Home screen”.',
      'Confirm. Tala opens full-screen from your launcher.',
    ],
    why: 'Installed apps get protected storage: your browser won’t clear the notes when space runs low.',
    done: 'Already installed? You’re all set.',
  },
} as const
