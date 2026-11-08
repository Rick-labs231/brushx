// The beginner guide. Each tour is a list of steps; a step points at part of the screen
// with a CSS selector (if it isn't on screen the card is shown in the middle instead).
export type TourId = 'home' | 'projects' | 'profile' | 'editor'

export interface Step {
  title: string
  body: string
  /** CSS selector of the thing to highlight */
  target?: string
  /** a short "try it" nudge shown under the text */
  tryIt?: string
  /** side panel tab to open first */
  tab?: 'Layers' | 'Properties' | 'Guides' | 'Scene'
  /** needs the side panel (opens the drawer on phones) */
  panel?: boolean
}

const tool = (name: string) => `.toolbar [aria-label="${name}"]`

export const TOURS: Record<TourId, { label: string; steps: Step[] }> = {
  home: {
    label: 'Home',
    steps: [
      { title: 'Welcome to Brush X', body: 'Animate faster, create freely. This quick guide shows you around. You can skip it any time and replay it later from your Profile.' },
      { title: 'Start a new animation', target: '.hero .btn.primary, .empty .btn.primary', body: 'This is where everything begins. Pick a size (or a social-media preset like TikTok or YouTube) and a frame rate, then you are in the editor.', tryIt: 'You can also drop a picture or video onto the editor later.' },
      { title: 'Your recent projects', target: '.section-head, .grid', body: 'Projects you worked on show up here with a preview. Click one to keep going. Everything saves by itself.' },
      { title: 'Find things fast', target: '.topbar .search', body: 'Type here to search your projects by name.' },
      { title: 'Move around', target: '.nav', body: 'Home, Projects (your library), Community and Marketplace (coming after launch) and Profile (settings, shortcuts, cloud backup).' },
      { title: 'You are set', body: 'Create your first project and the editor guide will start. Tip: the guide has a replay button in Profile, and the ? button inside the editor.' },
    ],
  },
  projects: {
    label: 'Projects',
    steps: [
      { title: 'Your project library', body: 'Every animation lives here, stored safely on this device (and in the cloud if you turn on sync).' },
      { title: 'Import and backup', target: '.row .btn.secondary', body: 'Import brings in a .brushx project file or a full backup. Backup all saves every project into one zip, a great habit before clearing your browser or switching phones.' },
      { title: 'New Project', target: '.row .btn.primary', body: 'Make another animation from here.' },
      { title: 'Active and Archived', target: '.tabs', body: 'Archive projects you are not using so the main list stays tidy. Sorting is on the right: recent, name or newest.' },
      { title: 'Project cards', target: '[data-testid=project-card], .empty', body: 'Click the picture to open. The ⋯ menu lets you rename, duplicate, archive or delete. A cloud badge shows whether it is synced.', tryIt: 'Duplicate a project before trying a risky change.' },
      { title: 'Storage', target: '[data-testid=storage-usage]', body: 'See how much space Brush X uses. “Protect from clean-up” asks the browser not to delete your projects automatically.' },
    ],
  },
  profile: {
    label: 'Profile',
    steps: [
      { title: 'Settings and account', body: 'Make Brush X comfortable for you, and back your work up to the cloud.' },
      { title: 'Accessibility', target: '.grid > .card:first-child', body: 'UI scale makes everything bigger or smaller. High contrast brightens text. Left-handed puts the tools on the right. Keyboard shortcuts lets you see and change tool keys.' },
      { title: 'Cloud sync', target: '[data-testid=cloud-card]', body: 'Make an account to keep your projects on every device. Your work stays on this device either way. If two devices change the same project, both versions are kept.' },
      { title: 'Replay the guides', target: '[data-testid=tour-card]', body: 'Come back here any time to run any guide again.' },
    ],
  },
  editor: {
    label: 'Editor',
    steps: [
      { title: 'The editor', body: 'This is where you draw and animate. The guide takes about two minutes and covers every part. Use Next, or the arrow keys. Skip is always available.' },
      { title: 'The canvas', target: '.stage', body: 'Draw with a mouse, a pen or your finger. Pen pressure is supported. Two fingers (or Space + drag) pan, and pinch or scroll zooms.', tryIt: 'Try scribbling something now. Undo is Ctrl+Z.' },
      { title: 'Drawing tools', target: tool('Pencil'), body: 'The toolbar starts with the popular tools: Pencil, Brush and Eraser. Each feels different, and the Eraser rubs out mistakes. Hover over any tool to see its shortcut key.' },
      { title: 'Fill and Eyedropper', target: tool('Fill bucket'), body: 'Fill pours colour into a closed area (it respects gaps). The Eyedropper picks up a colour from the canvas.' },
      { title: 'Add more tools', target: tool('Add or remove tools'), body: 'Tap + to see every tool with a short description, then tick the ones you want on the toolbar: Ink pen, Airbrush, Marker, Chalk, Crayon, Lasso, Line, Rectangle, Ellipse, Polygon, Curve pen, Text and Crop. Untick the ones you do not use to make more room to draw.', tryIt: 'Tap + now to have a look. Back to popular tools resets everything.' },
      { title: 'Select and Hand', target: tool('Select'), body: 'Select drags a box around strokes to move them (Lasso, in the + list, draws a loop instead). Copy, cut and paste work across frames and even projects. Hand moves the canvas.' },
      { title: 'Mirror drawing', target: tool('Symmetry'), body: 'Switch on symmetry (X) and everything you draw is mirrored. Great for faces, wings and logos.' },
      { title: 'Brush settings and colours', tab: 'Properties', panel: true, target: '.side-body', body: 'Size, opacity, hardness and smoothing live here, with a colour wheel and palette. Save a favourite brush as a preset under “My brush presets”.' },
      { title: 'Layers', tab: 'Layers', panel: true, target: '.side-body', body: 'Stack drawings like sheets of paper. Hide, lock, rename, reorder, change opacity, duplicate or merge them. Put the lineart on its own layer and colour underneath.' },
      { title: 'Pictures and video', tab: 'Layers', panel: true, target: '.media-box', body: 'Bring in a picture or a video clip. Choose “Trace under my drawing” to draw over it (it is not exported) or “Part of the animation” to include it, perfect for funny edits. You can also drag a file onto the editor.', tryIt: 'Video frames land one per frame, starting at the frame you are on.' },
      { title: 'Guides and templates', tab: 'Guides', panel: true, target: '.side-body', body: '44 construction templates (heads, bodies, hands, poses, creatures, objects) and 14 motion cycles help you build the frame. Turn the head, change perspective, and use the guide as a base to draw over.', tryIt: 'Paste guide turns it into real lines you can keep as a drawing instead of tracing.' },
      { title: 'Scene, Camera and Sound', tab: 'Scene', panel: true, target: '.side-body', body: 'Scenes split your film into named parts. Camera adds pan, zoom and rotate between keyframes. Sound lets you add a track and see its waveform under the frames.' },
      { title: 'The timeline', target: '.timeline .strip, .timeline', body: 'Each box is a frame. Click one to draw on it. A dot shows it has drawing. Drag frames to reorder.' },
      { title: 'Play and edit frames', target: '.timeline', body: 'Play, loop and step through frames. Add, duplicate or delete a frame. Hold keeps a frame on screen longer (animating “on twos”). In and Out set the part that plays and exports.' },
      { title: 'Onion skin', target: '[aria-label="Onion skin"]', body: 'See faint ghosts of the frames before and after, so your drawing flows. Choose how many ghosts and what colour.', tryIt: 'Turn it on, add a frame and draw the next pose.' },
      { title: 'Speed (FPS)', target: '[aria-label="Frames per second"]', body: 'Frames per second controls how fast it plays. 12 is a classic hand-drawn feel, 24 is film.' },
      { title: 'View controls', target: '.stage-ctl', body: 'Zoom, rotate the canvas like paper, and Fit to see the whole thing. F fits the view.' },
      { title: 'Undo, save and settings', target: '.ed-top', body: 'Undo and Redo are always here. Everything autosaves. Project settings has size, “Save a copy” and version history with restore points, so you can go back in time.' },
      { title: 'Export', target: '.ed-top .btn.primary', body: 'Share as a PNG, GIF, PNG sequence, a project file, or a video (MP4 or WebM) with presets for YouTube, TikTok, Instagram and X. Sound is included.' },
      { title: 'You are ready', body: 'Press ? any time for shortcuts. You can replay this guide from the ? button at the top (under More on a phone). Have fun making something great.' },
    ],
  },
}
