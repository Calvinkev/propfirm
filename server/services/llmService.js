/**
 * LLM Service — NVIDIA DeepSeek via OpenAI-compatible API
 *
 * Provides:
 *   analyseChartWithLLM(symbol, indicators, conditions) → { action, confidence, reason, commentary }
 *   chatWithAgent(messages, context)                    → string (assistant reply)
 *   generateTradeReasoning(signal, trade)               → string (explanation)
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey:  process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatIndicators(ind) {
  if (!ind) return 'No indicator data available.';
  const lines = [];
  if (ind.current_price !== undefined) lines.push(`Current Price: $${parseFloat(ind.current_price).toLocaleString()}`);
  if (ind.rsi !== null && ind.rsi !== undefined) lines.push(`RSI(14): ${ind.rsi}`);
  if (ind.macd) {
    lines.push(`MACD Line: ${ind.macd.macd}`);
    lines.push(`MACD Signal: ${ind.macd.signal}`);
    lines.push(`MACD Histogram: ${ind.macd.histogram}`);
  }
  if (ind.bb) {
    lines.push(`Bollinger Upper: ${parseFloat(ind.bb.upper).toFixed(4)}`);
    lines.push(`Bollinger Middle: ${parseFloat(ind.bb.middle).toFixed(4)}`);
    lines.push(`Bollinger Lower: ${parseFloat(ind.bb.lower).toFixed(4)}`);
  }
  if (ind.ema_fast) lines.push(`EMA Fast: ${parseFloat(ind.ema_fast).toFixed(4)}`);
  if (ind.ema_slow) lines.push(`EMA Slow: ${parseFloat(ind.ema_slow).toFixed(4)}`);
  return lines.join('\n');
}

// ─── Chart Analysis ───────────────────────────────────────────────────────────

/**
 * Ask the LLM to interpret technical indicators and provide a trading signal.
 *
 * @param {string} symbol        - e.g. 'BTCUSDT'
 * @param {object} indicators    - output from analyseSymbol()
 * @param {object} conditions    - bot strategy config
 * @param {string} ruleSignal    - rule-based signal 'BUY'|'SELL'|'HOLD'
 * @param {number} ruleConf      - rule-based confidence 0-100
 * @returns {object} { action, confidence, reason, commentary }
 */
export async function analyseChartWithLLM(symbol, indicators, conditions = {}, ruleSignal = 'HOLD', ruleConf = 0) {
  try {
    const strategy = conditions.strategy || 'combined';
    const indicatorText = formatIndicators(indicators);

    const prompt = `You are an expert cryptocurrency technical analyst and algorithmic trader.

Analyse the following real-time technical indicators for ${symbol} and provide a precise trading signal.

## Technical Indicators
${indicatorText}

## Strategy Configuration
- Strategy: ${strategy}
- RSI Oversold threshold: ${conditions.rsi_oversold || 30}
- RSI Overbought threshold: ${conditions.rsi_overbought || 70}
- EMA Fast period: ${conditions.ema_fast || 9}
- EMA Slow period: ${conditions.ema_slow || 21}

## Rule-Based Signal (for reference)
- Signal: ${ruleSignal}
- Confidence: ${ruleConf}%

## Your Task
Based on the indicators above, provide:
1. A trading action: BUY, SELL, or HOLD
2. Confidence level: 0-100 (integer)
3. A concise reason (1-2 sentences explaining the key signals driving your decision)
4. A brief market commentary (2-3 sentences on price action context)

Respond ONLY in this exact JSON format (no extra text, no markdown):
{"action":"BUY","confidence":72,"reason":"RSI is at 28 indicating oversold conditions while price is touching the lower Bollinger Band, suggesting a potential reversal.","commentary":"BTC has been in a short-term downtrend but momentum indicators are showing exhaustion. The confluence of oversold RSI and lower BB touch historically precedes bounces. Risk management is essential given broader market uncertainty."}`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 1024,
    });

    const raw = (completion.choices[0]?.message?.content || completion.choices[0]?.message?.reasoning_content || '').trim();

    // Extract JSON — model might wrap in ```json ... ```
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM returned non-JSON response');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      action:      (['BUY','SELL','HOLD'].includes(parsed.action?.toUpperCase()) ? parsed.action.toUpperCase() : ruleSignal),
      confidence:  Math.min(100, Math.max(0, parseInt(parsed.confidence) || ruleConf)),
      reason:      parsed.reason      || 'LLM analysis complete.',
      commentary:  parsed.commentary  || '',
    };
  } catch (err) {
    console.error('LLM chart analysis error:', err.message);
    // Fall back gracefully — return the rule-based signal
    return {
      action:     ruleSignal,
      confidence: ruleConf,
      reason:     'LLM unavailable — rule-based signal used.',
      commentary: '',
    };
  }
}

// ─── Conversational Agent ─────────────────────────────────────────────────────

/**
 * Chat with the AI trading assistant.
 * Returns { reply: string, actions: Array } where actions are optional UI commands.
 *
 * Supported action types:
 *   { type: 'navigate',       path: '/trade?symbol=BTCUSDT' }
 *   { type: 'open_chart',     symbol: 'BTCUSDT' }
 *   { type: 'run_analysis',   symbol: 'BTCUSDT', strategy: 'combined', params: {} }
 *   { type: 'open_create_bot', prefill: { name, symbol, strategy, trade_amount, auto_execute, conditions } }
 *   { type: 'switch_tab',     tab: 'bots'|'signals'|'analyse'|'chat' }
 *
 * @param {Array}  messages  - OpenAI message array [{ role, content }]
 * @param {object} context   - { symbol, latestPrice, recentSignals }
 * @returns {{ reply: string, actions: Array }}
 */
