/**
 * useAgentActions
 *
 * Processes agent action commands returned from the AI chat endpoint and
 * executes them against the platform UI:
 *
 *   navigate        — react-router navigation
 *   open_chart      — navigate to /trade?symbol=X
 *   run_analysis    — trigger the analyse tab + run
 *   open_create_bot — open bot create modal with prefilled values
 *   switch_tab      — switch AI agent page tab
 */

import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * @param {object} agentPageRef  - ref to the AIAgent page's action dispatcher
 *                                 (set by AIAgent via useImperativeHandle or a context)
 */
export function useAgentActions(dispatchAgentPageAction) {
  const navigate = useNavigate();

  const execute = useCallback((actions = []) => {
    if (!Array.isArray(actions) || actions.length === 0) return;

    for (const action of actions) {
      switch (action.type) {

        case 'navigate':
          if (action.path) {
            navigate(action.path);
          }
          break;

        case 'open_chart':
          if (action.symbol) {
            navigate(`/trade?symbol=${action.symbol.toUpperCase()}`);
          }
          break;

        case 'run_analysis':
          // Switch to analyse tab and trigger the analysis
          dispatchAgentPageAction?.({
            type: 'run_analysis',
            symbol:   action.symbol   || 'BTCUSDT',
            strategy: action.strategy || 'combined',
            params:   action.params   || {},
          });
          break;

        case 'open_create_bot':
          dispatchAgentPageAction?.({
            type:    'open_create_bot',
            prefill: action.prefill || {},
          });
          break;

        case 'switch_tab':
          dispatchAgentPageAction?.({
            type: 'switch_tab',
            tab:  action.tab || 'chat',
          });
          break;

        default:
          console.warn('[AgentActions] Unknown action type:', action.type);
      }
    }
  }, [navigate, dispatchAgentPageAction]);

  return { execute };
}
