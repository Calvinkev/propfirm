/**
 * Technical Indicator Calculations
 * SMA, EMA, RSI, MACD, Bollinger Bands
 */

// Simple Moving Average
export function calculateSMA(data, period) {
  const sma = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null)
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      sma.push(sum / period)
    }
  }
  return sma
}

// Exponential Moving Average
export function calculateEMA(data, period) {
  const ema = []
  const multiplier = 2 / (period + 1)
  
  // Start with SMA for first value
  let sum = 0
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i]
    ema.push(null)
  }
  
  if (data.length >= period) {
    ema[period - 1] = sum / period
    
    for (let i = period; i < data.length; i++) {
      ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
  }
  
  return ema
}

// Relative Strength Index
export function calculateRSI(data, period = 14) {
  const rsi = []
  const gains = []
  const losses = []
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1]
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }
  
  // Calculate initial average gain/loss
  let avgGain = 0
  let avgLoss = 0
  
  for (let i = 0; i < period && i < gains.length; i++) {
    avgGain += gains[i]
    avgLoss += losses[i]
  }
  
  if (gains.length >= period) {
    avgGain /= period
    avgLoss /= period
    
    // First RSI value
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - (100 / (1 + rs)))
    
    // Calculate subsequent RSI values using smoothed average
    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period
      
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      rsi.push(100 - (100 / (1 + rs)))
    }
  }
  
  // Pad with null for initial values
  while (rsi.length < data.length) {
    rsi.unshift(null)
  }
  
  return rsi
}

// MACD (Moving Average Convergence Divergence)
export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calculateEMA(data, fastPeriod)
  const emaSlow = calculateEMA(data, slowPeriod)
  
  const macdLine = []
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) {
      macdLine.push(null)
    } else {
      macdLine.push(emaFast[i] - emaSlow[i])
    }
  }
  
  // Filter out null values for signal line calculation
  const validMacd = macdLine.filter(v => v !== null)
  const signalLineData = calculateEMA(validMacd, signalPeriod)
  
  // Pad signal line with nulls to match original length
  const signalLine = []
  let signalIndex = 0
  const nullCount = macdLine.filter(v => v === null).length
  
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null)
    } else {
      if (signalIndex < signalLineData.length) {
        signalLine.push(signalLineData[signalIndex])
        signalIndex++
      } else {
        signalLine.push(null)
      }
    }
  }
  
  // Histogram
  const histogram = []
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null) {
      histogram.push(null)
    } else {
      histogram.push(macdLine[i] - signalLine[i])
    }
  }
  
  return {
    macd: macdLine,
    signal: signalLine,
    histogram
  }
}

// Bollinger Bands
export function calculateBollingerBands(data, period = 20, stdDev = 2) {
  const sma = calculateSMA(data, period)
  const upper = []
  const lower = []
  
  for (let i = 0; i < data.length; i++) {
    if (sma[i] === null || i < period - 1) {
      upper.push(null)
      lower.push(null)
    } else {
      const slice = data.slice(i - period + 1, i + 1)
      const mean = sma[i]
      const squaredDiffs = slice.map(val => Math.pow(val - mean, 2))
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period
      const std = Math.sqrt(variance)
      
      upper.push(mean + (std * stdDev))
      lower.push(mean - (std * stdDev))
    }
  }
  
  return {
    middle: sma,
    upper,
    lower
  }
}

// Convert candle data to close prices array
export function extractClosePrices(candles) {
  return candles.map(candle => candle.close)
}

// Convert indicator arrays back to lightweight-charts format
export function formatIndicatorForChart(data, timestamps) {
  return data.map((value, index) => ({
    time: timestamps[index],
    value: value
  })).filter(point => point.value !== null)
}