export async function chatWithAgent(messages, context = {}) {
  try {
    const systemPrompt = `You are StakeUp AI, an expert cryptocurrency trading assistant embedded in the StakeUp Pro trading platform.

Your capabilities:
- Analyse price charts and technical indicators in real time
- Explain trading signals (RSI, MACD, EMA, Bollinger Bands)
- Advise on risk management and position sizing
- Help users configure and automatically set up automated trading bots
- Navigate the platform on behalf of the user (open charts, go to pages, create bots)
- Answer questions about crypto markets, strategies, and trading concepts

Current platform context:
${context.symbol      ? `- Active symbol: ${context.symbol}` : ''}
${context.latestPrice ? `- Latest price: $${parseFloat(context.latestPrice).toLocaleString()}` : ''}
${context.recentSignals?.length ? `- Recent signals: ${context.recentSignals.slice(0,3).map(s => `${s.action} (${s.confidence}%)`).join(', ')}` : ''}

Platform routes:
- /portfolio     — overview dashboard
- /markets       — market overview
- /trade         — spot trading desk (add ?symbol=BTCUSDT to pre-select pair)
- /futures       — futures trading
- /ai-agent      — AI bots & this chat (tabs: bots, signals, analyse, chat)
- /wallet        — deposits & withdrawals
- /earn          — staking/earn products

## AGENT ACTIONS
When the user asks you to DO something on the platform (not just explain), you MUST include an "actions" array in your response.

You MUST respond in this exact JSON envelope — always, no exceptions, even for pure text replies:
{
  "reply": "<your markdown-formatted conversational response here>",
  "actions": []
}

When performing UI actions, populate the actions array with one or more of these objects:

Navigate to a page:
{"type":"navigate","path":"/trade?symbol=BTCUSDT"}

Open chart for a symbol (navigates to trade desk):
{"type":"open_chart","symbol":"BTCUSDT"}

Run an analysis (switches to analyse tab and runs it):
{"type":"run_analysis","symbol":"BTCUSDT","strategy":"combined","params":{"rsi_oversold":30,"rsi_overbought":70,"ema_fast":9,"ema_slow":21}}

Open the create-bot modal pre-filled:
{"type":"open_create_bot","prefill":{"name":"BTC Scalper","symbol":"BTCUSDT","strategy":"combined","trade_amount":10,"auto_execute":false,"conditions":{"rsi_oversold":30,"rsi_overbought":70,"ema_fast":9,"ema_slow":21}}}

Switch tab on AI agent page:
{"type":"switch_tab","tab":"bots"}

## IMPORTANT RULES
- ALWAYS respond with valid JSON in the exact envelope above. Never respond with plain text.
- For pure conversational replies, use actions: []
- When user says "set up a bot", "create a bot", "configure a bot" → use open_create_bot action with sensible prefilled values based on the conversation context
- When user says "show me the chart", "open chart", "go to trading" → use open_chart or navigate action
- When user says "analyse", "run analysis" → use run_analysis action
- When user says "show my bots", "go to bots" → use switch_tab + navigate actions
- Be concise, accurate, and actionable in your reply text.
- Never give financial advice — always remind users that trading involves risk.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      top_p:       0.95,
      max_tokens:  2048,
      stream:      false,
    });

    const raw = (completion.choices[0]?.message?.content || completion.choices[0]?.message?.reasoning_content || '').trim();

    // Try to parse as JSON envelope { reply, actions }
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.reply !== undefined) {
          return {
            reply:   parsed.reply,
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          };
        }
      }
    } catch (_) {
      // fall through to plain text
    }

    // Fallback: plain text reply, no actions
    return { reply: raw || 'Sorry, I could not generate a response.', actions: [] };

  } catch (err) {
    console.error('LLM chat error:', err.message);
    return { reply: 'The AI assistant is temporarily unavailable. Please try again shortly.', actions: [] };
  }
}

// ─── Trade Reasoning ──────────────────────────────────────────────────────────

/**
 * Generate a plain-English explanation for an auto-executed trade.
 *
 * @param {object} signal - { action, confidence, reason, indicators }
 * @param {object} trade  - { symbol, amount, price }
 * @returns {string}
 */
export async function generateTradeReasoning(signal, trade) {
  try {
    const prompt = `An automated trading bot just executed a ${signal.action} order.

Trade details:
- Symbol: ${trade.symbol}
- Action: ${signal.action}
- Amount: ${trade.amount}
- Price: $${parseFloat(trade.price).toFixed(2)}
- Confidence: ${signal.confidence}%

Indicators at time of trade:
${formatIndicators(signal.indicators)}

Rule-based reason: ${signal.reason}

Write a 2-sentence plain-English explanation of why this trade was executed, suitable for a non-expert trader to understand. Be factual and concise.`;

    const completion = await openai.chat.completions.create({
      model:       MODEL,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens:  400,
    });

    return (completion.choices[0]?.message?.content || completion.choices[0]?.message?.reasoning_content || '').trim() || signal.reason;
  } catch (err) {
    console.error('LLM trade reasoning error:', err.message);
    return signal.reason;
  }
}
