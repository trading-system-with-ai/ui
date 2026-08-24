"use client";

/**
 * Guide — the platform handbook (§21 one-pipeline principle made teachable).
 *
 * Three jobs, in priority order:
 *  1. A beginner knows WHERE TO START (first-session checklist) and what
 *     the end-to-end flow is (the stage handbook, one section per stage).
 *  2. Every stage names its INPUTS and OUTPUTS — the service linkage — so
 *     the reader learns how pages feed each other, not just what each does.
 *  3. When something on a page is unfamiliar, the reader knows where to
 *     look it up: the dotted-underline glossary cards, the why/why-not
 *     panels, the gate chain, the audit log — and the full glossary
 *     reference at the bottom of this page.
 *
 * Static content only — no queries. Bilingual like the rest of the UI.
 */
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import { useLang, useT } from "@/lib/i18n";
import FlowNav, { type FlowStageId } from "@/components/shared/FlowNav";

/* ------------------------------------------------------------------ data */

interface StageDoc {
  id: FlowStageId;
  href: string;
  page: { en: string; zh: string };
  what: { en: string; zh: string };
  inputs: { en: string; zh: string };
  outputs: { en: string; zh: string };
  check: { en: string; zh: string };
  refs: string;
  /** Optional extra paragraph for a stage — e.g. a SHADOW layer that runs
   *  alongside the stage but deliberately decides nothing. */
  note?: { en: string; zh: string };
}

