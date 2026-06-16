import './style.css'

const modules = import.meta.glob('./sketches/**/*.html', { query: '?url', import: 'default', eager: true })

// Build { year -> [{ name, label, url }] }
const index = {}
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/sketches\/(\d{4})\/(m(\d+)-d(\d+)-([^/]+))\//)
  if (!m) continue
  const [, year, folder, month, day, slug] = m
  const label = slug.replace(/-/g, ' ')
  const date = new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  ;(index[year] ??= []).push({ folder, label, date, url })
}
for (const year of Object.keys(index)) {
  index[year].sort((a, b) => b.folder.localeCompare(a.folder))
}
const years = Object.keys(index).sort((a, b) => b - a)

// Render
document.querySelector('#app').innerHTML = `
  <div class="flex h-screen font-sans text-sm bg-white text-neutral-800">
    <aside class="w-56 shrink-0 border-r border-neutral-200 flex flex-col overflow-hidden">
      <div class="h-11 flex items-center px-4 border-b border-neutral-200 shrink-0">
        <span class="font-semibold tracking-tight text-base">sketches</span>
      </div>
      <nav id="nav" class="flex-1 overflow-y-auto py-2"></nav>
    </aside>
    <main class="flex-1 flex flex-col overflow-hidden">
      <div class="h-11 flex items-center justify-between px-4 border-b border-neutral-200 shrink-0">
        <div id="header" class="flex gap-2"></div>
        <div class="flex gap-2">
          <button id="restart-btn" class="text-xs px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-700 text-white transition-colors hidden">Restart ↺</button>
          <a id="open-btn" target="_blank" class="text-xs px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-700 text-white transition-colors hidden">Open ↗</a>
        </div>
      </div>
      <iframe id="frame" class="flex-1 w-full border-0 bg-white"></iframe>
    </main>
  </div>
`

const nav = document.querySelector('#nav')
const frame = document.querySelector('#frame')
const header = document.querySelector('#header')
const openBtn = document.querySelector('#open-btn')
const restartBtn = document.querySelector('#restart-btn')

restartBtn.addEventListener('click', () => { frame.src = frame.src })

let active = null

function select(item, el) {
  if (active?.el) active.el.classList.remove('bg-neutral-100', 'text-neutral-900', 'font-medium')
  active = { item, el }
  el.classList.add('bg-neutral-100', 'text-neutral-900', 'font-medium')
  frame.src = item.url
  const pill = 'text-xs px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-600 font-mono'
  header.innerHTML = `<span class="${pill}">${item.date}</span><span class="${pill} capitalize">${item.label}</span>`
  openBtn.href = item.url
  openBtn.classList.remove('hidden')
  restartBtn.classList.remove('hidden')
}

for (const year of years) {
  const section = document.createElement('div')
  section.className = 'mb-1'
  section.innerHTML = `<div class="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">${year}</div>`

  for (const item of index[year]) {
    const btn = document.createElement('button')
    btn.className = 'w-full text-left px-4 py-1.5 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors capitalize'
    btn.textContent = item.label
    btn.addEventListener('click', () => select(item, btn))
    section.appendChild(btn)
  }

  nav.appendChild(section)
}

// Auto-select first sketch
const firstYear = years[0]
if (firstYear) {
  const firstItem = index[firstYear][0]
  const firstBtn = nav.querySelector('button')
  if (firstBtn) select(firstItem, firstBtn)
}
