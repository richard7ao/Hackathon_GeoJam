import './style.css'
import maplibregl, { type LngLatLike, type MapMouseEvent, type MapGeoJSONFeature, type ExpressionSpecification } from 'maplibre-gl'

type ViewMode = 'actual' | 'predicted' | 'residual'

type NdviRow = { MSOA21CD: string; actual: number; predicted: number }

type MsoaProps = {
  MSOA21CD: string
  MSOA21NM: string
  population?: number
  pop_density?: number
  dist_to_centre_km?: number
  dist_to_park_km?: number
  area_km2?: number
  actual?: number
  predicted?: number
  residual?: number
}

const SOURCE_ID = 'msoa'
const FILL_LAYER = 'msoa-fill'
const LINE_LAYER = 'msoa-line'
const HIGHLIGHT_LAYER = 'msoa-highlight'

// Sequential greens (NDVI ramp). Colour stops cover the typical urban range.
const NDVI_RAMP: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'actual'],
  0.10, '#3a2a14',
  0.25, '#6b5223',
  0.40, '#98a132',
  0.55, '#6fbf3a',
  0.70, '#3a9b3a',
  0.85, '#1f6b2a',
]
const PREDICTED_RAMP: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'predicted'],
  0.10, '#3a2a14',
  0.25, '#6b5223',
  0.40, '#98a132',
  0.55, '#6fbf3a',
  0.70, '#3a9b3a',
  0.85, '#1f6b2a',
]
const RESIDUAL_RAMP: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'residual'],
  -0.25, '#b91c1c',
  -0.12, '#ef4444',
  -0.04, '#fca5a5',
   0.00, '#2a313e',
   0.04, '#93c5fd',
   0.12, '#3b82f6',
   0.25, '#1d4ed8',
]

const VIEW_HELP: Record<ViewMode, string> = {
  actual:    'Mean NDVI per MSOA, measured from satellite. Brighter green = more vegetation.',
  predicted: 'NDVI the model expects from urban features alone (density, centrality, parks).',
  residual:  'Actual minus predicted. Red = surprisingly grey (invest here). Blue = surprisingly green.',
}

let state = {
  view: 'actual' as ViewMode,
  threshold: 0,
  selectedId: null as string | null,
  features: [] as MapGeoJSONFeature[],
}

async function main() {
  const [geojson, ndvi] = await Promise.all([
    fetch('/msoa.geojson').then(r => r.json()),
    fetch('/ndvi_mock.json').then(r => r.json() as Promise<NdviRow[]>),
  ])

  // Join NDVI data into the GeoJSON properties
  const ndviByCode = new Map(ndvi.map(r => [r.MSOA21CD, r]))
  for (const f of geojson.features) {
    const row = ndviByCode.get(f.properties.MSOA21CD)
    if (row) {
      f.properties.actual = row.actual
      f.properties.predicted = row.predicted
      f.properties.residual = +(row.actual - row.predicted).toFixed(4)
    }
  }

  // Stash for ranklists
  state.features = geojson.features

  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [-0.118, 51.509] as LngLatLike,
    zoom: 9.2,
    maxZoom: 16,
    minZoom: 8,
  })
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')
  ;(window as unknown as { __map: maplibregl.Map }).__map = map

  map.on('load', () => {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: geojson,
      promoteId: 'MSOA21CD',
    })

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': NDVI_RAMP,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hovered'], false], 0.95,
          0.75,
        ],
      },
    })

    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#000',
        'line-width': 0.3,
        'line-opacity': 0.4,
      },
    })

    map.addLayer({
      id: HIGHLIGHT_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#6ee7b7',
        'line-width': 2,
      },
      filter: ['==', ['get', 'MSOA21CD'], ''],
    })

    wireUI(map)
    applyView(map)
    renderRanklists()
    renderLegend()
    setViewHelp()
  })

  let hoveredId: string | null = null
  const tooltip = document.getElementById('tooltip')!

  map.on('mousemove', FILL_LAYER, (e) => {
    if (!e.features?.length) return
    const f = e.features[0]
    const id = f.properties.MSOA21CD as string

    if (hoveredId !== id) {
      if (hoveredId) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hovered: false })
      hoveredId = id
      map.setFeatureState({ source: SOURCE_ID, id }, { hovered: true })
    }
    map.getCanvas().style.cursor = 'pointer'

    showTooltip(e, f.properties as MsoaProps)
  })

  map.on('mouseleave', FILL_LAYER, () => {
    if (hoveredId) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hovered: false })
    hoveredId = null
    map.getCanvas().style.cursor = ''
    tooltip.hidden = true
  })

  map.on('click', FILL_LAYER, (e) => {
    if (!e.features?.length) return
    const f = e.features[0]
    selectMsoa(map, f.properties as MsoaProps)
  })
}