const STAGES: StageDoc[] = [
  {
    id: "connect",
    href: "/settings",
    page: { en: "Settings", zh: "设置" },
    what: {
      en: "Connect the three providers (market data, LLM, broker) and set account permissions. Every engine downstream reads THIS configuration — nothing runs on defaults. Permissions are real: a toggle that is off removes that instrument from the §8 matrix, the gate chain, backtests and plans alike.",
      zh: "连接三类服务（行情数据、LLM、券商）并设置账户权限。下游每个引擎读取的都是这里的配置 — 没有任何东西跑在默认值上。权限是真实生效的：关闭某个开关，该工具会同时从 §8 矩阵、闸门链、回测与交易计划中消失。",
    },
    inputs: {
      en: "Your API keys; your risk appetite (which instruments to allow).",
      zh: "你的 API 密钥；你的风险偏好（允许哪些工具）。",
    },
    outputs: {
      en: "Live configuration for every page: prices, chains, analysis language, execution venue, the permission matrix.",
      zh: "全平台的运行配置：价格、期权链、分析语言、执行通道、权限矩阵。",
    },
    check: {
      en: "All three cards show CONNECTED; the permission table shows exactly the instruments you intend to trade as ALLOWED.",
      zh: "三张连接卡都显示已连接；权限表中你打算交易的工具、且仅这些工具，显示为允许。",
    },
    refs: "§2 · §5 · §22 · §33",
  },
  {
    id: "research",
    href: "/research?tab=watchlist",
    page: { en: "Watchlist", zh: "自选列表" },
    what: {
      en: "Your research universe. Add a symbol and the platform maintains its daily bars, computes signals (trend regime, directional edge, volatility regime), builds the options chain view, and assembles the per-ticker research page — indicators, catalysts, LLM analysis, and the Trade Plan generator.",
      zh: "你的研究池。加入一个代码后，平台会维护其日线、计算信号（趋势状态、方向性优势、波动率状态）、构建期权链视图，并汇成个股研究页 — 指标、催化剂、LLM 分析与交易计划生成器。",
    },
    inputs: {
      en: "Symbols you choose; market data from the connected provider.",
      zh: "你选定的代码；来自已连接行情源的数据。",
    },
    outputs: {
      en: "Signals consumed by Recommendations, Backtests and the gate chain; the ticker research page (click any ticker anywhere to reach it).",
      zh: "供推荐、回测与闸门链消费的信号；个股研究页（在任何页面点击代码即可进入）。",
    },
    check: {
      en: "Open a ticker: bars are fresh, the signal panel shows a bias and edge with numbers, the chain loads with real quotes.",
      zh: "打开一个代码：日线是新的、信号面板给出带数字的方向与优势值、期权链能载入真实报价。",
    },
    refs: "§4 · §6 · §7 · §34",
  },
  {
    id: "screen",
    href: "/research?tab=recommendations",
    page: { en: "Recommendations", zh: "推荐" },
    what: {
      en: "The screening layer over the whole watchlist: quant scores plus LLM narrative with cited evidence. Every card explains WHY (scores, reason codes, evidence snippets) — a recommendation is a research verdict, never an order.",
      zh: "覆盖整个自选列表的筛选层：量化评分 + 带引用证据的 LLM 叙述。每张卡都解释为什么（评分、原因代码、证据摘录）— 推荐是研究结论，绝不是订单。",
    },
    inputs: {
      en: "Watchlist signals + catalysts; the LLM provider; the analysis language setting.",
      zh: "自选列表的信号与催化剂；LLM 服务；分析语言设置。",
    },
    outputs: {
      en: "Candidates worth deeper work: follow a card into its research page, then decide whether to backtest and authorize it.",
      zh: "值得深入研究的候选：从卡片进入其研究页，再决定是否回测与授权。",
    },
    check: {
      en: "Read the evidence, not just the score — a card whose evidence you cannot verify is a card you skip.",
      zh: "读证据而不只读分数 — 证据无法核实的卡片直接跳过。",
    },
    refs: "§15 · §25",
  },
  {
    id: "validate",
    href: "/backtests",
    page: { en: "Backtests", zh: "回测" },
    what: {
      en: "Replay a strategy leg over REAL history before risking anything. The backtest runs the SAME signal and exit engines as live trading (one code path, §21) over real daily bars — and for option legs, real historical contract prices; option prices are never fabricated. All 8 instruments are supported, each gated by the same permissions as live.",
      zh: "在承担任何风险之前，用真实历史重放一条策略腿。回测运行的信号与离场引擎与实盘完全同一份代码（§21），基于真实日线 — 期权腿使用真实历史合约价格；期权价格绝不虚构。8 种工具全部支持，且与实盘走同一套权限门。",
    },
    inputs: {
      en: "Stored bars + historical option contracts for a watchlist symbol; your parameter choices (every threshold is a parameter).",
      zh: "自选代码的已存日线与历史期权合约；你的参数选择（每个阈值都是参数）。",
    },
    outputs: {
      en: "Evidence: equity curve, drawdown, per-trade log with entry/exit reasons — the same reason strings live trading produces.",
      zh: "证据：权益曲线、回撤、带出入场理由的逐笔日志 — 理由字符串与实盘输出完全一致。",
    },
    check: {
      en: "NO TRADE is a valid result. Check the fill model (slippage), the trade count, and read individual exit reasons before trusting a return figure.",
      zh: "“没有交易”是有效结果。先看成交模型（滑点）、交易笔数，并逐笔读离场理由，再去相信收益数字。",
    },
    refs: "§20 · §21 · §44-11",
  },
  {
    id: "authorize",
    href: "/trading?tab=pool",
    page: { en: "Trading Pool", zh: "交易池" },
    what: {
      en: "The execution firewall. Research approval ≠ execution approval: only symbols you explicitly promote (acknowledging risks) can EVER produce an order, and each symbol has its own trading toggle. The global kill switch lives here too — pausing blocks all new risk while still allowing closes.",
      zh: "执行防火墙。研究通过 ≠ 执行授权：只有你明确晋升（并确认风险）的代码才可能产生订单，且每个代码有独立的交易开关。全局暂停开关也在这里 — 暂停会拦下所有新增风险，但始终允许平仓。",
    },
    inputs: {
      en: "Symbols from your watchlist that survived research + validation.",
      zh: "经过研究与回测检验的自选代码。",
    },
    outputs: {
      en: "The authorization facts the gate chain checks first on every order attempt (§32).",
      zh: "闸门链在每次下单前最先核对的授权事实（§32）。",
    },
    check: {
      en: "Only symbols you are actively trading should be enabled; everything else stays research-only.",
      zh: "只有正在交易的代码才应启用；其余保持仅研究状态。",
    },
    refs: "§18 · §32 · §43",
  },
  {
    id: "execute",
    href: "/trading?tab=positions",
    page: { en: "Positions (plans are on each ticker page)", zh: "持仓（计划在个股页生成）" },
    what: {
      en: "Two steps, always in this order. (1) On a ticker's research page, generate a Trade Plan: the §10 gate chain runs 10 named gates — signal, regime, volatility, instrument matrix, contract selection, risk sizing — and shows every PASS/FAIL with its reason plus the full exit plan BEFORE you commit. (2) Approve: the same chain re-runs server-side, and only a fully-passing chain fills — into the simulator or the Alpaca paper account. Orders and resulting positions land on the Positions page, where the mechanical exit engine watches every open position.",
      zh: "两步，顺序固定。（1）在个股研究页生成交易计划：§10 闸门链运行 10 道具名闸门 — 信号、市场状态、波动率、工具矩阵、合约选择、风险定量 — 在你确认之前展示每道门的通过/失败原因与完整离场计划。（2）批准：同一条链在服务端重跑，只有全部通过才会成交 — 进入模拟器或 Alpaca paper 账户。订单与持仓落在持仓页，机械离场引擎盯守每个未平仓位。",
    },
    inputs: {
      en: "An authorized symbol + a live signal; account permissions; the risk engine's portfolio snapshot.",
      zh: "已授权代码 + 实时信号；账户权限；风险引擎的组合快照。",
    },
    outputs: {
      en: "Orders (audited through their full lifecycle) and positions with exit rules attached; realized P&L on close.",
      zh: "订单（全生命周期入审计）与带离场规则的持仓；平仓后的已实现盈亏。",
    },
    check: {
      en: "Read why-trade AND why-not-trade on every plan. On Positions, every open row lists each exit rule with its live number — 'OK:' rows tell you how far from firing each rule is.",
      zh: "每个计划都要同时读“为何交易”与“为何不交易”。在持仓页，每个未平仓位逐条列出离场规则与实时数字 — “OK:”行告诉你距离触发还有多远。",
    },
    refs: "§9 · §10 · §11 · §24 · §26",
  },
  {
    id: "risk",
    href: "/oversight?tab=risk",
    page: { en: "Risk", zh: "风控" },
    what: {
      en: "The portfolio-level view the risk engine itself uses: heat (total capital at risk), correlation buckets, portfolio greeks, vol targeting, and the cash floor. Risk limits have PRIORITY over strategy confidence — a breach here vetoes new orders regardless of how good the signal looks.",
      zh: "风险引擎自己使用的组合级视图：热度（总在险资本）、相关性分桶、组合希腊值、波动率目标与现金下限。风险限制优先于策略信心 — 这里越限，无论信号多好，新订单都会被否决。",
    },
    inputs: {
      en: "All open positions + their live marks; stored price history for correlation and vol.",
      zh: "全部未平仓位与实时估值；用于相关性与波动率的历史价格。",
    },
    outputs: {
      en: "The same numbers the RISK_APPROVAL gate reads (§21: one implementation) — what you see here is exactly what sizes and vetoes orders.",
      zh: "与 RISK_APPROVAL 闸门读取的同一组数字（§21：同一份实现）— 你在这里看到的，就是给订单定量与否决的那组数。",
    },
    check: {
      en: "Heat and every bucket meter green/amber before adding risk; greeks tell you what a market move does to the whole book.",
      zh: "加仓前确认热度与各桶为绿/黄；希腊值告诉你市场变动对整个组合意味着什么。",
    },
    refs: "§12 · §13 · §14 · §16 · §17",
    note: {
      en: "Statistical risk layer (Phase B, SHADOW): the page also shows Historical and Gaussian VaR/ES, conditional volatility, per-position risk contribution, model dispersion, model health and drawdown. Every one of these is SHADOW — computed, logged and displayed, but wired so it CANNOT alter a decision; the hard limits above still decide alone. Each number carries its method label (there is no unlabelled \"VaR\"), its sample size, and an \"ⓘ How is this calculated?\" card with model, confidence, horizon, lookback, distribution, data source and health. Glossary: VaR, ES, Gaussian VaR/ES, conditional VaR/ES, risk contribution, model dispersion, model risk state, reconstructed drawdown, shadow mode.",
      zh: "统计风险层（Phase B，影子模式）：本页另外展示历史与高斯 VaR/ES、条件波动率、逐持仓风险贡献、模型分歧度、模型健康度与回撤。这些全部处于影子模式 — 照算、照记、照显示，但在接线上无法改变任何决策；决策仍完全由上方的硬性限制作出。每个数字都带有方法标签（不存在没有标注方法的\"VaR\"）、样本量，以及\"ⓘ 该指标如何计算？\"卡片，其中列出模型、置信度、期限、回看窗口、分布、数据来源与健康度。词汇表：VaR、ES、高斯 VaR/ES、条件 VaR/ES、风险贡献、模型分歧度、模型风险状态、重构回撤、影子模式。",
    },
  },
  {
    id: "audit",
    href: "/oversight?tab=activity",
    page: { en: "Activity", zh: "活动日志" },
    what: {
      en: "The ground truth. Every recommendation, gate decision, order, fill, rejection, exit and config change is recorded with actor and reason — no black-box state transitions. Reconciliation continuously compares local records against the broker's ledger; a material mismatch pauses trading automatically.",
      zh: "最终事实来源。每次推荐、闸门决策、下单、成交、拒绝、离场与配置变更都带操作者与原因入档 — 状态流转没有黑箱。对账持续比对本地记录与券商账本，实质性不一致会自动暂停交易。",
    },
    inputs: {
      en: "Every state change in the platform, recorded in the same transaction that made it.",
      zh: "平台内每次状态变更，与变更本身同一事务落档。",
    },
    outputs: {
      en: "The answer to 'why did/didn't X happen?' — filter by ticker and read the chain of events.",
      zh: "“X 为什么发生/没发生？”的答案 — 按代码筛选，读事件链。",
    },
    check: {
      en: "When anything surprises you elsewhere, come here FIRST: the audit row's detail carries the exact reason.",
      zh: "任何页面出现意外时，先来这里：审计行的详情里有精确原因。",
    },
    refs: "§18 · §38 · §44-12",
  },
];

