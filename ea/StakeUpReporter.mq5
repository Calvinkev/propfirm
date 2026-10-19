//+------------------------------------------------------------------+
//|  StakeUp Challenge Reporter EA                                    |
//|  Pushes account state + trade events to the StakeUp server.      |
//|  Install on any MT5 terminal. No broker restrictions.            |
//+------------------------------------------------------------------+
#property copyright "StakeUp Capital"
#property version   "1.00"
#property strict

//--- Inputs
input string ServerURL    = "http://localhost:5000";  // StakeUp server URL
input string ApiKey       = "";                        // Paste your API key from dashboard
input string AccountLabel = "";                        // Your StakeUp account ID (e.g. STAKEUP-12345)
input int    SyncInterval = 10;                        // Seconds between syncs

//--- Globals
datetime lastSync    = 0;
int      lastDealCount = 0;
double   lastBalance   = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(ApiKey == "" || AccountLabel == "")
   {
      Alert("StakeUp EA: Please set ApiKey and AccountLabel in EA inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }
   Print("StakeUp Reporter EA started. Syncing to ", ServerURL);
   EventSetTimer(SyncInterval);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   SyncAccount();
}

//+------------------------------------------------------------------+
// Also sync immediately on every new tick so trade events are caught fast
void OnTick()
{
   if(TimeCurrent() - lastSync < SyncInterval) return;
   SyncAccount();
}

//+------------------------------------------------------------------+
void SyncAccount()
{
   lastSync = TimeCurrent();

   //--- Account snapshot
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity     = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin     = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_FREEMARGIN);
   double profit     = AccountInfoDouble(ACCOUNT_PROFIT);
   int    leverage   = (int)AccountInfoInteger(ACCOUNT_LEVERAGE);
   string currency   = AccountInfoString(ACCOUNT_CURRENCY);
   string broker     = AccountInfoString(ACCOUNT_COMPANY);
   long   login      = AccountInfoInteger(ACCOUNT_LOGIN);
   string server     = AccountInfoString(ACCOUNT_SERVER);

   //--- Build open positions JSON
   string positionsJson = "[";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(i > 0) positionsJson += ",";
      positionsJson += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
         "\"openPrice\":%.5f,\"currentPrice\":%.5f,\"profit\":%.2f,"
         "\"openTime\":\"%s\"}",
         (int)ticket,
         PositionGetString(POSITION_SYMBOL),
         PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "BUY" : "SELL",
         PositionGetDouble(POSITION_VOLUME),
         PositionGetDouble(POSITION_PRICE_OPEN),
         PositionGetDouble(POSITION_PRICE_CURRENT),
         PositionGetDouble(POSITION_PROFIT),
         TimeToString(PositionGetInteger(POSITION_TIME))
      );
   }
   positionsJson += "]";

   //--- Build recent closed deals JSON (last 50)
   string dealsJson = "[";
   HistorySelect(TimeCurrent() - 30*86400, TimeCurrent()); // last 30 days
   int totalDeals = HistoryDealsTotal();
   int dealsPushed = 0;
   for(int i = totalDeals - 1; i >= 0 && dealsPushed < 50; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
      if(dealsPushed > 0) dealsJson += ",";
      dealsJson += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
         "\"price\":%.5f,\"profit\":%.2f,\"time\":\"%s\"}",
         (int)ticket,
         HistoryDealGetString(ticket, DEAL_SYMBOL),
         dtype == DEAL_TYPE_BUY ? "BUY" : "SELL",
         HistoryDealGetDouble(ticket, DEAL_VOLUME),
         HistoryDealGetDouble(ticket, DEAL_PRICE),
         HistoryDealGetDouble(ticket, DEAL_PROFIT),
         TimeToString((datetime)HistoryDealGetInteger(ticket, DEAL_TIME))
      );
      dealsPushed++;
   }
   dealsJson += "]";

   //--- Assemble full payload
   string payload = StringFormat(
      "{\"apiKey\":\"%s\",\"accountLabel\":\"%s\","
      "\"snapshot\":{\"login\":%d,\"server\":\"%s\",\"broker\":\"%s\","
      "\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,"
      "\"freeMargin\":%.2f,\"profit\":%.2f,\"currency\":\"%s\","
      "\"leverage\":%d},"
      "\"positions\":%s,"
      "\"deals\":%s}",
      ApiKey, AccountLabel,
      (int)login, server, broker,
      balance, equity, margin, freeMargin, profit, currency, leverage,
      positionsJson, dealsJson
   );

   //--- Send to server
   string headers = "Content-Type: application/json\r\n";
   char   post[];
   char   result[];
   string resultHeaders;
   StringToCharArray(payload, post, 0, StringLen(payload));

   int res = WebRequest(
      "POST",
      ServerURL + "/api/mt5/ea-sync",
      headers,
      5000,
      post,
      result,
      resultHeaders
   );

   if(res == 200)
   {
      // Optionally parse response for breach/pass notification
      string responseStr = CharArrayToString(result);
      if(StringFind(responseStr, "\"breach\":true") >= 0)
         Alert("StakeUp: BREACH detected on your challenge account!");
      if(StringFind(responseStr, "\"passed\":true") >= 0)
         Alert("StakeUp: Congratulations! Your challenge has PASSED!");
   }
   else if(res < 0)
   {
      Print("StakeUp EA: WebRequest failed. Check: Tools > Options > Expert Advisors > Allow WebRequests. Add URL: ", ServerURL);
   }
}
//+------------------------------------------------------------------+
