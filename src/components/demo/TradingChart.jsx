import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createChart } from 'lightweight-charts'
import { wsService } from '../../services/websocket'
import { api } from '../../services/api'
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateBollingerBands, extractClosePrices, formatIndicatorForChart } from '../../utils/indicators'
import './TradingChart.css'

const RESOLUTIONS = [1, 5, 15, 60, 240, 1440]
const RES_LABELS  = { 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h', 1440: '1D' }

// Category badge colours
const CAT_STYLE = {
  crypto:  { bg: 'rgba(201,162,39,0.12)', color: '#C9A227' },
  forex:   { bg: 'rgba(62,207,142,0.12)', color: '#3ECF8E' },
  indices: { bg: 'rgba(154,157,163,0.12)', color: '#9A9DA3' },
}

// ─── Inner chart canvas + header ─────────────────────────────────────────────
function ChartCanvas({
  symbol, bid, ask, token, fullscreen, onToggleFullscreen,
  instruments, onSymbolChange,
}) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef(null)
  const candleRef    = useRef(null)

  const [connected,    setConnected]    = useState(false)
  const [resolution,   setResolution]   = useState(1)
  const [loadingHist,  setLoadingHist]  = useState(false)
  const [pairMenuOpen, setPairMenuOpen] = useState(false)
  const [menuPos,      setMenuPos]      = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)

  // Indicator state
  const [activeIndicators, setActiveIndicators] = useState({
    sma20: false,
    ema20: false,
    rsi: false,
    macd: false,
    bollinger: false
  })
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false)
  const indicatorSeriesRef = useRef({})

  // Drawing tools state
  const [activeDrawingTool, setActiveDrawingTool] = useState(null) // 'trendline', 'rectangle', 'hline', null
  const [drawingMenuOpen, setDrawingMenuOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingStart, setDrawingStart] = useState(null)
  const drawingSeriesRef = useRef([])

  const chartHeight = fullscreen ? window.innerHeight - 56 : 360

  // Close pair menu when clicking outside
  useEffect(() => {
    if (!pairMenuOpen) return
    const handler = (e) => {
      if (!e.target.closest('.pair-menu-portal') && !e.target.closest('.pair-trigger')) {
        setPairMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pairMenuOpen])

  // Close indicator menu when clicking outside
  useEffect(() => {
    if (!indicatorMenuOpen) return
    const handler = (e) => {
      if (!e.target.closest('.indicator-menu-portal') && !e.target.closest('.indicator-trigger')) {
        setIndicatorMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [indicatorMenuOpen])

  // Close drawing menu when clicking outside
  useEffect(() => {
    if (!drawingMenuOpen) return
    const handler = (e) => {
      if (!e.target.closest('.drawing-menu-portal') && !e.target.closest('.drawing-trigger')) {
        setDrawingMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [drawingMenuOpen])

  const openMenu = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setMenuPos({
        top:  r.bottom + 6,   // fixed = viewport coords, no scrollY needed
        left: r.left,
      })
    }
    setPairMenuOpen(p => !p)
  }

  const openIndicatorMenu = () => {
    const btn = document.querySelector('.indicator-trigger')
    if (btn) {
      const r = btn.getBoundingClientRect()
      setMenuPos({
        top:  r.bottom + 6,
        left: r.left,
      })
    }
    setIndicatorMenuOpen(p => !p)
  }

  const openDrawingMenu = () => {
    const btn = document.querySelector('.drawing-trigger')
    if (btn) {
      const r = btn.getBoundingClientRect()
      setMenuPos({
        top:  r.bottom + 6,
        left: r.left,
      })
    }
    setDrawingMenuOpen(p => !p)
  }

  // Handle drawing on chart
  const handleChartMouseDown = useCallback((e) => {
    if (!activeDrawingTool || !chartRef.current) return
    
    const chart = chartRef.current
    const timeScale = chart.timeScale()
    
    // Get mouse position from event
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Convert to chart coordinates
    const time = timeScale.coordinateToTime(x)
    
    // Get price from the series data (approximate)
    const data = seriesRef.current?.data()
    const price = data && data.length > 0 ? data[data.length - 1].close : 0
    
    setDrawingStart({ time, price, x, y })
    setIsDrawing(true)
  }, [activeDrawingTool])

  const handleChartMouseMove = useCallback((e) => {
    if (!isDrawing || !drawingStart || !chartRef.current) return
    
    const chart = chartRef.current
    const timeScale = chart.timeScale()
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const time = timeScale.coordinateToTime(x)
    
    // Get price from series data
    const data = seriesRef.current?.data()
    const price = data && data.length > 0 ? data[data.length - 1].close : 0
    
    // Update preview drawing would go here
    // For now, we'll just track the current position
  }, [isDrawing, drawingStart])

  const handleChartMouseUp = useCallback((e) => {
    if (!isDrawing || !drawingStart || !chartRef.current) return
    
    const chart = chartRef.current
    const timeScale = chart.timeScale()
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const time = timeScale.coordinateToTime(x)
    
    // Get price from series data
    const data = seriesRef.current?.data()
    const price = data && data.length > 0 ? data[data.length - 1].close : 0
    
    // Create the drawing based on tool type
    if (activeDrawingTool === 'trendline') {
      const lineSeries = chart.addLineSeries({
        color: '#C9A227',
        lineWidth: 2,
        lineStyle: 0, // solid
      })
      lineSeries.setData([
        { time: drawingStart.time, value: drawingStart.price },
        { time: time, value: price }
      ])
      drawingSeriesRef.current.push(lineSeries)
    } else if (activeDrawingTool === 'hline') {
      const lineSeries = chart.addLineSeries({
        color: '#E5484D',
        lineWidth: 2,
        lineStyle: 2, // dashed
      })
      lineSeries.setData([
        { time: drawingStart.time, value: drawingStart.price },
        { time: time, value: drawingStart.price }
      ])
      drawingSeriesRef.current.push(lineSeries)
    } else if (activeDrawingTool === 'rectangle') {
      // Rectangle as two lines (top and bottom)
      const topLine = chart.addLineSeries({
        color: '#3ECF8E',
        lineWidth: 1,
        lineStyle: 2,
      })
      const bottomLine = chart.addLineSeries({
        color: '#3ECF8E',
        lineWidth: 1,
        lineStyle: 2,
      })
      
      const topPrice = Math.max(drawingStart.price, price)
      const bottomPrice = Math.min(drawingStart.price, price)
      
      topLine.setData([
        { time: drawingStart.time, value: topPrice },
        { time: time, value: topPrice }
      ])
      bottomLine.setData([
        { time: drawingStart.time, value: bottomPrice },
        { time: time, value: bottomPrice }
      ])
      
      drawingSeriesRef.current.push(topLine, bottomLine)
    }
    
    setIsDrawing(false)
    setDrawingStart(null)
  }, [isDrawing, drawingStart, activeDrawingTool])

  const clearAllDrawings = useCallback(() => {
    drawingSeriesRef.current.forEach(series => {
      try { series.remove() } catch (_) {}
    })
    drawingSeriesRef.current = []
  }, [])

  // Apply indicators to chart
  const applyIndicators = useCallback((candles) => {
    if (!chartRef.current || !candles || candles.length === 0) return

    const closePrices = extractClosePrices(candles)
    const timestamps = candles.map(c => c.time)

    // Clear existing indicator series
    Object.values(indicatorSeriesRef.current).forEach(series => {
      try { series.remove() } catch (_) {}
    })
    indicatorSeriesRef.current = {}

    // SMA 20
    if (activeIndicators.sma20) {
      const smaData = calculateSMA(closePrices, 20)
      const formattedSMA = formatIndicatorForChart(smaData, timestamps)
      const smaSeries = chartRef.current.addLineSeries({
        color: '#2962FF',
        lineWidth: 1,
        title: 'SMA 20'
      })
      smaSeries.setData(formattedSMA)
      indicatorSeriesRef.current.sma20 = smaSeries
    }

    // EMA 20
    if (activeIndicators.ema20) {
      const emaData = calculateEMA(closePrices, 20)
      const formattedEMA = formatIndicatorForChart(emaData, timestamps)
      const emaSeries = chartRef.current.addLineSeries({
        color: '#FF6D00',
        lineWidth: 1,
        title: 'EMA 20'
      })
      emaSeries.setData(formattedEMA)
      indicatorSeriesRef.current.ema20 = emaSeries
    }

    // RSI (separate pane)
    if (activeIndicators.rsi) {
      const rsiData = calculateRSI(closePrices, 14)
      const formattedRSI = formatIndicatorForChart(rsiData, timestamps)
      
      // Add RSI pane
      const rsiSeries = chartRef.current.addLineSeries({
        color: '#9C27B0',
        lineWidth: 1,
        title: 'RSI',
        priceScaleId: 'rsi'
      })
      rsiSeries.setData(formattedRSI)
      
      chartRef.current.priceScale('rsi').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 }
      })
      
      indicatorSeriesRef.current.rsi = rsiSeries
    }

    // Bollinger Bands
    if (activeIndicators.bollinger) {
      const bbData = calculateBollingerBands(closePrices, 20, 2)
      const formattedUpper = formatIndicatorForChart(bbData.upper, timestamps)
      const formattedMiddle = formatIndicatorForChart(bbData.middle, timestamps)
      const formattedLower = formatIndicatorForChart(bbData.lower, timestamps)

      const upperSeries = chartRef.current.addLineSeries({
        color: '#4CAF50',
        lineWidth: 1,
        title: 'BB Upper'
      })
      const middleSeries = chartRef.current.addLineSeries({
        color: '#FF9800',
        lineWidth: 1,
        title: 'BB Middle'
      })
      const lowerSeries = chartRef.current.addLineSeries({
        color: '#4CAF50',
        lineWidth: 1,
        title: 'BB Lower'
      })

      upperSeries.setData(formattedUpper)
      middleSeries.setData(formattedMiddle)
      lowerSeries.setData(formattedLower)

      indicatorSeriesRef.current.bollingerUpper = upperSeries
      indicatorSeriesRef.current.bollingerMiddle = middleSeries
      indicatorSeriesRef.current.bollingerLower = lowerSeries
    }

    // MACD (separate pane)
    if (activeIndicators.macd) {
      const macdData = calculateMACD(closePrices, 12, 26, 9)
      const formattedMACD = formatIndicatorForChart(macdData.macd, timestamps)
      const formattedSignal = formatIndicatorForChart(macdData.signal, timestamps)
      const formattedHist = formatIndicatorForChart(macdData.histogram, timestamps)

      const macdSeries = chartRef.current.addLineSeries({
        color: '#2962FF',
        lineWidth: 1,
        title: 'MACD',
        priceScaleId: 'macd'
      })
      const signalSeries = chartRef.current.addLineSeries({
        color: '#FF6D00',
        lineWidth: 1,
        title: 'Signal',
        priceScaleId: 'macd'
      })
      const histSeries = chartRef.current.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'macd'
      })

      macdSeries.setData(formattedMACD)
      signalSeries.setData(formattedSignal)
      
      const histData = macdData.histogram.map((val, i) => ({
        time: timestamps[i],
        value: val,
        color: val >= 0 ? '#26a69a' : '#ef5350'
      })).filter(d => d.value !== null)
      histSeries.setData(histData)

      chartRef.current.priceScale('macd').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 }
      })

      indicatorSeriesRef.current.macd = macdSeries
      indicatorSeriesRef.current.signal = signalSeries
      indicatorSeriesRef.current.histogram = histSeries
    }
  }, [activeIndicators])

  // Re-apply indicators when they change
  useEffect(() => {
    if (seriesRef.current && chartRef.current) {
      const currentData = seriesRef.current.data()
      if (currentData && currentData.length > 0) {
        applyIndicators(currentData)
      }
    }
  }, [activeIndicators, applyIndicators])

  // ── Create / destroy chart ────────────────────────────────────────────────
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth || 640

      const chart = createChart(containerRef.current, {
        width,
        height: chartHeight,
        layout: {
          background: { color: '#14171A' },
          textColor:  '#9A9DA3',
        },
        grid: {
          vertLines: { color: '#1E2226' },
          horzLines: { color: '#1E2226' },
        },
        crosshair: {
          vertLine: { color: '#C9A227', labelBackgroundColor: '#C9A227' },
          horzLine: { color: '#C9A227', labelBackgroundColor: '#C9A227' },
        },
        rightPriceScale: { borderColor: '#26292E' },
        timeScale: { borderColor: '#26292E', timeVisible: true, secondsVisible: false },
      })

      const series = chart.addCandlestickSeries({
        upColor:         '#3ECF8E',
        downColor:       '#E5484D',
        borderUpColor:   '#3ECF8E',
        borderDownColor: '#E5484D',
        wickUpColor:     '#3ECF8E',
        wickDownColor:   '#E5484D',
      })

      chartRef.current  = chart
      seriesRef.current = series

      const ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect?.width
        if (w && chartRef.current) chartRef.current.applyOptions({ width: w })
      })
      ro.observe(containerRef.current)
      chart._ro = ro
    })

    return () => {
      cancelAnimationFrame(frame)
      if (chartRef.current) {
        chartRef.current._ro?.disconnect()
        chartRef.current.remove()
        chartRef.current  = null
        seriesRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  // ── Load historical candles ───────────────────────────────────────────────
  const loadHistory = useCallback(async (sym, res) => {
    if (!sym || !token || !seriesRef.current) return
    setLoadingHist(true)
    try {
      const data = await api.getDemoPriceCandles(token, sym, { resolution: res, limit: 1000 })
      if (!seriesRef.current) return
      if (data.candles?.length > 0) {
        seriesRef.current.setData(data.candles)
        chartRef.current?.timeScale().fitContent()
        // Apply indicators after loading data
        applyIndicators(data.candles)
      }
    } catch (err) {
      console.error('loadHistory error:', err)
    } finally {
      setLoadingHist(false)
    }
  }, [token, applyIndicators])

  // ── Subscribe + stream live ticks ─────────────────────────────────────────
  useEffect(() => {
    if (!symbol) return

    const storedToken = token || localStorage.getItem('token')
    if (storedToken && !wsService.isConnected) wsService.connect(storedToken)

    wsService.subscribeToPriceRoom(symbol)
    setConnected(false)
    candleRef.current = null

    if (seriesRef.current) {
      try { seriesRef.current.setData([]) } catch (_) {}
    }

    const t = setTimeout(() => loadHistory(symbol, resolution), 120)

    const handler = (data) => {
      if (!seriesRef.current) return
      setConnected(true)

      const price       = (parseFloat(data.bid) + parseFloat(data.ask)) / 2
      const intervalSec = resolution * 60
      const bucket      = Math.floor(Date.now() / 1000 / intervalSec) * intervalSec

      if (!candleRef.current || candleRef.current.time !== bucket) {
        if (candleRef.current) {
          try { seriesRef.current.update(candleRef.current) } catch (_) {}
        }
        candleRef.current = { time: bucket, open: price, high: price, low: price, close: price }
      } else {
        candleRef.current.high  = Math.max(candleRef.current.high, price)
        candleRef.current.low   = Math.min(candleRef.current.low,  price)
        candleRef.current.close = price
      }
      try { seriesRef.current.update(candleRef.current) } catch (_) {}
    }

    wsService.on(`price:${symbol}`, handler)

    return () => {
      clearTimeout(t)
      wsService.off(`price:${symbol}`, handler)
      wsService.unsubscribeFromPriceRoom(symbol)
      candleRef.current = null
      if (seriesRef.current) {
        try { seriesRef.current.setData([]) } catch (_) {}
      }
    }
  }, [symbol, resolution, loadHistory, fullscreen])

  const dec = symbol?.includes('BTC') || symbol?.includes('ETH') ? 2 : 5

  // Group instruments by category for the dropdown
  const byCategory = instruments.reduce((acc, i) => {
    const cat = i.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(i)
    return acc
  }, {})

  const currentInstrument = instruments.find(i => i.symbol === symbol)

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="chart-header">

        {/* Pair switcher */}
        <div className="pair-switcher">
          <button
            ref={triggerRef}
            className="pair-trigger"
            onClick={openMenu}
            aria-haspopup="listbox"
            aria-expanded={pairMenuOpen}
          >
            <span className="pair-trigger-symbol">{symbol}</span>
            {currentInstrument && (
              <span
                className="pair-cat-badge"
                style={CAT_STYLE[currentInstrument.category] || CAT_STYLE.indices}
              >
                {currentInstrument.category}
              </span>
            )}
            <svg className="pair-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {pairMenuOpen && createPortal(
            <div
              className="pair-menu pair-menu-portal"
              role="listbox"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} className="pair-group">
                  <div className="pair-group-label">{cat}</div>
                  {items.map(i => {
                    const price    = i.bid ? parseFloat(i.bid) : null
                    const priceDec = i.symbol.includes('BTC') || i.symbol.includes('ETH') ? 2 : 5
                    const catStyle = CAT_STYLE[i.category] || CAT_STYLE.indices
                    return (
                      <button
                        key={i.symbol}
                        className={`pair-option ${i.symbol === symbol ? 'active' : ''}`}
                        onClick={() => {
                          onSymbolChange?.(i.symbol)
                          setPairMenuOpen(false)
                        }}
                        role="option"
                        aria-selected={i.symbol === symbol}
                      >
                        <span className="po-symbol">{i.symbol}</span>
                        <span className="po-name">{i.display_name}</span>
                        <span className="po-price" style={{ color: catStyle.color }}>
                          {price ? price.toFixed(priceDec) : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>,
            document.body
          )}
        </div>

        {/* Live bid / ask */}
        <div className="chart-prices">
          {bid && ask ? (
            <>
              <span className="chart-bid">Bid <b>{parseFloat(bid).toFixed(dec)}</b></span>
              <span className="chart-ask">Ask <b>{parseFloat(ask).toFixed(dec)}</b></span>
              <span className="chart-spread">
                Spread {(parseFloat(ask) - parseFloat(bid)).toFixed(dec)}
              </span>
            </>
          ) : (
            <span className="chart-no-price">Waiting for price…</span>
          )}
        </div>

        {/* Resolution tabs */}
        <div className="chart-res-tabs">
          {RESOLUTIONS.map(r => (
            <button
              key={r}
              className={`res-btn ${resolution === r ? 'active' : ''}`}
              onClick={() => setResolution(r)}
            >
              {RES_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Indicators button */}
        <button
          className="indicator-trigger"
          onClick={openIndicatorMenu}
          aria-haspopup="listbox"
          aria-expanded={indicatorMenuOpen}
          title="Technical Indicators"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h2M6 8h2M10 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M2 4h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>Indicators</span>
          <svg className="pair-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Drawing tools button */}
        <button
          className={`drawing-trigger ${activeDrawingTool ? 'active' : ''}`}
          onClick={openDrawingMenu}
          aria-haspopup="listbox"
          aria-expanded={drawingMenuOpen}
          title="Drawing Tools"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14l2-2M14 2l-2 2M4 12l8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M12 4l2-2M4 12l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>Draw</span>
          <svg className="pair-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {indicatorMenuOpen && createPortal(
          <div
            className="indicator-menu indicator-menu-portal"
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <div className="indicator-group-label">Moving Averages</div>
            <button
              className={`indicator-option ${activeIndicators.sma20 ? 'active' : ''}`}
              onClick={() => setActiveIndicators(prev => ({ ...prev, sma20: !prev.sma20 }))}
            >
              <span>SMA 20</span>
              {activeIndicators.sma20 && <span className="indicator-check">✓</span>}
            </button>
            <button
              className={`indicator-option ${activeIndicators.ema20 ? 'active' : ''}`}
              onClick={() => setActiveIndicators(prev => ({ ...prev, ema20: !prev.ema20 }))}
            >
              <span>EMA 20</span>
              {activeIndicators.ema20 && <span className="indicator-check">✓</span>}
            </button>

            <div className="indicator-group-label">Oscillators</div>
            <button
              className={`indicator-option ${activeIndicators.rsi ? 'active' : ''}`}
              onClick={() => setActiveIndicators(prev => ({ ...prev, rsi: !prev.rsi }))}
            >
              <span>RSI (14)</span>
              {activeIndicators.rsi && <span className="indicator-check">✓</span>}
            </button>
            <button
              className={`indicator-option ${activeIndicators.macd ? 'active' : ''}`}
              onClick={() => setActiveIndicators(prev => ({ ...prev, macd: !prev.macd }))}
            >
              <span>MACD (12, 26, 9)</span>
              {activeIndicators.macd && <span className="indicator-check">✓</span>}
            </button>

            <div className="indicator-group-label">Bands</div>
            <button
              className={`indicator-option ${activeIndicators.bollinger ? 'active' : ''}`}
              onClick={() => setActiveIndicators(prev => ({ ...prev, bollinger: !prev.bollinger }))}
            >
              <span>Bollinger Bands (20, 2)</span>
              {activeIndicators.bollinger && <span className="indicator-check">✓</span>}
            </button>
          </div>,
          document.body
        )}

        {drawingMenuOpen && createPortal(
          <div
            className="drawing-menu drawing-menu-portal"
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <div className="indicator-group-label">Drawing Tools</div>
            <button
              className={`indicator-option ${activeDrawingTool === 'trendline' ? 'active' : ''}`}
              onClick={() => { setActiveDrawingTool('trendline'); setDrawingMenuOpen(false); }}
            >
              <span>Trend Line</span>
              {activeDrawingTool === 'trendline' && <span className="indicator-check">✓</span>}
            </button>
            <button
              className={`indicator-option ${activeDrawingTool === 'hline' ? 'active' : ''}`}
              onClick={() => { setActiveDrawingTool('hline'); setDrawingMenuOpen(false); }}
            >
              <span>Horizontal Line</span>
              {activeDrawingTool === 'hline' && <span className="indicator-check">✓</span>}
            </button>
            <button
              className={`indicator-option ${activeDrawingTool === 'rectangle' ? 'active' : ''}`}
              onClick={() => { setActiveDrawingTool('rectangle'); setDrawingMenuOpen(false); }}
            >
              <span>Rectangle</span>
              {activeDrawingTool === 'rectangle' && <span className="indicator-check">✓</span>}
            </button>
            
            <div className="indicator-group-label">Actions</div>
            <button
              className="indicator-option"
              onClick={() => { setActiveDrawingTool(null); setDrawingMenuOpen(false); }}
            >
              <span>Disable Drawing</span>
            </button>
            <button
              className="indicator-option"
              onClick={() => { clearAllDrawings(); setDrawingMenuOpen(false); }}
            >
              <span>Clear All Drawings</span>
            </button>
          </div>,
          document.body
        )}

        {/* Status */}
        <div className={`chart-status ${connected ? 'live' : 'waiting'}`}>
          <span className="dot" />
          {loadingHist ? 'Loading…' : connected ? 'Live' : 'Connecting…'}
        </div>

        {/* Expand / compress */}
        <button
          className="chart-expand-btn"
          onClick={onToggleFullscreen}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Expand chart'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Expand chart'}
        >
          {fullscreen ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 1v4H1M9 1v4h4M5 13v-4H1M9 13v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Chart canvas ───────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="chart-canvas"
        style={{ height: chartHeight, cursor: activeDrawingTool ? 'crosshair' : 'default' }}
        onMouseDown={handleChartMouseDown}
        onMouseMove={handleChartMouseMove}
        onMouseUp={handleChartMouseUp}
      />
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TradingChart({ symbol, bid, ask, token, instruments = [], onSymbolChange }) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    document.body.style.overflow = fullscreen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fullscreen])

  const sharedProps = {
    symbol, bid, ask, token,
    instruments, onSymbolChange,
  }

  if (fullscreen) {
    return (
      <div className="chart-fullscreen-overlay">
        <div className="chart-fullscreen-inner">
          <ChartCanvas
            {...sharedProps}
            fullscreen={true}
            onToggleFullscreen={() => setFullscreen(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="trading-chart">
      <ChartCanvas
        {...sharedProps}
        fullscreen={false}
        onToggleFullscreen={() => setFullscreen(true)}
      />
    </div>
  )
}