/* Glossary reference: grouped so a beginner can browse by topic. */
const GLOSSARY_GROUPS: { title: { en: string; zh: string }; keys: string[] }[] = [
  {
    title: { en: "Quotes & the option chain", zh: "报价与期权链" },
    keys: ["spot", "bid", "ask", "mid", "spread_pct", "last", "volume", "open_interest", "strike", "dte"],
  },
  {
    title: { en: "Volatility", zh: "波动率" },
    keys: ["iv", "iv_rank", "rv20", "iv_rv_spread", "expected_move"],
  },
  {
    title: { en: "Greeks", zh: "希腊值" },
    keys: ["delta", "gamma", "theta", "vega", "delta_notional"],
  },
  {
    title: { en: "Signals & market state", zh: "信号与市场状态" },
    keys: ["bull_score", "bear_score", "directional_edge", "tradeability", "market_regime", "selector_direction"],
  },
  {
    title: { en: "Exit rules", zh: "离场规则" },
    keys: ["hard_stop", "atr_trail", "time_stop"],
  },
  {
    title: { en: "Backtest metrics", zh: "回测指标" },
    keys: ["backtest_v1", "fill_model", "slippage", "cagr", "sharpe", "sortino", "max_drawdown", "win_rate", "profit_factor", "expectancy", "exposure"],
  },
  {
    title: { en: "Portfolio risk", zh: "组合风险" },
    keys: ["portfolio_heat", "correlation_bucket", "delta_notional"],
  },
  {
    title: { en: "Statistical risk (SHADOW)", zh: "统计风险（影子模式）" },
    keys: [
      "var",
      "es",
      "gaussian_var",
      "conditional_var",
      "risk_contribution",
      "model_dispersion",
      "model_risk_state",
      "drawdown_reconstructed",
      "shadow_mode",
    ],
  },
  {
    title: { en: "News & catalysts", zh: "新闻与催化剂" },
    keys: ["impact", "novelty", "source_reliability"],
  },
];