function wireUI(map: maplibregl.Map) {
  document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.view = btn.dataset.view as ViewMode
      applyView(map)
      renderLegend()
      setViewHelp()
    })
  })

  const slider = document.getElementById('threshold') as HTMLInputElement
  const readout = document.getElementById('threshold-val')!
  slider.addEventListener('input', () => {
    state.threshold = parseFloat(slider.value)
    readout.textContent = state.threshold.toFixed(2)
    applyView(map)
  })

  document.getElementById('detail-close')!.addEventListener('click', () => {
    document.getElementById('detail')!.hidden = true
    state.selectedId = null
    map.setFilter(HIGHLIGHT_LAYER, ['==', ['get', 'MSOA21CD'], ''])
  })
}

function applyView(map: maplibregl.Map) {
  const ramp = state.view === 'actual'    ? NDVI_RAMP
            : state.view === 'predicted' ? PREDICTED_RAMP
            :                              RESIDUAL_RAMP
  map.setPaintProperty(FILL_LAYER, 'fill-color', ramp)

  // Threshold filter only applies in residual mode
  const thresholdSection = document.getElementById('threshold-section')!
  if (state.view === 'residual') {
    thresholdSection.hidden = false
    if (state.threshold > 0) {
      map.setPaintProperty(FILL_LAYER, 'fill-opacity', [
        'case',
        ['<', ['abs', ['get', 'residual']], state.threshold], 0.05,
        ['boolean', ['feature-state', 'hovered'], false], 0.95,
        0.85,
      ] as ExpressionSpecification)
    } else {
      map.setPaintProperty(FILL_LAYER, 'fill-opacity', [
        'case',
        ['boolean', ['feature-state', 'hovered'], false], 0.95,
        0.85,
      ] as ExpressionSpecification)
    }
  } else {
    thresholdSection.hidden = true
    map.setPaintProperty(FILL_LAYER, 'fill-opacity', [
      'case',
      ['boolean', ['feature-state', 'hovered'], false], 0.95,
      0.75,
    ] as ExpressionSpecification)
  }
}

function setViewHelp() {
  document.getElementById('view-help')!.textContent = VIEW_HELP[state.view]
}

function renderLegend() {
  const el = document.getElementById('legend')!
  if (state.view === 'residual') {
    el.innerHTML = `
      <div class="legend-bar">
        <span style="background:#b91c1c"></span>
        <span style="background:#ef4444"></span>
        <span style="background:#fca5a5"></span>
        <span style="background:#2a313e"></span>
        <span style="background:#93c5fd"></span>
        <span style="background:#3b82f6"></span>
        <span style="background:#1d4ed8"></span>
      </div>
      <div class="legend-axis"><span>−0.25</span><span>0</span><span>+0.25</span></div>
      <div class="muted" style="margin-top:4px;font-size:11px;">
        Red = greyer than expected · Blue = greener than expected
      </div>
    `
  } else {
    el.innerHTML = `
      <div class="legend-bar">
        <span style="background:#3a2a14"></span>
        <span style="background:#6b5223"></span>
        <span style="background:#98a132"></span>
        <span style="background:#6fbf3a"></span>
        <span style="background:#3a9b3a"></span>
        <span style="background:#1f6b2a"></span>
      </div>
      <div class="legend-axis"><span>0.10</span><span>0.85</span></div>
      <div class="muted" style="margin-top:4px;font-size:11px;">NDVI — higher = greener</div>
    `
  }
}

function renderRanklists() {
  const withResid = state.features
    .filter(f => typeof f.properties.residual === 'number')
    .sort((a, b) => (a.properties.residual as number) - (b.properties.residual as number))

  const grey = withResid.slice(0, 5)
  const green = withResid.slice(-5).reverse()

  document.getElementById('top-grey')!.innerHTML = grey.map(f => liFor(f)).join('')
  document.getElementById('top-green')!.innerHTML = green.map(f => liFor(f)).join('')

  document.querySelectorAll<HTMLLIElement>('.ranklist li').forEach(li => {
    li.addEventListener('click', () => {
      const f = state.features.find(x => x.properties.MSOA21CD === li.dataset.code)
      if (!f) return
      const map = (window as unknown as { __map: maplibregl.Map }).__map
      selectMsoa(map, f.properties as MsoaProps, true)
    })
  })
}