/* ------------------------------------------------------------------ page */

export default function GuidePage() {
  const t = useT();
  const { lang } = useLang();

  return (
    <>
      <h1>{t("Guide — how this platform works", "使用指南 — 平台如何运作")}</h1>
      <p className="subtitle">
        {t(
          "One decision pipeline from data to audited execution. Start with the checklist, learn each stage below, and use the glossary at the bottom whenever a term is unfamiliar.",
          "从数据到可审计执行的一条决策流水线。先走上手清单，再逐段学习各环节；遇到陌生术语，查页面底部的词汇表。",
        )}
      </p>
      <FlowNav />

      {/* ---------------------------------------------- first session */}
      <div className="panel" id="first-session">
        <h2>{t("Start here — your first session", "从这里开始 — 首次使用清单")}</h2>
        <ol className="guide-list">
          <li>
            <Link href="/settings">{t("Settings", "设置")}</Link>
            {t(
              ": connect market data and the broker (paper-only by construction). Check the permission table — start with long stock/calls/puts only; unlock more instruments as you learn them.",
              "：连接行情与券商（结构上仅支持 paper）。检查权限表 — 建议先只开正股与买入期权，熟悉后再逐个解锁其他工具。",
            )}
          </li>
          <li>
            <Link href="/research?tab=watchlist">{t("Watchlist", "自选列表")}</Link>
            {t(
              ": add 3–5 liquid names you know. Open each ticker's research page and read its signal panel.",
              "：加入 3–5 只你熟悉的高流动性标的。打开每只的研究页，读信号面板。",
            )}
          </li>
          <li>
            <Link href="/backtests">{t("Backtests", "回测")}</Link>
            {t(
              ": run LONG_STOCK on one of them. Read the trade log's entry and exit reasons — these are the exact rules live trading will apply.",
              "：对其中一只跑 LONG_STOCK。逐笔读出入场理由 — 实盘应用的就是这些规则，一字不差。",
            )}
          </li>
          <li>
            <Link href="/trading?tab=pool">{t("Trading Pool", "交易池")}</Link>
            {t(
              ": promote ONE symbol, acknowledge the risks, enable trading for it.",
              "：晋升一只代码，确认风险，为它开启交易。",
            )}
          </li>
          <li>
            {t("On that ticker's research page, generate a ", "在该代码的研究页生成")}
            {t("Trade Plan", "交易计划")}
            {t(
              " and read every gate — including the ones that failed. Approve only when the whole chain passes and you understand the exit plan.",
              "，并读完每一道闸门 — 包括失败的那些。只有整条链通过、且你理解了离场计划，才批准。",
            )}
          </li>
          <li>
            <Link href="/trading?tab=positions">{t("Positions", "持仓")}</Link>
            {" · "}
            <Link href="/oversight?tab=risk">{t("Risk", "风控")}</Link>
            {" · "}
            <Link href="/oversight?tab=activity">{t("Activity", "活动日志")}</Link>
            {t(
              ": watch the position's exit rules update daily, check portfolio heat, and trace your order's full lifecycle in the audit log.",
              "：观察持仓离场规则的每日更新，检查组合热度，并在审计日志中追踪订单的完整生命周期。",
            )}
          </li>
        </ol>
        <p className="guide-note">
          {t(
            "Safety net while you learn: the kill switch (Trading Pool page) pauses all new risk instantly; closing positions is always allowed.",
            "学习期的安全网：全局暂停开关（交易池页）可立即拦停所有新增风险；平仓永远被允许。",
          )}
        </p>
      </div>

      {/* ---------------------------------------------- stage handbook */}
      <div className="panel" id="pipeline">
        <h2>{t("The pipeline, stage by stage", "流水线各环节详解")}</h2>
        <p className="guide-note" style={{ marginBottom: 14 }}>
          {t(
            "Each stage lists its inputs and outputs — that is how the services interact: every page's output is the next page's input, and the risk/audit layers see everything.",
            "每个环节都标注了输入与输出 — 这就是服务间的联动方式：每个页面的输出是下一个页面的输入，而风控与审计层看到一切。",
          )}
        </p>
        <ol className="gate-list">
          {STAGES.map((s, i) => (
            <li key={s.id} className="gate-step" id={`stage-${s.id}`}>
              <span className="g-icon pass" aria-hidden="true">{i + 1}</span>
              <div>
                <div className="g-name">
                  <Link href={s.href}>{t(s.page.en, s.page.zh)}</Link>
                  <span className="chip" style={{ marginLeft: 8 }}>{s.refs}</span>
                </div>
                <p className="guide-stage-what">{t(s.what.en, s.what.zh)}</p>
                <div className="guide-io">
                  <span className="guide-io-k">{t("Inputs ←", "输入 ←")}</span>
                  <span>{t(s.inputs.en, s.inputs.zh)}</span>
                  <span className="guide-io-k">{t("Outputs →", "输出 →")}</span>
                  <span>{t(s.outputs.en, s.outputs.zh)}</span>
                  <span className="guide-io-k">{t("Verify", "如何核验")}</span>
                  <span>{t(s.check.en, s.check.zh)}</span>
                </div>
                {s.note && <p className="guide-note">{t(s.note.en, s.note.zh)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ---------------------------------------------- interaction map */}
      <div className="panel" id="interaction">
        <h2>{t("How the services interact", "服务如何相互作用")}</h2>
        <div className="chart-scroll">
          <pre className="guide-map">{`Market data ─→ Bars/Chain ─→ Signals (§6/§7) ─→ §8 Instrument matrix ←─ Permissions (Settings)
                                   │                     │
                                   │                     ▼
LLM ─→ Recommendations (§15)       │            §9 Contract selection
                                   │                     │
                                   ▼                     ▼
                      Backtests (§20) ══ SAME engines ══ §10 Gate chain ←─ Trading Pool + Kill switch (§18/§32)
                                                         │
                                                         ▼
                                              §12–§16 Risk sizing  ←─ Portfolio snapshot (Risk page numbers)
                                                         │
                                                         ▼
                                        §11 Execution (simulator / Alpaca paper)
                                                         │
                                                         ▼
                                     Positions ─→ §26 Exit monitor ─→ closes (always allowed)
                                                         │
                                                         ▼
                              §18 Reconciliation vs broker ─→ mismatch? ─→ KILL SWITCH pauses new risk
                                                         │
                              Audit log (§38) records every step of all of the above`}</pre>
        </div>
        <p className="guide-note">
          {t(
            "Two structural guarantees to remember: (1) backtest and live share one code path (§21) — a backtest is a genuine rehearsal, not a lookalike; (2) risk outranks conviction (§44-20) — no signal strength overrides a risk veto or the kill switch.",
            "记住两条结构性保证：（1）回测与实盘共享同一份代码（§21）— 回测是真实彩排而非仿制品；（2）风险优先于信念（§44-20）— 任何信号强度都无法凌驾风险否决或暂停开关。",
          )}
        </p>
      </div>

      {/* ---------------------------------------------- explainability */}
      <div className="panel" id="lookup">
        <h2>{t("When you don't understand something", "遇到看不懂的东西时")}</h2>
        <ul className="guide-list">
          <li>
            <strong>{t("Dotted-underlined terms", "带虚线下划线的术语")}</strong>
            {t(
              " anywhere in the UI open a plain-language card: definition + how to read the number. The full set is in the glossary below.",
              " — 全平台任意位置点击即弹出通俗解释卡：定义 + 这个数字怎么读。完整集合见下方词汇表。",
            )}
          </li>
          <li>
            <strong>{t("Why-trade / why-not-trade", "为何交易 / 为何不交易")}</strong>
            {t(
              " on every trade plan: the complete argument for and against, assembled from the gates that passed and failed.",
              " — 每个交易计划都给出完整的正反论证，由通过与失败的闸门组装而成。",
            )}
          </li>
          <li>
            <strong>{t("The gate chain", "闸门链")}</strong>
            {t(
              ": each of the 10 gates shows PASS/FAIL/SKIPPED with the actual numbers used. A NO-TRADE answer always names the exact gate and reason.",
              " — 10 道闸门逐一显示通过/失败/跳过与所用的真实数字。“不交易”的结论永远指名具体闸门与原因。",
            )}
          </li>
          <li>
            <strong>
              <Link href="/oversight?tab=activity">{t("The audit log", "审计日志")}</Link>
            </strong>
            {t(
              ": if something happened (or didn't), the row's detail carries the exact reason — filter by ticker.",
              " — 任何事发生（或没发生），审计行详情里都有精确原因 — 可按代码筛选。",
            )}
          </li>
          <li>
            <strong>{t("Blank values are honest", "空值是诚实的")}</strong>
            {t(
              ": this platform never invents a number it doesn't have (§44-18). A dash or 'no data' means the source genuinely lacks it — check Settings connections first.",
              " — 平台绝不虚构没有的数字（§44-18）。短横或“无数据”意味着数据源确实没有 — 先检查设置页的连接状态。",
            )}
          </li>
          <li>
            <strong>{t("Server text stays English", "服务端文本保持英文")}</strong>
            {t(
              ": gate details, exit reasons and audit entries are exact records (§26/§36) and are never paraphrased or translated. UI labels and this guide are bilingual.",
              " — 闸门详情、离场理由与审计条目是精确记录（§26/§36），永不转述或翻译。界面标签与本指南是双语的。",
            )}
          </li>
        </ul>
      </div>

      {/* ---------------------------------------------- glossary */}
      <div className="panel" id="glossary">
        <h2>{t("Glossary reference", "词汇表")}</h2>
        <p className="guide-note" style={{ marginBottom: 12 }}>
          {t(
            "Every term the UI explains inline, collected in one place. Beginner-level but quantitatively correct; nothing here promises predictive power.",
            "界面中所有随处可点的术语在此汇总。面向新手但量化上严谨；任何条目都不承诺预测能力。",
          )}
        </p>
        {GLOSSARY_GROUPS.map((g) => (
          <div key={g.title.en} className="guide-gloss-group">
            <h3 className="chart-sublabel">{t(g.title.en, g.title.zh)}</h3>
            <div className="guide-gloss-grid">
              {g.keys.map((k) => {
                const entry = GLOSSARY[k];
                if (!entry) return null;
                const side = lang === "zh" ? entry.zh : entry.en;
                return (
                  <div key={k} className="guide-gloss-item">
                    <div className="guide-gloss-name">{side.name}</div>
                    <div className="guide-gloss-short">{side.short}</div>
                    <div className="guide-gloss-read">{side.read}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