function liFor(f: MapGeoJSONFeature): string {
  const p = f.properties
  return `<li data-code="${p.MSOA21CD}">
    <span class="rank-name">${p.MSOA21NM}</span>
    <span class="rank-num">${(p.residual as number).toFixed(2)}</span>
  </li>`
}

function showTooltip(e: MapMouseEvent, p: MsoaProps) {
  const tt = document.getElementById('tooltip')!
  tt.innerHTML = `
    <div class="tt-name">${p.MSOA21NM}</div>
    <div class="tt-row"><span>Actual</span><b>${fmt(p.actual)}</b></div>
    <div class="tt-row"><span>Predicted</span><b>${fmt(p.predicted)}</b></div>
    <div class="tt-row"><span>Residual</span><b>${fmtSigned(p.residual)}</b></div>
  `
  tt.hidden = false
  tt.style.left = (e.originalEvent.clientX + 14) + 'px'
  tt.style.top  = (e.originalEvent.clientY + 14) + 'px'
}

function selectMsoa(map: maplibregl.Map, p: MsoaProps, fly = false) {
  state.selectedId = p.MSOA21CD
  map.setFilter(HIGHLIGHT_LAYER, ['==', ['get', 'MSOA21CD'], p.MSOA21CD])

  const detail = document.getElementById('detail')!
  detail.hidden = false
  document.getElementById('detail-name')!.textContent = p.MSOA21NM
  document.getElementById('detail-code')!.textContent = p.MSOA21CD
  document.getElementById('detail-actual')!.textContent = fmt(p.actual)
  document.getElementById('detail-predicted')!.textContent = fmt(p.predicted)
  document.getElementById('detail-residual')!.textContent = fmtSigned(p.residual)
  document.getElementById('detail-pop')!.textContent = p.population?.toLocaleString() ?? '—'
  document.getElementById('detail-density')!.textContent = p.pop_density ? Math.round(p.pop_density).toLocaleString() : '—'
  document.getElementById('detail-centre')!.textContent = p.dist_to_centre_km ? p.dist_to_centre_km.toFixed(1) + ' km' : '—'
  document.getElementById('detail-park')!.textContent = p.dist_to_park_km != null ? p.dist_to_park_km.toFixed(2) + ' km' : '—'

  const verdict = document.getElementById('detail-verdict')!
  const r = p.residual ?? 0
  verdict.classList.remove('grey', 'green', 'normal')
  if (r <= -0.1) {
    verdict.classList.add('grey')
    verdict.textContent = `Surprisingly grey — ${Math.abs(r).toFixed(2)} below the model's prediction. Worth investigating as a candidate for green investment.`
  } else if (r >= 0.1) {
    verdict.classList.add('green')
    verdict.textContent = `Surprisingly green — ${r.toFixed(2)} above the model's prediction. Likely a hidden park, cemetery, or mature tree canopy.`
  } else {
    verdict.classList.add('normal')
    verdict.textContent = `Within ±0.10 of the model's prediction — greenness here is roughly what density and proximity to parks would suggest.`
  }

  if (fly) {
    const f = state.features.find(x => x.properties.MSOA21CD === p.MSOA21CD)
    if (f) {
      const bbox = featureBounds(f)
      if (bbox) map.fitBounds(bbox, { padding: 80, maxZoom: 13, duration: 600 })
    }
  }
}

function featureBounds(f: MapGeoJSONFeature): [[number, number], [number, number]] | null {
  const coords: number[][] = []
  const collect = (g: unknown): void => {
    if (Array.isArray(g) && typeof g[0] === 'number') coords.push(g as number[])
    else if (Array.isArray(g)) g.forEach(collect)
  }
  collect((f.geometry as { coordinates: unknown }).coordinates)
  if (!coords.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x; if (y < minY) minY = y
    if (x > maxX) maxX = x; if (y > maxY) maxY = y
  }
  return [[minX, minY], [maxX, maxY]]
}

function fmt(n: number | undefined): string {
  return n == null ? '—' : n.toFixed(3)
}
function fmtSigned(n: number | undefined): string {
  if (n == null) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(3)
}

main()
