/**
 * Bilingual metric glossary (EN / 简体中文) — beginner-level but
 * quantitatively correct. Rendered by <Term> as click/hover explainer cards.
 *
 * Each entry: name, a one-line definition, and "how to read it" guidance.
 * Content policy: explain the CONCEPT; never promise predictive power, and
 * keep platform-specific semantics (research parameters, §9 selector rules)
 * labeled as such.
 */

export interface GlossarySide {
  name: string;
  short: string;
  read: string;
}

export interface GlossaryEntry {
  en: GlossarySide;
  zh: GlossarySide;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  spot: {
    en: {
      name: "Spot price",
      short: "The underlying stock's current reference price.",
      read: "Everything on this page is measured against it: strikes above/below spot decide which options are in or out of the money.",
    },
    zh: {
      name: "现价 (Spot)",
      short: "标的股票当前的参考价格。",
      read: "本页所有指标都以它为基准:行权价高于或低于现价,决定期权处于实值还是虚值。",
    },
  },
  bid: {
    en: {
      name: "Bid",
      short: "The highest price a buyer is currently willing to pay.",
      read: "You SELL at (or near) the bid. Bid 0.00 means nobody is bidding right now — a real market state on illiquid contracts.",
    },
    zh: {
      name: "买价 (Bid)",
      short: "当前买方愿意出的最高价格。",
      read: "你卖出时成交在买价附近。Bid 为 0.00 表示此刻无人出价买入 — 低流动性合约的真实状态。",
    },
  },
  ask: {
    en: {
      name: "Ask",
      short: "The lowest price a seller is currently asking.",
      read: "You BUY at (or near) the ask. The gap between bid and ask is your immediate round-trip cost.",
    },
    zh: {
      name: "卖价 (Ask)",
      short: "当前卖方愿意接受的最低价格。",
      read: "你买入时成交在卖价附近。买卖价之间的差距就是你一进一出的直接成本。",
    },
  },
  mid: {
    en: {
      name: "Mid price",
      short: "(bid + ask) / 2 — the quote's midpoint.",
      read: "A fair-value reference between the two sides. An 'EOD' tag means it came from the last session's close instead of a live quote.",
    },
    zh: {
      name: "中间价 (Mid)",
      short: "(买价 + 卖价) / 2,报价的中点。",
      read: "买卖双方之间的公允参考价。带 \"EOD\" 标记表示它取自上一交易日收盘价,而非实时报价。",
    },
  },
  spread_pct: {
    en: {
      name: "Spread %",
      short: "(ask − bid) ÷ mid — the quote's width as a fraction of price.",
      read: "The core liquidity cost. 2% is tight; 20%+ means entering and exiting immediately loses a fifth of the premium. The §9 selector rejects wide spreads.",
    },
    zh: {
      name: "点差 % (Spread)",
      short: "(卖价 − 买价) ÷ 中间价,报价宽度占价格的比例。",
      read: "核心流动性成本。2% 算窄;20% 以上意味着立刻一买一卖就损失五分之一权利金。§9 选择器会拒绝点差过宽的合约。",
    },
  },
  last: {
    en: {
      name: "Last",
      short: "The most recent traded price.",
      read: "Where the last actual trade printed. Can be far from the current quote on illiquid contracts — never price an entry off 'last' alone.",
    },
    zh: {
      name: "最新成交价 (Last)",
      short: "最近一笔实际成交的价格。",
      read: "上一笔真实成交的位置。低流动性合约上它可能远离当前报价 — 不要只凭它决定进出场价格。",
    },
  },
  volume: {
    en: {
      name: "Volume",
      short: "Contracts traded TODAY.",
      read: "Today's activity. High volume = easier to get in and out near fair value.",
    },
    zh: {
      name: "成交量 (Volume)",
      short: "今天已成交的合约张数。",
      read: "今日活跃度。成交量大,意味着更容易以接近公允的价格进出。",
    },
  },
  open_interest: {
    en: {
      name: "Open interest (OI)",
      short: "Contracts currently HELD open — updated once daily by OCC.",
      read: "Standing positions, not today's trades. High OI = an established, liquid contract. The §9 selector requires a minimum OI.",
    },
    zh: {
      name: "持仓量 (OI)",
      short: "当前未平仓的合约总数,由 OCC 每日更新一次。",
      read: "存量持仓,不是今天的成交。持仓量大 = 合约成熟、流动性好。§9 选择器要求最低持仓量。",
    },
  },
  iv: {
    en: {
      name: "Implied volatility (IV)",
      short: "The annualized volatility the option's PRICE implies.",
      read: "The market's priced-in expectation of movement — not a forecast of direction. 30% is calm large-cap; 100%+ means the market prices violent swings. '—' = the provider computes no IV for this deep contract; ⚠ = mathematically unreliable (price ≈ intrinsic value).",
    },
    zh: {
      name: "隐含波动率 (IV)",
      short: "由期权价格反推出的年化波动率。",
      read: "市场定价中的波动预期 — 不预测方向。大盘蓝筹 30% 算平静;100%+ 表示市场为剧烈波动定价。\"—\" = 数据源不为该深度合约计算 IV;⚠ = 数学上不可靠 (权利金≈内在价值)。",
    },
  },
  iv_rank: {
    en: {
      name: "IV rank",
      short: "Where today's IV sits inside its own 1-year range (0–100%).",
      read: "80% = IV is higher than it has been most of the year (options expensive vs their own history). Needs stored IV history to compute.",
    },
    zh: {
      name: "IV 分位 (IV Rank)",
      short: "当前 IV 在自身一年区间里的位置 (0–100%)。",
      read: "80% = IV 高于全年大多数时间 (期权相对自身历史偏贵)。需要积累 IV 历史数据后才能计算。",
    },
  },
  expected_move: {
    en: {
      name: "Expected move",
      short: "The ± range the ATM straddle price implies for the underlying.",
      read: "±22% by an expiry means the options market prices roughly a two-in-three chance the stock stays inside that band. Derived from real prices, not a prediction.",
    },
    zh: {
      name: "预期波动 (Expected Move)",
      short: "由平值跨式期权价格推算的标的 ± 波动区间。",
      read: "到某到期日 ±22%,表示期权市场定价约三分之二概率股价留在该区间内。它由真实价格推导,不是预测。",
    },
  },
  rv20: {
    en: {
      name: "Realized vol (RV20)",
      short: "The volatility the stock ACTUALLY delivered over ~20 trading days, annualized.",
      read: "Backward-looking movement. Compare with IV: what the market charges (IV) vs what the stock has been doing (RV).",
    },
    zh: {
      name: "已实现波动率 (RV20)",
      short: "过去约 20 个交易日股价实际波动的年化值。",
      read: "回望型指标。与 IV 对照:市场收多少波动费 (IV) vs 股票实际怎么动 (RV)。",
    },
  },
  iv_rv_spread: {
    en: {
      name: "IV − RV spread",
      short: "Implied minus realized volatility.",
      read: "Positive = options priced richer than recent movement; negative = priced cheaper. NOT automatically 'overpriced/underpriced' — events can justify either.",
    },
    zh: {
      name: "IV − RV 差",
      short: "隐含波动率减去已实现波动率。",
      read: "为正 = 期权定价高于近期实际波动;为负 = 低于。不能机械理解为\"贵/便宜\" — 事件预期可以合理支撑任一方向。",
    },
  },
  delta: {
    en: {
      name: "Delta (Δ)",
      short: "How much the option price moves per $1 move in the stock.",
      read: "Calls 0→1, puts 0→−1. Δ 0.50 ≈ ATM. Also a rough market-implied probability of expiring in the money. The §9 selector shops a Δ window (research parameter).",
    },
    zh: {
      name: "Delta (Δ)",
      short: "股价每变动 1 美元,期权价格随之变动的幅度。",
      read: "Call 在 0→1,Put 在 0→−1。Δ 0.50 约为平值,也可粗略当作到期实值的市场隐含概率。§9 选择器在设定的 Δ 区间内选合约 (研究参数)。",
    },
  },
  gamma: {
    en: {
      name: "Gamma (Γ)",
      short: "How fast delta itself changes as the stock moves.",
      read: "Highest near ATM and near expiry. High gamma = your directional exposure changes quickly — cuts both ways.",
    },
    zh: {
      name: "Gamma (Γ)",
      short: "股价变动时,Delta 本身变化的速度。",
      read: "在平值附近和临近到期时最大。Gamma 大 = 你的方向性敞口变化很快 — 利弊皆然。",
    },
  },
  theta: {
    en: {
      name: "Theta (Θ)",
      short: "Daily time decay: value the option loses per calendar day, all else equal.",
      read: "Negative for long options — the rent you pay to hold the position. The platform's theta-burden filter caps |Θ|/premium per day.",
    },
    zh: {
      name: "Theta (Θ)",
      short: "时间损耗:其他条件不变时,期权每过一天损失的价值。",
      read: "买方为负 — 持仓要付的\"时间租金\"。平台的 theta 负担过滤器限制每日 |Θ|/权利金 的比例。",
    },
  },
  vega: {
    en: {
      name: "Vega",
      short: "Price change per 1-point change in implied volatility.",
      read: "Long options gain when IV rises, lose when it falls (IV crush after events). Biggest on longer-dated ATM options.",
    },
    zh: {
      name: "Vega",
      short: "隐含波动率每变动 1 个点,期权价格的变化。",
      read: "买方在 IV 上升时受益、下降时受损 (事件后 IV 塌缩)。长久期平值期权的 Vega 最大。",
    },
  },
  strike: {
    en: {
      name: "Strike",
      short: "The price at which the option can be exercised.",
      read: "Calls below spot / puts above spot are in the money (shaded in the chain). The distance from spot sets intrinsic value.",
    },
    zh: {
      name: "行权价 (Strike)",
      short: "期权可以按此执行买入/卖出股票的价格。",
      read: "低于现价的 Call、高于现价的 Put 为实值 (链上有底纹)。与现价的距离决定内在价值。",
    },
  },
  dte: {
    en: {
      name: "DTE",
      short: "Days to expiration.",
      read: "Short DTE = fast theta decay and high gamma; long DTE = more time, more premium. The §9 selector targets a 30–90 day window (research parameter).",
    },
    zh: {
      name: "剩余天数 (DTE)",
      short: "距离到期日的天数。",
      read: "DTE 短 = 时间损耗快、gamma 大;DTE 长 = 时间充裕但权利金更贵。§9 选择器目标 30–90 天窗口 (研究参数)。",
    },
  },
  bull_score: {
    en: {
      name: "Bull score",
      short: "0–100: how many weighted bullish conditions are currently met.",
      read: "Deterministic — computed from price/indicator checks with versioned weights, no LLM involved. Click 'How is this calculated?' for every component's contribution.",
    },
    zh: {
      name: "多头分 (Bull Score)",
      short: "0–100:当前满足的加权多头条件占比。",
      read: "确定性计算 — 由价格/指标条件按版本化权重得出,与 LLM 无关。点 \"How is this calculated?\" 可见每个成分的贡献。",
    },
  },
  bear_score: {
    en: {
      name: "Bear score",
      short: "0–100: how many weighted bearish conditions are currently met.",
      read: "The exact mirror of the bull score, over the same feature pairs.",
    },
    zh: {
      name: "空头分 (Bear Score)",
      short: "0–100:当前满足的加权空头条件占比。",
      read: "与多头分完全镜像,基于同一组特征对。",
    },
  },
  directional_edge: {
    en: {
      name: "Directional edge",
      short: "Bull score − bear score (−100 to +100).",
      read: "The net direction of the evidence. +66.7 = strongly one-sided bullish conditions. The legend maps it to the seven bands.",
    },
    zh: {
      name: "方向优势 (Edge)",
      short: "多头分 − 空头分 (−100 到 +100)。",
      read: "证据的净方向。+66.7 = 多头条件明显占优。图例把它映射到七个分类档位。",
    },
  },
  tradeability: {
    en: {
      name: "Tradeability",
      short: "Whether the ENVIRONMENT permits new entries — separate from direction.",
      read: "Strong direction with BLOCKED tradeability is a valid state: regime/volatility gates veto entries regardless of how bullish the signal is.",
    },
    zh: {
      name: "可交易性 (Tradeability)",
      short: "当前环境是否允许开新仓 — 与方向判断相互独立。",
      read: "方向强但 BLOCKED 是正常状态:市场状态/波动率闸门可以否决入场,无论信号多么看多。",
    },
  },
  market_regime: {
    en: {
      name: "Market regime",
      short: "The broad market's trend state, classified from SPY.",
      read: "STRONG_BULL … STRONG_BEAR, plus TRANSITION (defaults to no-trade). Deterministic classification over stored daily bars.",
    },
    zh: {
      name: "市场状态 (Regime)",
      short: "由 SPY 分类得到的大盘趋势状态。",
      read: "从 STRONG_BULL 到 STRONG_BEAR,外加 TRANSITION (默认不交易)。基于存储日线的确定性分类。",
    },
  },
  selector_direction: {
    en: {
      name: "Selector direction",
      short: "PLATFORM control: which side the §9 contract selector shops.",
      read: "BULL → calls, BEAR → puts, AUTO → follow the platform's own signal. A what-if input for research — not a market data field, and it never hides chain rows.",
    },
    zh: {
      name: "选择器方向",
      short: "平台控制项:§9 合约选择器在哪一侧选合约。",
      read: "BULL → 选 Call,BEAR → 选 Put,AUTO → 跟随平台信号。用于研究的 what-if 输入 — 不是市场数据字段,也不会隐藏链上任何行。",
    },
  },
  hard_stop: {
    en: {
      name: "Hard stop",
      short: "A fixed protective stop set at entry — 2 × ATR14 below the fill price — that never widens.",
      read: "Exit reasons reading HARD_STOP fired this rule. The stop distance uses the SAME shared constant the live order gate sizes stops with (§12.1), so backtest exits and live exits are the same logic. It always works off raw prices — a data gap can never disable it.",
    },
    zh: {
      name: "硬止损 (Hard Stop)",
      short: "入场时固定的保护性止损 — 成交价下方 2 × ATR14,永不放宽。",
      read: "离场原因里的 HARD_STOP 就是触发了此规则。止损距离与实盘下单闸门使用同一个共享常量 (§12.1),回测离场与实盘离场是同一套逻辑。它只依赖原始价格 — 数据缺口永远不会使它失效。",
    },
  },
  backtest_v1: {
    en: {
      name: "Backtest engine (V1)",
      short: "A deterministic bar-by-bar replay of the SAME signal code the live system runs — long stock only, no options, no ML.",
      read: "At each bar the decision sees only data up to that bar (no look-ahead); a close-of-day decision fills at the NEXT open with slippage and commission. NO TRADE is a valid result. Search terms: look-ahead bias, survivorship bias, backtest overfitting.",
    },
    zh: {
      name: "回测引擎 (V1)",
      short: "对实盘同一套信号代码的逐K线确定性重放 — 仅做多股票,不含期权,无机器学习。",
      read: "每根K线上的决策只能看到当时及之前的数据 (无未来函数);收盘决策在下一根K线开盘价成交,并计入滑点与佣金。\"零交易\"是合法结果。可查关键词:未来函数 (look-ahead bias)、幸存者偏差、回测过拟合。",
    },
  },
  fill_model: {
    en: {
      name: "Fill model",
      short: "The assumption for what price your simulated orders actually get: OPTIMISTIC / CONSERVATIVE / WORST slippage.",
      read: "Historical bars never tell you the fill you would really have gotten (§20.2). CONSERVATIVE is the default; if a strategy only survives under OPTIMISTIC fills, it is likely paying its edge to execution costs. Search terms: slippage, market impact.",
    },
    zh: {
      name: "成交模型",
      short: "模拟订单实际成交价的假设:OPTIMISTIC / CONSERVATIVE / WORST 三档滑点。",
      read: "历史K线永远无法告诉你真实能成交的价格 (§20.2)。默认 CONSERVATIVE;若策略只在 OPTIMISTIC 下盈利,说明利润很可能被执行成本吃掉。可查关键词:滑点 (slippage)、市场冲击成本。",
    },
  },
  slippage: {
    en: {
      name: "Slippage",
      short: "The gap between the price you expected and the price you actually got.",
      read: "Applied on BOTH entry and exit in this backtest, plus per-share commission. Small per trade, decisive over many trades.",
    },
    zh: {
      name: "滑点",
      short: "预期成交价与实际成交价之间的差距。",
      read: "本回测在进场和出场两侧都计入滑点,外加每股佣金。单笔看似很小,笔数多了足以决定成败。",
    },
  },
  cagr: {
    en: {
      name: "CAGR",
      short: "Compound annual growth rate — the return annualized over the tested period.",
      read: "Short segments annualize misleadingly: one strong quarter extrapolates to a huge CAGR (the +132% here comes from ~9 months). Trust it only over long windows. Search term: annualized return.",
    },
    zh: {
      name: "年化收益率 (CAGR)",
      short: "复合年化增长率 — 把测试区间的收益折算成年化。",
      read: "短区间的年化会严重失真:一个强势季度外推就是巨大的 CAGR (此处 +132% 来自约 9 个月)。只有较长窗口下才可信。可查关键词:年化收益。",
    },
  },
  sharpe: {
    en: {
      name: "Sharpe ratio",
      short: "Return per unit of volatility (all movement, up and down).",
      read: "Rule of thumb: <0 losing, ~1 decent, >2 strong — but with only a handful of trades the number is statistically almost meaningless. Search terms: Sharpe ratio, risk-adjusted return.",
    },
    zh: {
      name: "夏普比率",
      short: "每承担一单位波动获得的收益 (上下波动都计入)。",
      read: "经验值:<0 亏损,约 1 尚可,>2 优秀 — 但交易笔数很少时该数字几乎没有统计意义。可查关键词:夏普比率、风险调整后收益。",
    },
  },
  sortino: {
    en: {
      name: "Sortino ratio",
      short: "Like Sharpe, but penalizes only DOWNSIDE volatility.",
      read: "Higher than Sharpe when gains are volatile but losses are controlled. Same small-sample caveat as Sharpe.",
    },
    zh: {
      name: "索提诺比率",
      short: "与夏普类似,但只惩罚下行波动。",
      read: "当收益波动大而亏损受控时会高于夏普。与夏普一样,样本小时参考价值有限。",
    },
  },
  max_drawdown: {
    en: {
      name: "Max drawdown",
      short: "The worst peak-to-trough equity loss over the period.",
      read: "The pain metric: -34.67% means at the worst moment you were down a third from the prior peak. Ask yourself honestly whether you would have kept following the rules through it.",
    },
    zh: {
      name: "最大回撤",
      short: "区间内净值从峰值到谷底的最大跌幅。",
      read: "这是\"痛苦指标\":-34.67% 意味着最糟时刻你的净值比前期高点缩水三分之一。诚实地问自己:跌到那里时你还能坚持执行规则吗?",
    },
  },
  win_rate: {
    en: {
      name: "Win rate",
      short: "The fraction of closed trades that made money.",
      read: "Meaningless alone: a 25% win rate is profitable if winners are 4× losers (see profit factor / expectancy). Trend-following systems routinely win under 50%.",
    },
    zh: {
      name: "胜率",
      short: "已平仓交易中盈利笔数的占比。",
      read: "单看无意义:胜率 25% 但盈利单是亏损单的 4 倍照样赚钱 (结合盈利因子/期望值看)。趋势策略胜率低于 50% 很常见。",
    },
  },
  profit_factor: {
    en: {
      name: "Profit factor",
      short: "Gross profits ÷ gross losses.",
      read: ">1 = the wins outweigh the losses in aggregate; 2+ is strong. Below 1 the system lost money regardless of win rate.",
    },
    zh: {
      name: "盈利因子",
      short: "总盈利 ÷ 总亏损。",
      read: ">1 = 盈利总额盖过亏损总额;2 以上算强。低于 1 则无论胜率多高整体都是亏的。",
    },
  },
  expectancy: {
    en: {
      name: "Expectancy",
      short: "The average return per trade — what one \"typical\" trade earns.",
      read: "Win rate and win/loss size folded into one number. Positive expectancy with enough trades is the whole game; a few trades prove nothing yet.",
    },
    zh: {
      name: "期望值",
      short: "平均每笔交易的收益 — 一笔\"典型\"交易赚多少。",
      read: "把胜率和盈亏比合并成一个数。期望为正且交易笔数足够多才算成立;寥寥几笔什么也证明不了。",
    },
  },
  exposure: {
    en: {
      name: "Exposure",
      short: "The share of the tested period the strategy actually held a position.",
      read: "20% exposure means capital sat in cash 4/5 of the time — returns were earned in short bursts. Compare strategies on exposure-adjusted terms.",
    },
    zh: {
      name: "持仓暴露",
      short: "测试区间内实际持有仓位的时间占比。",
      read: "暴露 20% 表示八成时间资金闲置在现金里 — 收益集中在少数时段。对比策略时应考虑暴露差异。",
    },
  },
  atr_trail: {
    en: {
      name: "ATR trailing stop",
      short: "An exit that trails the highest price since entry by a multiple of ATR (average true range).",
      read: "Exit reasons reading ATR_TRAIL fired this rule: price fell more than k × ATR14 below its peak. Volatility-scaled, so quiet stocks get tight stops and wild ones get room. Search terms: ATR, trailing stop.",
    },
    zh: {
      name: "ATR 移动止损",
      short: "以 ATR (平均真实波幅) 的倍数,跟随入场后最高价移动的止损。",
      read: "离场原因里的 ATR_TRAIL 就是触发了此规则:价格自峰值回落超过 k × ATR14。按波动率缩放 — 平静的股票止损紧,波动大的留空间。可查关键词:ATR、移动止损 (trailing stop)。",
    },
  },
  time_stop: {
    en: {
      name: "Time stop",
      short: "Exit after N bars if the position hasn't moved enough — capital has an opportunity cost.",
      read: "TIME_STOP exit reasons mean the trade went nowhere for the configured number of bars. Cutting dead positions frees capital for live signals.",
    },
    zh: {
      name: "时间止损",
      short: "持仓 N 根K线仍未走出足够行情就离场 — 资金有机会成本。",
      read: "离场原因 TIME_STOP 表示持仓在设定K线数内没有进展。砍掉\"死仓\"是为了把资金让给活跃信号。",
    },
  },
  impact: {
    en: {
      name: "Impact",
      short: "LLM-scored materiality of the catalyst: how much this news could move the stock (0–1).",
      read: "A model's judgment, not a measurement — use it to rank candidates for YOUR review, never as a trade signal.",
    },
    zh: {
      name: "影响力",
      short: "LLM 对催化剂重要性的打分:这条消息可能对股价影响多大 (0–1)。",
      read: "这是模型判断,不是测量值 — 用于给候选排序供你复核,永远不是交易信号。",
    },
  },
  novelty: {
    en: {
      name: "Novelty",
      short: "LLM-scored freshness: is this NEW information or an echo of something already known (0–1)?",
      read: "Markets price known news quickly; stale \"catalysts\" are usually already in the price.",
    },
    zh: {
      name: "新颖度",
      short: "LLM 对信息新鲜度的打分:这是新信息,还是已知消息的回声 (0–1)?",
      read: "市场对已知消息的定价很快;\"旧闻催化剂\"通常早已反映在价格里。",
    },
  },
  source_reliability: {
    en: {
      name: "Source reliability",
      short: "LLM-scored trustworthiness of the cited sources (0–1).",
      read: "Wire services and filings score high; unsourced aggregation scores low. Every recommendation must cite stored, real articles — the platform drops any that don't.",
    },
    zh: {
      name: "来源可靠性",
      short: "LLM 对引用来源可信度的打分 (0–1)。",
      read: "通讯社和公告类来源得分高;无出处的聚合内容得分低。每条推荐都必须引用已存储的真实新闻 — 引用对不上的会被平台直接丢弃。",
    },
  },
  portfolio_heat: {
    en: {
      name: "Portfolio heat",
      short: "Total open risk: the sum of every position's max loss, as a share of NAV.",
      read: "\"If every stop got hit at once, how much of the account is gone?\" Gates at 4% / 6% / 8% throttle then block new risk. Search term: portfolio heat (Van Tharp).",
    },
    zh: {
      name: "组合热度",
      short: "总敞口风险:所有持仓最大亏损之和占净值的比例。",
      read: "含义是\"如果所有止损同时打到,账户损失多少\"。4% / 6% / 8% 三档闸门先限流再禁止新增风险。可查关键词:portfolio heat。",
    },
  },
  correlation_bucket: {
    en: {
      name: "Correlation bucket",
      short: "Tickers that tend to move together share one risk cap.",
      read: "Ten semiconductor longs are closer to one big trade than ten trades. Bucket caps stop concentration hiding behind different ticker symbols.",
    },
    zh: {
      name: "相关性分组",
      short: "倾向于同涨同跌的标的共享同一个风险上限。",
      read: "十个半导体多头更像一笔大交易而不是十笔独立交易。分组上限防止集中度藏在不同代码后面。",
    },
  },
  var: {
    en: {
      name: "Value at Risk (VaR)",
      short: "A loss threshold: at 95% / 1 day, the loss the book exceeds on about 1 day in 20.",
      read: "VaR says WHERE the bad tail begins, not how bad it gets inside it — read ES next to it. Always read the method label with the number: Historical VaR and Gaussian VaR are different estimates of the same idea.",
    },
    zh: {
      name: "风险价值 (VaR)",
      short: "一个亏损门槛:95% / 1 日的 VaR,大约每 20 个交易日会被突破 1 次。",
      read: "VaR 只说明坏尾从哪里开始,不说明进入坏尾后有多糟 — 要与 ES 一起看。看数字必须同时看方法标签:历史 VaR 与高斯 VaR 是对同一概念的不同估计。",
    },
  },
  es: {
    en: {
      name: "Expected Shortfall (ES / CVaR)",
      short: "The average loss on the days that are worse than VaR.",
      read: "\"Once we are in the bad tail, how bad is the average day?\" ES is always at least as large as VaR at the same confidence. It reacts to tail shape, which is why it is treated as first-class here rather than as a footnote to VaR.",
    },
    zh: {
      name: "预期短缺 (ES / CVaR)",
      short: "在比 VaR 更糟的那些交易日里,平均亏损是多少。",
      read: "含义是\"一旦进入坏尾,平均一天亏多少\"。相同置信度下 ES 永远不小于 VaR。ES 对尾部形状敏感,因此在本平台与 VaR 同等重要,而不是 VaR 的附注。",
    },
  },
  gaussian_var: {
    en: {
      name: "Gaussian VaR / ES",
      short: "VaR and ES computed from the mean and standard deviation, assuming a normal distribution.",
      read: "It uses every observation, so it is smooth — but it assumes normality. When the distribution card reports HEAVY_TAIL or LEFT_SKEWED, the Gaussian numbers understate the tail and the page marks Gaussian trust as reduced or low.",
    },
    zh: {
      name: "高斯 VaR / ES",
      short: "假设收益服从正态分布,用均值与标准差计算的 VaR 与 ES。",
      read: "它使用全部样本,因此曲线平滑 — 但前提是正态假设。当分布卡片显示厚尾 (HEAVY_TAIL) 或左偏 (LEFT_SKEWED) 时,高斯结果会低估尾部,本页会把高斯可信度标为降低或低。",
    },
  },
  conditional_var: {
    en: {
      name: "Conditional (vol-scaled) VaR / ES",
      short: "Historical VaR/ES after each past day is rescaled to today's volatility level.",
      read: "Plain historical VaR treats a calm day two years ago the same as today. The conditional version multiplies each past P&L by today's σ over that day's σ (an EWMA estimate), so a quiet history does not mask a turbulent present. It is still empirical — no new distribution is assumed.",
    },
    zh: {
      name: "条件 (波动率调整) VaR / ES",
      short: "先把每个历史交易日按当前波动率水平缩放,再计算历史 VaR / ES。",
      read: "普通历史 VaR 把两年前的平静日与今天同等对待。条件版本把每个历史盈亏乘以\"当前 σ ÷ 当日 σ\"(EWMA 估计),使平静的历史不至于掩盖当下的动荡。它依然是经验分布,不引入新的分布假设。",
    },
  },
  risk_contribution: {
    en: {
      name: "Risk contribution",
      short: "How much of total portfolio downside risk is attributable to one position.",
      read: "Capital weight and risk weight are not the same thing: a small position in a volatile, correlated name can carry a large share of the risk. The two bars on each row show exactly that gap. Contributions sum to the portfolio total by construction.",
    },
    zh: {
      name: "风险贡献",
      short: "组合总下行风险中,有多少可归因于某一个持仓。",
      read: "资金权重与风险权重不是一回事:在高波动、高相关标的上的小仓位,可能占据很大一块风险。每行的两根条形正是展示这一差距。按构造,各项贡献之和等于组合总量。",
    },
  },
  model_dispersion: {
    en: {
      name: "Model dispersion",
      short: "The spread between the risk models' answers — largest estimate divided by smallest.",
      read: "Disagreement is information, so the models are never averaged into one opaque number. A high ratio usually means unstable conditions or that one model's assumptions are breaking down; read the individual rows rather than picking a favourite.",
    },
    zh: {
      name: "模型分歧度",
      short: "各风险模型结果之间的离散程度 — 最大估计值 ÷ 最小估计值。",
      read: "分歧本身就是信息,因此平台从不把模型平均成一个不透明的数字。比值偏高通常意味着市况不稳,或某个模型的假设正在失效;此时应逐行阅读,而不是挑一个自己偏好的模型。",
    },
  },
  model_risk_state: {
    en: {
      name: "Model risk state",
      short: "LOW / ELEVATED / HIGH — how much the statistical layer itself should be trusted right now.",
      read: "Driven by concrete triggers listed next to it: a failed model, models disagreeing, a core view unavailable, a small sample, or a distribution that breaks the Gaussian assumption. It rates the MODELS, not the market.",
    },
    zh: {
      name: "模型风险状态",
      short: "LOW / ELEVATED / HIGH — 当前这套统计层本身有多可信。",
      read: "由旁边列出的具体触发项决定:模型失败、模型互相分歧、核心视图不可用、样本过小,或分布明显违背正态假设。它评价的是\"模型\",不是市场。",
    },
  },
  drawdown_reconstructed: {
    en: {
      name: "Reconstructed drawdown",
      short: "Today's book replayed over the historical window — not a realized NAV history.",
      read: "It answers \"what would this exact book have done through that period?\" It is a what-if, since the positions were not actually held then. The live drawdown above it is the real one, and it only accrues from the first daily snapshot onward.",
    },
    zh: {
      name: "重构回撤",
      short: "把\"今天的持仓组合\"放回历史窗口重放的结果 — 不是真实的 NAV 历史。",
      read: "它回答的是\"这套持仓在那段时期会怎样\",属于假设推演,因为当时并未实际持有这些仓位。上方的实盘回撤才是真实值,且只能从第一个每日快照开始累积。",
    },
  },
  shadow_mode: {
    en: {
      name: "Shadow mode",
      short: "A model runs and is recorded, but is wired so it cannot change any trading decision.",
      read: "The point is to accumulate a track record before granting authority: the numbers are computed, logged and shown, while the hard limits alone keep deciding. Promotion out of shadow is an explicit, reviewed step — never a silent switch.",
    },
    zh: {
      name: "影子模式 (Shadow)",
      short: "模型照常运行并留痕,但在接线上无法改变任何交易决策。",
      read: "目的是先积累实绩再授予权限:数字照算、照记、照显示,而决策仍完全由硬性限制作出。从影子模式转正是一次显式且经过评审的动作 — 绝不会悄悄切换。",
    },
  },
  incremental_es: {
    en: {
      name: "Incremental ES",
      short: "How much the portfolio's Expected Shortfall changes when this trade is added.",
      read: "ES(after) − ES(before), both measured on the same window with the same method. A trade with a small standalone max loss can still be a large incremental ES if it moves with what you already own — that is exactly the number correlation hides from a dollar-exposure check.",
    },
    zh: {
      name: "增量 ES",
      short: "加入这笔交易后,组合的预期短缺 (ES) 变化了多少。",
      read: "即 ES(交易后) − ES(交易前),两者用同一窗口、同一方法计算。一笔单独看最大亏损很小的交易,如果与现有持仓同向波动,增量 ES 仍可能很大 — 这正是单看美元敞口时被相关性掩盖的部分。",
    },
  },
  marginal_es: {
    en: {
      name: "Marginal ES",
      short: "The extra portfolio ES from ONE more unit of this position.",
      read: "Per-unit sensitivity rather than a total: it answers \"is the next share/contract cheap or expensive in risk terms?\". Computed as the candidate's Euler risk contribution divided by the quantity, so scaling the position scales it roughly linearly — until correlation or tail behaviour changes.",
    },
    zh: {
      name: "边际 ES",
      short: "该持仓每增加一个单位,组合 ES 增加多少。",
      read: "它是每单位的敏感度而非总量:回答\"下一股/下一张合约在风险意义上是便宜还是昂贵\"。计算方式为候选持仓的欧拉风险贡献 ÷ 数量,因此在相关性与尾部特征不变时,大致随仓位线性变化。",
    },
  },
  es_share: {
    en: {
      name: "ES share",
      short: "One position's (or bucket's) percentage of the portfolio's total ES contributions.",
      read: "A share of RISK, not of capital or of NAV — the denominator is total ES, so the shares sum to 100%. It is the number the concentration limits are written against: 35% for any single position, 50% for any correlation bucket (research defaults, unvalidated).",
    },
    zh: {
      name: "ES 占比",
      short: "某个持仓(或某个相关性分组)占组合 ES 贡献总量的百分比。",
      read: "这是风险占比,不是资金占比也不是占净值比例 — 分母是 ES 总量,因此各项之和为 100%。集中度限制正是针对该数字设定的:单一持仓 35%、单个相关性分组 50%(研究默认值,尚未验证)。",
    },
  },
  diversification_ratio: {
    en: {
      name: "Diversification ratio",
      short: "Sum of each position's own volatility divided by the volatility of the book as a whole.",
      read: "A pure RATIO, not a percentage of NAV. 1.00 means no diversification benefit at all — the positions move together, so the book is as volatile as the sum of its parts. Higher means the parts partly cancel. It is measured on the same P&L window as the VaR rows above, and it is UNAVAILABLE rather than 1.00 when the window is too short or the book has no variance to divide by: 'not measured' and 'not diversified' are different facts. SHADOW — it decides nothing.",
    },
    zh: {
      name: "分散化比率",
      short: "各持仓自身波动率之和,除以整个组合的波动率。",
      read: "这是一个纯比值,不是 NAV 的百分比。1.00 表示完全没有分散化收益 — 各持仓同向变动,组合波动等于各部分之和。数值越高,说明各部分之间存在部分对冲。它与上方 VaR 使用同一段盈亏窗口计算;当窗口过短或组合没有可用于作分母的方差时,结果为 UNAVAILABLE 而不是 1.00 — “未测量”与“未分散”是两回事。SHADOW 模式 — 不参与任何决策。",
    },
  },
  factor_risk_share: {
    en: {
      name: "Factor risk share",
      short: "How much of the book's P&L variation is explained by one market proxy (SPY).",
      read: "The book's daily P&L is regressed on the factor's returns; the share is the fraction of P&L variance that regression explains, and beta is the book's dollar sensitivity to a 1-unit factor move. A high share means the book is largely a market bet regardless of how many different tickers it holds; the remainder is idiosyncratic. RESEARCH — one regression against one proxy series, so it derives no cap and gates nothing. A null means the factor series was unavailable or the paired window was too short; it never means the book has no market exposure.",
    },
    zh: {
      name: "因子风险占比",
      short: "组合盈亏波动中,可由单一市场代理(SPY)解释的比例。",
      read: "将组合的每日盈亏对因子收益率做回归:该占比即回归所解释的盈亏方差比例,β 则是组合对因子每单位变动的美元敏感度。占比高说明:无论持有多少不同标的,该组合本质上仍是一笔市场方向的押注;其余部分属于个体特异风险。RESEARCH 模式 — 仅为对单一代理序列的一次回归,因此不产生任何限额,也不参与决策。结果为空表示因子序列不可用或配对窗口过短,绝不表示该组合没有市场敞口。",
    },
  },
  correlation_regime: {
    en: {
      name: "Correlation regime",
      short: "Whether average pairwise correlation is at its normal level, elevated, or converging toward 1.",
      read: "Diversification tends to fail exactly when it is needed: three averages are tracked — normal (long window), current (short window), and stress (the worst days only). CONVERGING means the book is behaving like one position even though the tickers differ; the dollar positions need not have changed at all.",
    },
    zh: {
      name: "相关性状态",
      short: "两两平均相关性处于常态水平、偏高,还是正在向 1 收敛。",
      read: "分散化往往恰在最需要它时失效:平台跟踪三个平均值 — 常态(长窗口)、当前(短窗口)与压力(仅取最差的那些交易日)。CONVERGING 表示尽管标的代码不同,整个组合正表现得像一笔持仓 — 而美元仓位可能根本没有变化。",
    },
  },
  binding_constraint: {
    en: {
      name: "Binding constraint",
      short: "The specific limit that actually determined the approved quantity.",
      read: "A risk decision must be explainable, so the limits are named rather than reduced to a score. HARD_LIMIT constraints are deciding today; STATISTICAL and CONCENTRATION ones run in shadow — computed, logged and displayed, but they changed nothing.",
    },
    zh: {
      name: "生效约束",
      short: "真正决定了批准数量的那条具体限制。",
      read: "风险决策必须可解释,因此平台逐条列出限制名称,而不是压缩成一个分数。HARD_LIMIT(硬性限制)是当前真正作出决策的一层;STATISTICAL 与 CONCENTRATION 处于影子模式 — 照算、照记、照显示,但未改变任何结果。",
    },
  },
  var_backtest: {
    en: {
      name: "VaR backtest",
      short: "Checking a risk model against what actually happened: how often did losses exceed the forecast?",
      read: "A 95% VaR should be exceeded on about 5 days in 100 — too many exceedances means the model understates risk, too few means it wastes capital. Every forecast here is WALK-FORWARD: the number for a given day was built only from data available before that day, so the count is a genuine out-of-sample record and not a curve fit. It grades CALIBRATION, not profit.",
    },
    zh: {
      name: "VaR 回测",
      short: "用真实发生的结果检验风险模型:实际亏损超过预测值的次数有多少?",
      read: "95% 的 VaR 大约每 100 天应被突破 5 次 — 突破过多说明模型低估了风险,过少则说明白白占用了资金。这里的每一个预测都是前向滚动的:某一天的预测只使用该日之前已有的数据,因此这个计数是真正的样本外记录,而非事后拟合。它评价的是校准程度,不是盈利能力。",
    },
  },
  kupiec_test: {
    en: {
      name: "Kupiec test (coverage)",
      short: "A statistical test of whether the NUMBER of VaR exceedances matches the confidence level.",
      read: "It asks: given n forecast days, is x exceedances a plausible draw for a model claiming this confidence? The output is a p-value — LOW (below 0.05) means the count is hard to explain by chance, so the model's coverage is rejected. It says nothing about WHEN the exceedances happened; that is the Christoffersen test's job. Both matter: the right number of breaches all in one week is still a broken model.",
    },
    zh: {
      name: "Kupiec 检验(覆盖率)",
      short: "检验 VaR 被突破的次数是否与所声称的置信水平相符。",
      read: "它提出的问题是:在 n 个预测日中,出现 x 次突破对于该置信度的模型而言是否合理?输出为 p 值 — p 值偏低(低于 0.05)说明这个次数很难用随机性解释,即模型的覆盖率被拒绝。它不关心突破发生在什么时候,那是 Christoffersen 检验的职责。两者都重要:突破次数正确但全部挤在一周之内,模型依然是坏的。",
    },
  },
  christoffersen_test: {
    en: {
      name: "Christoffersen test (independence)",
      short: "A statistical test of whether VaR exceedances CLUSTER instead of arriving independently.",
      read: "A good model is surprised at random; a bad one is surprised repeatedly in the same week. The test compares the chance of a breach after a breach with the chance after a calm day — a LOW p-value (below 0.05) means today's exceedance predicts tomorrow's, the signature of a model that ignores volatility clustering. That is exactly the failure conditional (EWMA / GARCH) volatility is meant to fix.",
    },
    zh: {
      name: "Christoffersen 检验(独立性)",
      short: "检验 VaR 的突破是否扎堆出现,而非彼此独立地发生。",
      read: "好的模型出错是随机的;差的模型会在同一周里反复出错。该检验比较“突破之后再次突破”与“平静日之后突破”的概率 — p 值偏低(低于 0.05)意味着今天的突破可以预测明天的突破,这正是模型忽视波动率聚集的典型特征,也正是条件波动率(EWMA / GARCH)想要修正的问题。",
    },
  },
  garch: {
    en: {
      name: "GARCH(1,1)",
      short: "A conditional-volatility model: today's variance is built from yesterday's shock and yesterday's variance.",
      read: "It captures volatility CLUSTERING — calm follows calm, turmoil follows turmoil — which a flat historical σ cannot. Persistence (α + β) says how slowly a shock decays; close to 1 means today's turmoil is still felt weeks out. On this platform GARCH is RESEARCH: it is fitted, diagnosed and backtested, but the conditional views fall back to the simpler EWMA whenever its diagnostics do not pass, and it can only be promoted by an explicit, reviewed decision — never silently.",
    },
    zh: {
      name: "GARCH(1,1)",
      short: "一种条件波动率模型:当日方差由前一日的冲击与前一日的方差共同决定。",
      read: "它能捕捉波动率聚集 — 平静之后往往仍是平静,动荡之后往往仍是动荡 — 这是固定的历史 σ 做不到的。持续性(α + β)表示冲击衰减的快慢,越接近 1 说明今天的动荡在数周之后仍有影响。在本平台上 GARCH 属于研究状态:它会被拟合、诊断并回测,但只要诊断不通过,条件视图就回退到更简单的 EWMA;要转正必须经过显式评审 — 绝不会悄悄切换。",
    },
  },
  stress_test: {
    en: {
      name: "Stress test",
      short: "What the CURRENT book would lose if a specific, named shock happened right now.",
      read: "Unlike VaR, it asks no question about probability — it fixes a scenario (equity −10%, IV +40%, five days on) and reprices everything under it. Historical rows take their shocks from a real stored window; the hypothetical grid is a research parameterisation and is badged UNVALIDATED. A book can pass every VaR limit and still fail a stress test, which is the whole reason both are shown.",
    },
    zh: {
      name: "压力测试",
      short: "如果某个具体的、有名字的冲击此刻发生,当前持仓组合会亏多少。",
      read: "它与 VaR 不同,完全不问概率 — 而是先固定一个情景(股价 −10%、IV +40%、时间前进 5 天),再据此对全部持仓重新定价。历史情景的冲击取自真实的历史窗口;假设情景网格属于研究参数化,会标注 UNVALIDATED(未验证)。一个组合可能通过全部 VaR 限制却在压力测试中失败 — 这正是两者都要展示的原因。",
    },
  },
  full_revaluation: {
    en: {
      name: "Full revaluation",
      short: "Repricing an option under the scenario with the pricing model, instead of scaling its delta.",
      read: "Delta says the option moves linearly with the stock; it does not. Full revaluation feeds the shocked spot, the shocked IV and the reduced time back into Black–Scholes and takes the price difference, so gamma, vega and theta are all captured. When a leg has no usable IV the platform falls back to DELTA_LINEAR and labels the row — that fallback understates convexity in exactly the tail being probed.",
    },
    zh: {
      name: "全额重估 (Full revaluation)",
      short: "在情景下用定价模型对期权重新定价,而不是简单按 delta 线性放大。",
      read: "Delta 假设期权随股价线性变动,实际并非如此。全额重估把冲击后的现价、冲击后的 IV 与缩短后的剩余期限重新代入 Black–Scholes,再取价格差,因此 gamma、vega、theta 都被捕捉到。当某条腿没有可用的 IV 时,平台会退回 DELTA_LINEAR 并在该行标注 — 这种退化恰恰会低估所探测尾部中的凸性。",
    },
  },
  iv_crush: {
    en: {
      name: "IV crush",
      short: "A sharp drop in implied volatility that cuts option premium even when the stock barely moves.",
      read: "The classic long-option trap: the direction was right, the position still lost. It typically follows a scheduled event (earnings, an economic print) that removes the uncertainty the premium was pricing. The flat-spot / IV −40% scenario exists precisely to size that exposure — a long-premium book shows a large loss there with no equity shock at all.",
    },
    zh: {
      name: "波动率坍塌 (IV crush)",
      short: "隐含波动率骤降,即使股价几乎没动,期权权利金也会被大幅削减。",
      read: "这是买方期权的经典陷阱:方向判断对了,仓位却依然亏损。它通常发生在事件落地之后(财报、经济数据),因为权利金所定价的不确定性消失了。\"股价不变 / IV −40%\" 情景正是为了量化这一敞口 — 一个净买入权利金的组合在该情景下会出现明显亏损,而股价冲击为零。",
    },
  },
  model_tier: {
    en: {
      name: "Model tier (T0–T3)",
      short: "Which KIND of model produced a number — not how much it is trusted, and not whether it decides anything.",
      read: "T0 is the hard limits, and today it is the only tier that can veto or resize a trade. T1 is the core statistical layer (VaR/ES, volatility, risk contribution, drawdown, stress); T2 is the conditional and advanced models (GARCH, vol-scaled views); T3 is research that has been deliberately deferred with a recorded re-visit trigger. Read the tier as provenance and read health and mode separately: a T1 model can be ACTIVE, correct, and still change nothing, because the whole statistical layer runs in SHADOW. A chip is shown only where the server actually sent a tier — an unlabelled model is not silently assigned one.",
    },
    zh: {
      name: "模型层级 (T0–T3)",
      short: "标明某个数字出自「哪一类」模型 — 既不表示它有多可信,也不表示它是否参与决策。",
      read: "T0 是硬性限额,也是目前唯一能否决或缩减交易的层级。T1 是核心统计层(VaR/ES、波动率、风险贡献、回撤、压力测试);T2 是条件与进阶模型(GARCH、波动率调整视角);T3 是已被有意延后、并附有可触发复审条件的研究模型。层级应当读作「来源」,可信度与决策权要分开看:一个 T1 模型可以处于 ACTIVE、结果正确,却依然什么都不改变,因为整个统计层都运行在影子模式下。只有服务端确实给出了层级时才会显示标签 — 未标注的模型不会被悄悄归入某一层。",
    },
  },
  net_vega: {
    en: {
      name: "Net vega",
      short: "The book's P&L for a ONE POINT move in implied volatility, with spot and time held still.",
      read: "Positive means the book gains when IV rises (net long premium); negative means it gains when IV falls (net short premium). It is a LOCAL sensitivity, so it describes a small move from here and says nothing about how far IV can travel — the IV-crush stress scenario is what sizes that. On the pre-trade comparison it is deliberately left uncoloured: more vega is not \"worse\" the way more VaR is, it is simply a different exposure, and only you know which one the trade intended.",
    },
    zh: {
      name: "净 Vega",
      short: "在现价与剩余期限不变的前提下,隐含波动率变动「一个点」时组合的盈亏。",
      read: "为正表示 IV 上升时组合获利(净买入权利金);为负表示 IV 下降时获利(净卖出权利金)。它是「局部」敏感度,只描述当前位置附近的微小变动,完全不说明 IV 能走多远 — 那要由「波动率坍塌」压力情景来衡量。在交易前对比表中,它被有意不着色:Vega 变多并不像 VaR 变大那样等于「更糟」,它只是另一种敞口,而这笔交易究竟想要哪一种,只有你自己知道。",
    },
  },
  incremental_var: {
    en: {
      name: "Incremental VaR",
      short: "How much this one trade moves the whole portfolio's VaR: VaR(after) − VaR(before).",
      read: "Not the same as the candidate's own standalone VaR. A position can be risky by itself and still barely move — or even reduce — the portfolio figure, because what matters is how its losses line up with the losses the book already has. A positive number means the trade deepens the tail. Read it beside Incremental ES: VaR moves the threshold where the bad tail begins, ES moves the average loss inside it, and a trade can look mild on one and severe on the other.",
    },
    zh: {
      name: "增量 VaR",
      short: "这一笔交易会让整个组合的 VaR 变动多少:VaR(交易后) − VaR(交易前)。",
      read: "它与该候选仓位自身的独立 VaR 不是一回事。一个仓位本身可能风险很高,却几乎不改变——甚至降低——组合层面的数值,因为真正起作用的是它的亏损与组合既有亏损是否同时发生。数值为正表示该交易会加深尾部。请与「增量 ES」对照阅读:VaR 改变的是坏尾开始的门槛,ES 改变的是坏尾内部的平均亏损,一笔交易完全可能在其中一项上温和、在另一项上严重。",
    },
  },
  basis_adjustment: {
    en: {
      name: "Basis adjustment",
      short: "The constant gap between an option's market mark and the model's price, held fixed across every scenario.",
      read: "The model never reproduces the market mark exactly (bid/ask, skew, the platform's flat r and q). The difference is measured once at the baseline and carried unchanged into each scenario price, so the zero scenario returns EXACTLY zero P&L and every reported number is a scenario EFFECT rather than a model-error artefact. It is held constant, not re-fitted — the scenario changes the state, never the calibration.",
    },
    zh: {
      name: "基差调整 (Basis adjustment)",
      short: "期权市场标记价与模型理论价之间的固定差额,在所有情景中保持不变。",
      read: "模型无法精确复现市场标记价(买卖价差、波动率偏斜、平台采用的固定 r 与 q)。平台在基准状态测得一次该差额,并原样带入每个情景的价格,因此零情景的盈亏严格为 0,所报数字都是情景的影响而非模型误差。它保持恒定、不重新拟合 — 情景改变的是状态,而不是校准。",
    },
  },
  event_status_estimated: {
    en: {
      name: "ESTIMATED event date",
      short: "A date the platform DERIVED from a company's past filing cadence — no source has confirmed it.",
      read: "Read it as \"roughly when, if the pattern holds\", never as a scheduled fact. It comes from the median gap between the company's past 8-K Item 2.02 earnings releases (SEC EDGAR), because the earnings-calendar subscription is not available on this plan. It can move by days. Confirm the real date from the company's IR page and the platform will pin it — a user-confirmed date outranks every automated source.",
    },
    zh: {
      name: "估算事件日期 (ESTIMATED)",
      short: "平台依据公司过往申报节奏推算出的日期 — 尚无任何来源确认。",
      read: "应理解为\"若节奏延续,大致在何时\",绝不能当作已排定的事实。它来自该公司过往 8-K Item 2.02 财报公告(SEC EDGAR)之间的中位间隔,因为当前订阅方案不包含财报日历接口。实际日期可能相差数天。可从公司投资者关系页面确认真实日期后在平台标记,用户确认的日期优先级高于任何自动来源。",
    },
  },
  event_importance: {
    en: {
      name: "Event importance",
      short: "A transparent 0-100 score: an event-type base plus a relevance bonus. Never an LLM opinion.",
      read: "Every component is listed and they add up — a FOMC decision starts at 90, earnings at 60, a Fed speech at 20. Relevance adds +30 if you hold the name, +20 if it is in the Trading Pool, +10 if it is on the Watchlist. The total is clamped to 100, and when the raw sum exceeded 100 the platform shows the pre-clamp figure too. It ranks your attention; it says nothing about direction or magnitude.",
    },
    zh: {
      name: "事件重要度",
      short: "透明的 0-100 分:事件类型基准分加上相关性加分。绝非 LLM 主观打分。",
      read: "每一项组成都会列出且可加总核对 — FOMC 决议基准 90 分,财报 60 分,美联储讲话 20 分。相关性加分:持仓 +30,交易池 +20,自选列表 +10。总分封顶 100;当原始加总超过 100 时,平台会同时显示封顶前的数值。该分数只用于排定关注优先级,不预示方向或波动幅度。",
    },
  },
  event_session_timing: {
    en: {
      name: "Session timing (BMO / AMC)",
      short: "Whether the release lands before the open, during the session, or after the close — in exchange time.",
      read: "It decides WHICH trading day absorbs the move. An after-market release gaps the NEXT open; a before-market release gaps THAT open. Classified against the stored exchange calendar, so a half-day close is handled correctly rather than assumed to be 16:00. UNKNOWN means the source gave no time — the platform says so instead of guessing.",
    },
    zh: {
      name: "交易时段归属 (盘前 / 盘后)",
      short: "公布时点落在开盘前、盘中还是收盘后 — 以交易所所在时区计。",
      read: "它决定由哪个交易日承接价格波动。盘后公布会跳空影响次日开盘;盘前公布则影响当日开盘。平台依据已存储的交易所日历判定,因此半日休市能被正确处理,而非一律假设 16:00 收盘。UNKNOWN 表示来源未给出具体时间 — 平台如实说明,而不作猜测。",
    },
  },
  event_relevance_tier: {
    en: {
      name: "Relevance tier",
      short: "How the event connects to YOUR book: position, trading pool, watchlist, market-wide, or other.",
      read: "The ordering rule for the whole page (§12): an event on a name you hold outranks an unrelated macro print at the same hour. MARKET_WIDE covers macro and Fed events, which have no single ticker to be relevant to but move everything. It is a sort key, not a judgement of importance.",
    },
    zh: {
      name: "相关性层级",
      short: "该事件与你账户的关联方式:持仓、交易池、自选列表、全市场,或其他。",
      read: "这是整页的排序规则 (§12):你持有的标的的事件,优先于同一时刻的无关宏观数据。MARKET_WIDE(全市场)涵盖宏观与美联储事件 — 它们没有对应的单一标的,却影响全局。这只是排序依据,不代表重要程度的判断。",
    },
  },
  event_t_minus: {
    en: {
      name: "T-minus",
      short: "Days remaining until the event, counted from now in exchange time.",
      read: "T-2d means two days out. For an ESTIMATED date the countdown inherits that uncertainty — it is a countdown to a guess, not to an appointment. The platform raises its first alert around T-7d, and only for CONFIRMED or REVISED dates; estimated dates never alert.",
    },
    zh: {
      name: "倒计时 (T-minus)",
      short: "距事件发生还有多少天,以交易所时区自当前时刻计算。",
      read: "T-2d 表示还有两天。若日期为 ESTIMATED(估算),倒计时同样带有该不确定性 — 它指向的是推测值而非确定日程。平台约在 T-7d 首次提醒,且仅针对 CONFIRMED 或 REVISED 的日期;估算日期永不触发提醒。",
    },
  },
  delta_notional: {
    en: {
      name: "Delta-adjusted notional",
      short: "Every position converted to its equivalent stock exposure via delta, then summed.",
      read: "Options leverage hides true direction size; delta-adjusting reveals it. Capped as a share of NAV (§16).",
    },
    zh: {
      name: "Delta 调整后名义敞口",
      short: "把每个持仓按 delta 折算成等效股票敞口后加总。",
      read: "期权的杠杆会掩盖真实方向性规模;按 delta 折算后现形。以占净值比例设上限 (§16)。",
    },
  },

  /* ------------------------------------------------ Phase E1 price context */

  event_run_up: {
    en: {
      name: "Run-up since the last event",
      short: "The stock's total return from the previous comparable event's close to the latest close.",
      read: "It says what is ALREADY priced in. A name up 20% into a print is being asked to beat a raised bar; one down 15% has a lower one. It is a measured return over a stated window, not a forecast — and the window is anchored on the previous event, so a longer gap between prints naturally shows a bigger number.",
    },
    zh: {
      name: "自上次事件以来的涨跌幅",
      short: "从上一次可比事件收盘价到最新收盘价的累计收益率。",
      read: "它反映市场已经price in了多少。财报前已上涨 20% 的股票,面对的是被抬高的预期门槛;下跌 15% 的则门槛更低。这是特定窗口内的实测收益,不是预测 — 窗口以上次事件为锚点,因此两次事件间隔越长,该数值天然越大。",
    },
  },
  event_relative_return: {
    en: {
      name: "SPY-relative return",
      short: "The stock's since-anchor return MINUS SPY's over the exact same calendar window.",
      read: "It separates the company's move from the market's. +18% while SPY did +15% is a 3-point idiosyncratic move, not an 18-point one. Aligned by DATE, not by bar count, so a missing day cannot silently shift the comparison. It is a simple difference of returns, not a beta-adjusted alpha.",
    },
    zh: {
      name: "相对 SPY 收益",
      short: "同一日历窗口内,个股的锚点以来收益率减去 SPY 的收益率。",
      read: "用于把公司自身的波动与大盘波动区分开。个股 +18%、同期 SPY +15%,真正属于公司的只有 3 个百分点,而非 18 个。对齐方式是按日期而非按第几根K线,因此缺失交易日不会悄然改变对比口径。这是收益率的简单相减,不是经 beta 调整的 alpha。",
    },
  },
  event_max_drawdown_window: {
    en: {
      name: "Max drawdown since the anchor",
      short: "The deepest peak-to-trough decline in closing prices since the previous comparable event.",
      read: "The run-up alone hides the path: +10% reached smoothly is a different setup from +10% after a −18% round trip. Measured on closes within the window only — it is not the all-time drawdown, and it says nothing about what comes next.",
    },
    zh: {
      name: "锚点以来最大回撤",
      short: "自上一次可比事件以来,收盘价从阶段高点到随后低点的最大跌幅。",
      read: "仅看涨跌幅会掩盖过程:平稳上涨 10%,与先跌 18% 再涨回的 10%,是完全不同的局面。仅在该窗口内按收盘价计算 — 不是历史最大回撤,也不预示后续走势。",
    },
  },
  event_realized_vol_20d: {
    en: {
      name: "Realized volatility (20d, annualised)",
      short: "The annualised standard deviation of the last 20 daily log returns.",
      read: "How much the stock has ACTUALLY been moving lately, in the same annualised units option implied volatility is quoted in — which makes the two comparable. It is backward-looking by construction: it measures the past 20 sessions and does not extend them forward.",
    },
    zh: {
      name: "已实现波动率 (20 日,年化)",
      short: "最近 20 个交易日对数收益率的标准差,按年化处理。",
      read: "衡量该股近期实际的波动幅度,单位与期权隐含波动率一致(均为年化),因此二者可直接对比。它本质上是回溯指标:只描述过去 20 个交易日,不代表未来。",
    },
  },
  event_atr_pct: {
    en: {
      name: "ATR% (14-day)",
      short: "The 14-day Average True Range expressed as a percentage of the latest close.",
      read: "A typical day's full range, in percent — the everyday movement to compare an expected event move against. If ATR% is 3%, a 3% post-earnings move is an ordinary day, not a reaction. True Range includes overnight gaps, so it is wider than a high-minus-low reading.",
    },
    zh: {
      name: "ATR% (14 日)",
      short: "14 日平均真实波幅,以最新收盘价的百分比表示。",
      read: "代表「平常一天」的波动幅度,可用来对照事件的预期波幅。若 ATR% 为 3%,那么财报后 3% 的波动只是普通一天,算不上反应。真实波幅包含隔夜跳空,因此比单纯的最高价减最低价更宽。",
    },
  },
  event_sma_distance: {
    en: {
      name: "Distance from moving average",
      short: "How far the latest close sits above (+) or below (−) its 20/50/200-day simple moving average.",
      read: "A location marker for the trend, nothing more. Well above the 200-day means an extended uptrend; below it, a downtrend. A blank value is honest: the 200-day needs 200 stored bars, and the platform reports the shortfall instead of averaging fewer.",
    },
    zh: {
      name: "距均线的偏离度",
      short: "最新收盘价高于 (+) 或低于 (−) 20/50/200 日简单移动平均线的幅度。",
      read: "它只是趋势位置的标记,不含更多含义。远高于 200 日均线表示上升趋势已延伸;低于则为下降趋势。数值为空是如实呈现:200 日均线需要 200 根已存储 K 线,平台会说明数据不足,而不会用更少的样本凑数。",
    },
  },
  event_52w_distance: {
    en: {
      name: "Distance from the 52-week high / low",
      short: "How far the latest close is below the 52-week high, and above the 52-week low.",
      read: "Where the event lands in the year's range. Near the high, expectations are already elevated; near the low, positioning is likely defensive. Computed from the stored daily bars in the window — if fewer than a year of bars exist, the platform says so rather than calling a shorter range \"52-week\".",
    },
    zh: {
      name: "距 52 周高/低点的距离",
      short: "最新收盘价低于 52 周最高价、以及高于 52 周最低价的幅度。",
      read: "说明事件发生在年度价格区间的什么位置。接近高点意味着市场预期已经很高;接近低点则往往对应偏防御的持仓结构。基于窗口内已存储的日线计算 — 若不足一年的数据,平台会明确说明,而不会把更短的区间称作「52 周」。",
    },
  },
  event_volume_trend: {
    en: {
      name: "Volume trend",
      short: "Average daily volume over the last 20 sessions versus the 60 sessions before them.",
      read: "+40% means participation has stepped up going into the event — more eyes, and usually more positioning. It measures ATTENTION, not direction: heavy volume accompanies both accumulation and distribution, and this number cannot tell them apart.",
    },
    zh: {
      name: "成交量趋势",
      short: "最近 20 个交易日的日均成交量,相对此前 60 个交易日的变化。",
      read: "+40% 表示临近事件时参与度明显上升 — 关注者更多,通常持仓调整也更多。它衡量的是「关注度」而非方向:放量既可能是吸筹也可能是派发,该指标无法区分二者。",
    },
  },
  event_gap_return: {
    en: {
      name: "Event gap",
      short: "The reaction bar's OPEN divided by the pre-event close — the overnight jump itself.",
      read: "For an after-market release this is the entire initial repricing: it happens before you can trade it. Comparing the gap with the 1-day return shows whether the move continued into the session or faded — a +8% gap that closes +3% was sold all day.",
    },
    zh: {
      name: "事件跳空幅度",
      short: "反应日的开盘价相对事件前收盘价的变动 — 即隔夜跳空本身。",
      read: "对盘后公布的事件,这就是最初的全部重定价:它发生在你能交易之前。把跳空幅度与 1 日收益对比,可看出行情是延续还是回落 — 跳空 +8% 但收盘仅 +3%,说明全天都在被卖出。",
    },
  },
  event_reaction_returns: {
    en: {
      name: "Event reaction (1D / 3D / 5D / 10D)",
      short: "Close-to-close return from the pre-event close through the Nth trading day after the event.",
      read: "All four horizons start from the SAME pre-event close, so they are cumulative, not sequential: 3D is not \"the move on day three\". 1D is the reaction bar's close. Horizons that run past the stored bars are left blank with a reason — never padded with the last known value.",
    },
    zh: {
      name: "事件后反应 (1/3/5/10 日)",
      short: "从事件前收盘价,到事件后第 N 个交易日收盘价的累计收益率。",
      read: "四个周期都以同一个事件前收盘价为起点,因此是累计值而非逐日值:3D 并不表示「第三天当日的涨跌」。1D 即反应日收盘。若周期超出已存储的 K 线范围,则留空并附原因 — 绝不用最后已知价格填补。",
    },
  },
  event_abnormal_return: {
    en: {
      name: "Abnormal return vs SPY",
      short: "The stock's event-window return minus SPY's return over the identical calendar dates.",
      read: "It isolates the news from the tape. A +4% day when the whole market rose 3.5% is a 0.5-point event reaction, and reading it as +4% is the most common way an earnings move gets overstated. Aligned by date; when SPY bars are missing for a window the cell stays blank rather than assuming SPY was flat. A plain difference, not a beta-adjusted or risk-model alpha.",
    },
    zh: {
      name: "相对 SPY 的超额收益",
      short: "事件窗口内个股收益率,减去同一批日期上 SPY 的收益率。",
      read: "用于把消息本身的影响与大盘行情分离。个股当日 +4% 而大盘上涨 3.5%,事件真正贡献的只有 0.5 个百分点;把它读作 +4% 是高估财报波动最常见的方式。按日期对齐;若某窗口缺少 SPY 数据,该格留空,而不假设 SPY 当日持平。这是简单相减,不是经 beta 调整或风险模型估计的 alpha。",
    },
  },
  event_history_stats: {
    en: {
      name: "Historical reaction stats",
      short: "The distribution of PAST absolute event moves — median, p75, p90, max — over the last N events, with N always shown.",
      read: "Read it as \"this is how big the moves have been\", never as a probability. Eight earnings prints is a tiny sample: p90 over 8 events is the second-largest of eight, and one outlier quarter moves it. The positive count (\"5 of 8\") is a tally of history, not a 62% chance of an up move. Absolute values, so direction is deliberately discarded — this measures MAGNITUDE only.",
    },
    zh: {
      name: "历史反应统计",
      short: "过去 N 次事件的绝对波幅分布 — 中位数、p75、p90、最大值,且始终标注样本量 N。",
      read: "应理解为「历史上波动有多大」,绝不能当作概率。8 次财报是极小的样本:8 个样本的 p90 实际上就是第二大的那个值,一个异常季度就能改变它。上涨次数(如「8 次中 5 次」)是历史计数,不代表 62% 的上涨概率。统计取绝对值,刻意舍弃方向 — 它只衡量幅度。",
    },
  },
  event_bars_as_of: {
    en: {
      name: "As-of / bars through",
      short: "The instant this block was computed at, and the last daily bar that had CLOSED by then.",
      read: "The look-ahead gate. A bar counts only once its session has closed (16:00 ET), so a page loaded at 15:59 legitimately shows one bar fewer than at 16:01. This is what makes a past as-of reproduce what was actually knowable at that moment instead of quietly using tomorrow's data.",
    },
    zh: {
      name: "计算时点 / 数据截至",
      short: "本区块的计算时刻,以及在该时刻之前已经收盘的最后一根日线。",
      read: "这是防止「未来函数」的关卡。只有当交易日收盘(美东 16:00)后,该日 K 线才被计入,因此 15:59 打开的页面比 16:01 少一根 K 线是正常的。正因如此,把 as_of 设为过去某一时刻,才能真实还原当时可知的信息,而不会悄悄用上未来数据。",
    },
  },
  /* ------------------------------------------------- Phase C event replay
     The §20/§60 replay vocabulary. Every entry here has the same job as the
     Phase E1 ones — explain the concept, name what the number CANNOT tell
     you — plus one extra duty specific to intraday measurement: say out loud
     that a minute-level move is measured on bars that may not exist, and
     that an assumed session is an assumption. */
  event_after_hours_move: {
    en: {
      name: "After-hours move",
      short: "The last extended-hours trade after the release, against the pre-event close.",
      read: "This is the first repricing, and for most retail accounts it happens where you cannot trade. Extended-hours minute bars are SPARSE and thin: a 6% after-hours move on a handful of bars is a real print but a fragile one, and the regular-session open frequently lands somewhere else entirely. Compare it with the gap at open to see how much of it survived the night.",
    },
    zh: {
      name: "盘后波动",
      short: "公布后最后一笔盘后成交价,相对事件前收盘价的变动。",
      read: "这是最初的重新定价,而对多数散户账户而言,它发生在你无法交易的时段。盘后分钟 K 线稀疏且成交清淡:仅凭寥寥几根 K 线得出的 6% 盘后波动是真实成交,但极不稳固,次日开盘往往落在完全不同的位置。可与开盘跳空对比,看这段波动有多少延续到了盘中。",
    },
  },
  event_gap_at_open: {
    en: {
      name: "Gap at open",
      short: "The first regular-session minute bar's open, against the pre-event close.",
      read: "The part of the reaction that is already priced in before you can act on it. Measured from the 09:30 ET opening bar, not from the after-hours last price — those are different numbers and conflating them makes an overnight fade look like an opening jump.",
    },
    zh: {
      name: "开盘跳空",
      short: "常规交易时段第一根分钟 K 线的开盘价,相对事件前收盘价的变动。",
      read: "这是在你能采取行动之前就已被计入价格的那部分反应。以美东 09:30 的开盘 K 线为准,而非盘后最后成交价 — 两者是不同的数字,混为一谈会把隔夜回落误读成开盘跳升。",
    },
  },
  event_intraday_windows: {
    en: {
      name: "+5m / +30m / +60m",
      short: "The move measured at fixed minute marks after the reaction anchor, on 1-minute bars.",
      read: "All three share the SAME anchor (the opening bar for an overnight release, the pre-release bar for a during-market one), so they are cumulative, not sequential. When no bar exists exactly at a mark the last bar at or before it is used and the lag is shown — a +30m read filled by a bar 14 minutes late is a real measurement but not a 30-minute one. A mark past the as-of instant is left blank with a reason, never carried forward from the previous mark.",
    },
    zh: {
      name: "+5 分钟 / +30 分钟 / +60 分钟",
      short: "以 1 分钟 K 线,在反应起点之后的固定分钟刻度上测得的涨跌。",
      read: "三者共用同一起点(隔夜发布用开盘 K 线,盘中发布用公布前那根 K 线),因此是累计值而非逐段值。若某刻度上恰好没有 K 线,则取该刻度之前最后一根,并标注时滞 — 用延后 14 分钟的 K 线填补的「+30 分钟」是真实测量,但已不是 30 分钟的读数。超出计算时点的刻度留空并附原因,绝不沿用上一刻度的数值。",
    },
  },
  event_intraday_confidence: {
    en: {
      name: "Assumed session (low confidence)",
      short: "The release time relative to the session was UNKNOWN, so an after-market print was assumed.",
      read: "Without a stated session the platform cannot tell a pre-open release from a post-close one, and the two produce completely different anchors. It assumes after-market, labels the result low confidence and names the assumption in `basis` — a number measured on a guess is still shown, but never as if it were measured on a fact. Confirming the event's session removes the assumption.",
    },
    zh: {
      name: "时段为假定值(低置信度)",
      short: "公布时间相对于交易时段未知,因此按盘后发布假定处理。",
      read: "缺少明确时段时,平台无法区分盘前发布与盘后发布,而两者对应的测量起点完全不同。系统按盘后假定处理,将结果标记为低置信度,并在 basis 中写明该假定 — 基于假定得出的数字仍会展示,但绝不会被当作基于事实的测量。确认该事件的时段后,该假定即被消除。",
    },
  },
  event_first_hour_range: {
    en: {
      name: "Max move in the first hour",
      short: "The largest absolute swing from the anchor price during the first 60 minutes.",
      read: "How far the reaction travelled, not where it ended. A print that closes the hour flat after a 7% round trip was violent, and only this number says so. Absolute by construction, so it measures MAGNITUDE and discards direction. It is a description of one past hour, not a range you can expect next time.",
    },
    zh: {
      name: "首小时最大波幅",
      short: "开始后 60 分钟内,相对起点价格的最大绝对波动幅度。",
      read: "衡量行情「走了多远」,而非「收在哪里」。某次财报在往返 7% 后一小时几乎持平,那一小时其实剧烈异常 — 只有这个数字能反映出来。它取绝对值,只衡量幅度、舍弃方向。它描述的是过去某一小时的实际情况,而不是下次可以预期的波动区间。",
    },
  },
  event_intraday_volume: {
    en: {
      name: "First 30m volume vs normal",
      short: "Shares traded in the first 30 minutes, against the average of the same window over the prior 5 sessions.",
      read: "A multiple, not a percentage: 3.1× means three times a normal opening half-hour. Volume confirms that a price move was PARTICIPATED IN rather than printed on a thin book — a 5% move on 0.6× volume is a much weaker signal than the same move on 4×. The baseline needs five prior sessions of stored minute bars; without them the comparison is reported unavailable rather than computed against a shorter window.",
    },
    zh: {
      name: "首 30 分钟成交量 vs 常态",
      short: "开盘后 30 分钟的成交股数,与此前 5 个交易日同一时段均值的比值。",
      read: "这是倍数而非百分比:3.1× 表示相当于正常开盘半小时的三倍。成交量用于确认价格波动是否有真实参与,而非在清淡盘口上打出的价格 — 在 0.6× 成交量下的 5% 波动,其信号强度远弱于 4× 成交量下的同等波动。该基准需要此前 5 个交易日的分钟 K 线;缺少时如实标注为不可用,而不会改用更短的窗口凑数。",
    },
  },
  event_minute_bars_backfill: {
    en: {
      name: "Minute bars (backfill)",
      short: "1-minute bars for this event's window, fetched only when you ask for them.",
      read: "One event window is a full trading day of per-minute bars for one symbol, so the platform does not fetch them on page load — it would spend a provider call for every event you merely scrolled past. Pressing the button fetches THIS event's window and stores it; the reaction above then recomputes from stored bars. An event whose window was never backfilled shows \"no minute bars stored\", which is a state, not an error.",
    },
    zh: {
      name: "分钟 K 线(按需回补)",
      short: "该事件窗口的 1 分钟 K 线,仅在你主动请求时才抓取。",
      read: "单个事件窗口相当于一个标的一整个交易日的分钟级 K 线,因此平台不会在页面加载时抓取 — 否则你只是滑动浏览过的每个事件都会消耗一次数据源调用。点击按钮即抓取并存储「本事件」的窗口,上方的反应指标随即基于已存储的 K 线重新计算。从未回补过的事件会显示「未存储分钟 K 线」,这是一种状态,而非错误。",
    },
  },
  event_history_table: {
    en: {
      name: "Event history table (§60)",
      short: "The last 4 / 8 / 12 comparable events for this ticker, one row each, measured on stored bars.",
      read: "Read DOWN a column, not across a row: the point is the distribution of past reactions, not any single quarter. Rows are the same event TYPE only and never mix types. Columns the platform cannot compute — EPS surprise, revenue surprise, implied move — stay in the table marked UNAVAILABLE with the reason, because a silently dropped column reads as a column that did not matter.",
    },
    zh: {
      name: "事件历史表 (§60)",
      short: "该标的最近 4 / 8 / 12 次可比事件,每次一行,均基于已存储行情测算。",
      read: "应「按列纵向」阅读,而非横向看单行:重点是历次反应的分布,而不是某一个季度。表中各行仅限同一事件类型,绝不混合不同类型。平台无法计算的列 — EPS 超预期、营收超预期、隐含波动幅度 — 仍保留在表中并标注为「不可用」及原因,因为悄悄删掉一列,会让人误以为那一列无关紧要。",
    },
  },
  event_surprise_unavailable: {
    en: {
      name: "EPS / revenue surprise",
      short: "Reported result minus the analyst consensus that was standing before the print.",
      read: "Structurally unavailable here, at every instant — not merely missing today. Surprise needs a POINT-IN-TIME consensus estimate (what analysts expected the day before), and no data provider on this platform's tiers supplies one. Computing it against a later-revised or after-the-fact estimate would produce a number that looks right and is not, so the column stays explicitly empty instead.",
    },
    zh: {
      name: "EPS / 营收超预期幅度",
      short: "实际公布值,减去公布前市场分析师的一致预期。",
      read: "该指标在此处是结构性不可用的,任何时点都如此 — 并非「今天恰好缺数据」。计算超预期幅度需要「时点一致预期」(即公布前一日分析师的预期值),而本平台所订阅的各档数据源均不提供。若改用事后修订过的预期值计算,会得到一个看似正确、实则错误的数字,因此该列保持明确留空。",
    },
  },
  event_implied_vs_actual: {
    en: {
      name: "Implied vs actual move",
      short: "What the options market priced in before the event, against what the stock actually did.",
      read: "Only the ACTUAL half exists today: |1-day return|, measured from stored bars. The implied half needs the pre-event option chain, which arrives with the options intelligence phase — until then the comparison is reported unavailable rather than half-shown, because an actual move presented beside an empty implied column invites reading it as an outperformance.",
    },
    zh: {
      name: "隐含波动 vs 实际波动",
      short: "事件前期权市场所定价的波动幅度,与个股实际发生的波动幅度的对比。",
      read: "目前只有「实际」这一半存在:即基于已存储行情算出的 1 日收益率绝对值。「隐含」那一半需要事件前的期权链数据,将随期权智能分析阶段上线 — 在此之前,该对比整体标注为不可用,而不是只显示一半,因为把实际波动摆在空白的隐含列旁边,容易被误读成「跑赢了预期」。",
    },
  },
  /* ---------------------------------------------- Phase E2 fundamentals
     One entry per §28 metric plus the three tab-level concepts (as-of on
     acceptance, own-history percentile, missing consensus). Policy is the
     same as every other entry: explain the CONCEPT, state what the number
     cannot tell you, and never imply predictive power. Where the provider
     simply does not report an input, the entry SAYS so — a beginner reading
     "Unavailable" deserves to know it is a feed gap, not a company that
     failed to file. */
  fund_revenue: {
    en: {
      name: "Revenue",
      short: "Total sales booked in the quarter, straight off the filed income statement.",
      read: "The top line — everything else is carved out of it. Compare it with the SAME quarter a year ago, not the one before: most businesses have a seasonal shape, and Q4-vs-Q3 mostly measures the calendar.",
    },
    zh: {
      name: "营业收入 (Revenue)",
      short: "本季度确认的总销售额,直接取自已申报的利润表。",
      read: "这是「顶线」,其余各项都从它里面扣减而来。应与去年同期对比,而不是与上一季度对比:多数业务有季节性,用 Q4 比 Q3 主要比的是日历,而非经营。",
    },
  },
  fund_revenue_ttm: {
    en: {
      name: "Revenue (TTM)",
      short: "Trailing twelve months of revenue — the last four quarters added up.",
      read: "Seasonality cancels out over a full year, so TTM is the fairer denominator for margins and P/S. It also lags: a business that turned last quarter shows up in TTM only one quarter at a time.",
    },
    zh: {
      name: "营业收入 (最近十二个月)",
      short: "过去十二个月的收入 — 即最近四个季度之和。",
      read: "整年口径可抵消季节性,因此作为利润率与市销率的分母更公允。但它也有滞后性:上季度刚出现的拐点,在 TTM 中每次只体现四分之一。",
    },
  },
  fund_revenue_growth_yoy: {
    en: {
      name: "Revenue growth (YoY)",
      short: "This quarter's revenue against the SAME fiscal quarter one year earlier.",
      read: "Year-over-year is used precisely so seasonality cannot masquerade as growth. It needs five quarters of filings on hand; with fewer, this row says so instead of comparing against a different quarter.",
    },
    zh: {
      name: "收入同比增速",
      short: "本季度收入与去年同一财季的对比。",
      read: "之所以用同比,正是为了避免季节性被误读成增长。它需要至少五个季度的申报数据;数据不足时该行会如实说明,而不会拿不同季度硬比。",
    },
  },
  fund_gross_margin: {
    en: {
      name: "Gross margin",
      short: "Gross profit ÷ revenue — what is left after the direct cost of what was sold.",
      read: "The cleanest read on pricing power and product mix. Moves are small and meaningful, so the change column reports basis points: 100 bps = 1.00 percentage point. A margin cannot be computed from zero revenue, and that case is reported, not shown as 0%.",
    },
    zh: {
      name: "毛利率",
      short: "毛利 ÷ 收入 — 扣除直接销售成本后剩余的比例。",
      read: "衡量定价能力与产品结构最干净的指标。其变动幅度小但意义大,因此变化列以基点(bps)表示:100 bps = 1.00 个百分点。收入为零时无法计算毛利率,此时会如实说明,而不会显示为 0%。",
    },
  },
  fund_operating_margin: {
    en: {
      name: "Operating margin",
      short: "Operating income ÷ revenue — profitability after R&D, sales and admin costs.",
      read: "Gross margin minus the cost of running the company. When gross margin holds but operating margin falls, spending grew faster than sales — that gap is the whole story of the quarter.",
    },
    zh: {
      name: "营业利润率",
      short: "营业利润 ÷ 收入 — 扣除研发、销售及管理费用后的盈利水平。",
      read: "即毛利率再减去公司运营开支。若毛利率稳定而营业利润率下滑,说明开支增速快于收入 — 这个缺口往往就是本季度的核心信息。",
    },
  },
  fund_net_margin: {
    en: {
      name: "Net margin",
      short: "Net income ÷ revenue — what survives tax, interest and one-offs.",
      read: "The most quoted margin and the noisiest: a legal settlement or a tax item can swing it without anything changing in the business. Read it beside operating margin, never alone.",
    },
    zh: {
      name: "净利率",
      short: "净利润 ÷ 收入 — 扣除税费、利息与一次性项目后的最终留存比例。",
      read: "最常被引用、也最容易受扰动的利润率:一笔诉讼和解或税务项目就能让它大幅波动,而业务本身毫无变化。务必与营业利润率对照阅读,不要单看。",
    },
  },
  fund_eps_diluted: {
    en: {
      name: "Diluted EPS",
      short: "Net income per share, counting every share that options and converts could create.",
      read: "Diluted rather than basic, because the extra shares are real claims on the same profit. EPS rises when profit rises AND when the share count falls — a buyback flatters this line without any operating improvement.",
    },
    zh: {
      name: "稀释每股收益",
      short: "按已计入期权、可转债等潜在股份后的股本计算的每股净利润。",
      read: "采用稀释口径而非基本口径,因为那些潜在股份对同一份利润拥有真实索取权。利润上升会推高 EPS,股本减少同样会 — 回购能美化这一行,而经营层面可能毫无改善。",
    },
  },
  fund_eps_diluted_ttm: {
    en: {
      name: "Diluted EPS (TTM)",
      short: "The last four quarters of diluted EPS added together.",
      read: "The denominator of the trailing P/E on this page. Trailing means BACKWARD-looking: it prices the year that happened, and says nothing about the year ahead.",
    },
    zh: {
      name: "稀释每股收益 (最近十二个月)",
      short: "最近四个季度稀释每股收益之和。",
      read: "本页滚动市盈率的分母。「滚动」意味着向后看:它反映的是已经发生的一年,对未来一年不作任何判断。",
    },
  },
  fund_eps_growth_yoy: {
    en: {
      name: "EPS growth (YoY)",
      short: "Diluted EPS against the same fiscal quarter a year earlier.",
      read: "Growing faster than revenue means margins expanded or the share count shrank. Which of the two it was matters, and this page shows both lines so the difference is visible.",
    },
    zh: {
      name: "每股收益同比增速",
      short: "稀释每股收益与去年同一财季的对比。",
      read: "若增速快于收入,原因要么是利润率扩张,要么是股本缩减。两者含义大不相同,本页同时展示这两行,以便你自行判断。",
    },
  },
  fund_operating_cash_flow: {
    en: {
      name: "Operating cash flow",
      short: "Cash actually generated by operations in the period, from the cash-flow statement.",
      read: "Profit is an accounting opinion; cash is a bank balance. When net income climbs while operating cash flow does not, the difference is sitting in receivables or inventory and is worth explaining.",
    },
    zh: {
      name: "经营活动现金流",
      short: "本期经营活动实际产生的现金,取自现金流量表。",
      read: "利润是会计判断,现金是银行余额。若净利润上升而经营现金流没有跟上,差额通常沉淀在应收账款或存货中,值得追问原因。",
    },
  },
  fund_free_cash_flow: {
    en: {
      name: "Free cash flow",
      short: "Operating cash flow minus capital expenditure — cash left after keeping the assets running.",
      read: "Not shown here, and the reason is a feed gap, not a company one: this provider's statement view does not carry a capex line, so FCF cannot be computed without inventing it. It stays Unavailable rather than being approximated by operating cash flow, which would overstate it every time.",
    },
    zh: {
      name: "自由现金流",
      short: "经营现金流减去资本开支 — 维持资产运转后剩余的现金。",
      read: "此处不展示,原因在于数据源缺项而非公司未披露:当前数据源的报表视图不含资本开支科目,若无该项则只能靠编造得出 FCF。因此保持「无法计算」,而不用经营现金流近似替代 — 那样会系统性高估。",
    },
  },
  fund_total_debt: {
    en: {
      name: "Total debt",
      short: "Interest-bearing borrowings on the balance sheet.",
      read: "On this page it is LONG-TERM debt only — the provider's view carries no separate short-term borrowings line, and that caveat is printed next to the number rather than hidden. Real total debt is therefore this figure or higher, never lower.",
    },
    zh: {
      name: "总负债 (有息)",
      short: "资产负债表上的有息借款。",
      read: "本页仅为长期借款 — 当前数据源的视图没有单列短期借款科目,该限定说明会直接标注在数字旁,而不会被隐藏。因此真实有息负债只会等于或高于此数,绝不会更低。",
    },
  },
  fund_net_debt: {
    en: {
      name: "Net debt",
      short: "Total debt minus cash and equivalents.",
      read: "Unavailable here because the cash line is not in the provider's statement view. Treating net debt as equal to gross debt would overstate leverage for any cash-rich company, so the row reports the gap instead.",
    },
    zh: {
      name: "净负债",
      short: "有息负债减去现金及等价物。",
      read: "此处无法计算,因为数据源的报表视图缺少现金科目。若把净负债直接等同于总负债,会高估所有现金充裕公司的杠杆水平,因此该行如实说明缺口。",
    },
  },
  fund_roe: {
    en: {
      name: "Return on equity (TTM)",
      short: "Trailing-twelve-month net income ÷ shareholders' equity.",
      read: "How hard the shareholders' capital worked. Leverage inflates it: a company that buys back stock until equity is tiny can post a spectacular ROE while earning no more than before. Read it with debt-to-equity beside it.",
    },
    zh: {
      name: "净资产收益率 (最近十二个月)",
      short: "最近十二个月净利润 ÷ 股东权益。",
      read: "衡量股东资本的使用效率。杠杆会放大它:一家不断回购、把权益压得很小的公司,即便盈利没有增加,也能报出亮眼的 ROE。请与资产负债率对照阅读。",
    },
  },
  fund_roa: {
    en: {
      name: "Return on assets (TTM)",
      short: "Trailing-twelve-month net income ÷ total assets.",
      read: "The un-levered cousin of ROE — borrowing raises assets as well as profit, so ROA is much harder to flatter with debt. A wide ROE/ROA gap IS the leverage.",
    },
    zh: {
      name: "总资产收益率 (最近十二个月)",
      short: "最近十二个月净利润 ÷ 总资产。",
      read: "ROE 的去杠杆版本 — 举债会同时抬高资产与利润,因此 ROA 更难被债务粉饰。ROE 与 ROA 的差距,本身就是杠杆的体现。",
    },
  },
  fund_current_ratio: {
    en: {
      name: "Current ratio",
      short: "Current assets ÷ current liabilities — near-term bills against near-term resources.",
      read: "Above 1 means the next year's obligations are covered on paper. It says nothing about the QUALITY of those current assets: slow inventory counts the same as cash in this ratio, which is why the quick ratio exists.",
    },
    zh: {
      name: "流动比率",
      short: "流动资产 ÷ 流动负债 — 以短期资源覆盖短期债务的能力。",
      read: "大于 1 表示未来一年的义务在账面上可被覆盖。但它不反映流动资产的「质量」:滞销存货与现金在该比率中权重相同 — 这正是速动比率存在的理由。",
    },
  },
  fund_debt_to_equity: {
    en: {
      name: "Debt to equity",
      short: "Interest-bearing debt ÷ shareholders' equity.",
      read: "The leverage dial. Higher magnifies both directions, and the same ratio means different things across industries — a utility and a software company are not comparable on this line. Computed here from long-term debt only, so it is a floor.",
    },
    zh: {
      name: "债务权益比",
      short: "有息负债 ÷ 股东权益。",
      read: "杠杆刻度盘。数值越高,盈亏两个方向都被放大;且同一数值在不同行业含义迥异 — 公用事业公司与软件公司在这一行上不可比。此处仅按长期借款计算,故为下限值。",
    },
  },
  fund_shares_diluted: {
    en: {
      name: "Diluted shares",
      short: "The weighted-average diluted share count used as the EPS denominator.",
      read: "Watch its direction across quarters. A falling count lifts EPS mechanically; a rising one dilutes existing holders, most often through stock compensation.",
    },
    zh: {
      name: "稀释股本",
      short: "计算每股收益所用的加权平均稀释股数。",
      read: "重点看它逐季的变化方向。股数下降会机械地抬高 EPS;股数上升则稀释现有股东权益,最常见的来源是股权激励。",
    },
  },
  fund_pe_ttm: {
    en: {
      name: "P/E (TTM)",
      short: "Price ÷ trailing-twelve-month diluted EPS.",
      read: "What the market pays today for the last year's earnings. It is undefined when EPS is negative and is reported as such rather than as a huge or a zero number. On this page it is shown against its OWN history, because 'expensive' only means anything relative to something.",
    },
    zh: {
      name: "市盈率 (滚动)",
      short: "股价 ÷ 最近十二个月稀释每股收益。",
      read: "市场为过去一年的盈利支付的价格。当 EPS 为负时该比率无定义,此处会如实说明,而不会显示为极大值或 0。本页将其与该股自身历史区间对照,因为「贵」只有在有参照物时才有意义。",
    },
  },
  fund_ps_ttm: {
    en: {
      name: "P/S (TTM)",
      short: "Market capitalisation ÷ trailing-twelve-month revenue.",
      read: "Usable when earnings are negative or erratic, because revenue rarely is. It ignores margins entirely, so a 5× P/S on a 70%-margin business and on a 5%-margin one are not the same fact.",
    },
    zh: {
      name: "市销率 (滚动)",
      short: "总市值 ÷ 最近十二个月营业收入。",
      read: "当盈利为负或波动剧烈时仍然可用,因为收入通常较稳定。但它完全忽略利润率:70% 毛利率公司的 5 倍市销率,与 5% 毛利率公司的 5 倍,含义完全不同。",
    },
  },
  fund_pb: {
    en: {
      name: "P/B",
      short: "Market capitalisation ÷ shareholders' equity (book value).",
      read: "Most informative where the balance sheet IS the business (banks, insurers). For companies whose value is brands, code or research, book value omits most of the asset base and P/B runs structurally high.",
    },
    zh: {
      name: "市净率",
      short: "总市值 ÷ 股东权益(账面价值)。",
      read: "在资产负债表本身即业务核心的行业(银行、保险)中最有参考价值。若公司价值主要来自品牌、代码或研发,账面价值会漏掉大部分资产基础,市净率会系统性偏高。",
    },
  },
  fund_ev_ebitda: {
    en: {
      name: "EV / EBITDA",
      short: "Enterprise value ÷ earnings before interest, tax, depreciation and amortisation.",
      read: "Unavailable here, and for two independent reasons: enterprise value needs a cash figure, and EBITDA needs depreciation & amortisation — neither is in this provider's statement view. Both gaps are stated rather than patched with an approximation.",
    },
    zh: {
      name: "企业价值倍数 (EV/EBITDA)",
      short: "企业价值 ÷ 息税折旧摊销前利润。",
      read: "此处无法计算,原因有两个且相互独立:企业价值需要现金数据,EBITDA 需要折旧摊销数据,而当前数据源的报表视图两者都没有。这两处缺口会如实标明,不用近似值填补。",
    },
  },
  fund_earnings_yield: {
    en: {
      name: "Earnings yield",
      short: "Trailing EPS ÷ price — the P/E turned upside down.",
      read: "Stated as a percentage, so it sits next to a bond yield on the same scale. It stays meaningful when earnings are negative (the yield simply goes negative) where the P/E does not.",
    },
    zh: {
      name: "盈利收益率",
      short: "滚动每股收益 ÷ 股价 — 即市盈率的倒数。",
      read: "以百分比表示,因此可与债券收益率放在同一量纲上比较。当盈利为负时它依然有意义(收益率为负),而市盈率在该情形下无定义。",
    },
  },
  fund_as_of_acceptance: {
    en: {
      name: "Fundamentals as-of",
      short: "Only filings ACCEPTED by the regulator before the as-of instant are used.",
      read: "The look-ahead gate for fundamentals. The gate is the acceptance timestamp, never the period end date: a quarter that ended on 30 June but was not filed until 1 August was not knowable in July, and using it would make every historical comparison on this page quietly impossible to have traded.",
    },
    zh: {
      name: "基本面计算时点",
      short: "仅使用在该时点之前已被监管机构接收的申报文件。",
      read: "这是基本面的防「未来函数」关卡。判定依据是文件被接收的时间戳,绝非会计期末日期:6 月 30 日结束的季度若到 8 月 1 日才申报,7 月时无人可知;若按期末日期取用,本页所有历史对比都会变成实际上无法交易的结果。",
    },
  },
  fund_own_history_percentile: {
    en: {
      name: "Own-history percentile",
      short: "Where today's multiple sits within this same stock's past multiples.",
      read: "A percentile of ITS OWN history — not of a sector and not of the market. It answers 'expensive versus its own past', which is a different question from 'expensive versus peers'; the peer comparison is a later phase and is marked unavailable rather than approximated. The sample is small, so read it with the count beside it.",
    },
    zh: {
      name: "自身历史分位",
      short: "当前估值倍数在该股自身历史区间中所处的位置。",
      read: "这是相对其自身历史的分位数 — 不是相对行业,也不是相对全市场。它回答的是「相对自己的过去贵不贵」,与「相对同行贵不贵」是两个问题;同业对比属于后续阶段,此处标为不可用而非用近似值代替。样本量较小,请务必结合旁边的样本数一起看。",
    },
  },
  fund_consensus: {
    en: {
      name: "Analyst consensus",
      short: "The estimate the market is measuring the print against — EPS and revenue expectations.",
      read: "NOT AVAILABLE on this platform's data subscription, and that absence is shown as a banner rather than left blank. It matters because an earnings reaction is driven by the surprise versus consensus, not by the absolute number: a record quarter that misses the estimate still sells off. Everything on this tab is therefore the reported figure, with no beat/miss claim attached.",
    },
    zh: {
      name: "分析师一致预期",
      short: "市场用以衡量财报的基准 — 每股收益与收入的预期值。",
      read: "本平台当前数据订阅不包含该数据,因此以横幅显式提示,而非留白。它之所以重要:财报后的股价反应取决于相对预期的「意外」,而非绝对数值 — 创纪录的季度若低于预期,股价照样下跌。故本页所有内容均为已公布的实际数据,不附带任何「超预期/不及预期」的判断。",
    },
  },
  fund_momentum: {
    en: {
      name: "Fundamental momentum",
      short: "A COUNT of how many directional metrics improved versus weakened between the two filings.",
      read: "Arithmetic, not a forecast: the label is derived from the counts printed beside it, and the counts are derived from the table above. It describes the direction of the last two filings and makes no claim about the next one, or about the stock.",
    },
    zh: {
      name: "基本面动能",
      short: "在两期申报之间,方向性指标改善与恶化各有多少项的计数。",
      read: "这是算术结果,不是预测:标签由旁边列出的计数推出,计数又由上方表格推出。它描述的是最近两期申报的变化方向,既不预测下一期,也不预测股价。",
    },
  },
  /* ------------------------------------------------ Phase D news evidence
     The §21-§27 news vocabulary. Same policy as every other section —
     explain the CONCEPT, name what the number cannot tell you — plus two
     duties specific to news: say out loud that the score is a RELEVANCE
     ranking and not a sentiment or a direction, and that article text is
     untrusted input that the platform launders rather than obeys (§81). */
  news_counts: {
    en: {
      name: "Raw / unique / clusters / material / themes",
      short: "The five numbers that replace a bare article count for this window.",
      read: "Read them as a funnel, left to right. RAW is every stored article in the window; UNIQUE drops near-identical copies of the same headline; CLUSTERS group the remaining articles into one story each, so a development syndicated by six outlets counts once; MATERIAL keeps the clusters scoring at or above the cut; THEMES groups those by category. A big gap between raw and clusters means heavy syndication, not heavy news flow — which is exactly the illusion the funnel exists to strip out.",
    },
    zh: {
      name: "原始 / 去重 / 聚合 / 重要 / 主题",
      short: "用以替代「文章总数」这一单一数字的五个计数。",
      read: "应从左至右当作漏斗来读。「原始」是窗口内全部已存储文章;「去重」剔除标题近乎相同的副本;「聚合」把剩余文章按同一事件归为一组,因此被六家媒体转载的同一件事只计一次;「重要」保留评分达到门槛的组;「主题」再按类别归并。原始数与聚合数差距很大,说明转载密集,而非新闻密集 — 这正是该漏斗要剥离的假象。",
    },
  },
  news_cluster: {
    en: {
      name: "Cluster (one story)",
      short: "Articles about the same development, folded into one canonical article plus its members.",
      read: "The canonical is the EARLIEST article of the highest-quality source in the group — who reported it first, not who wrote it best. Members are linked either by a strong headline overlap or by naming the same two entities within 48 hours. Clustering is deliberately imperfect: it is a similarity rule, not an understanding of the news, so a wrongly merged pair is visible by opening the cluster and reading the members rather than hidden behind a count.",
    },
    zh: {
      name: "聚合组(同一事件)",
      short: "报道同一件事的多篇文章,归并为一篇代表文章及其成员文章。",
      read: "代表文章取组内来源质量最高者中「最早」的那篇 — 依据的是谁先报道,而非谁写得好。成员之间的关联,或来自标题高度重合,或来自 48 小时内提及相同的两个实体。聚合刻意保持「可检验的不完美」:它是相似度规则,而非对新闻的真正理解,因此若有误合并,可展开该组逐条阅读成员文章看出,而不会被一个计数掩盖。",
    },
  },
  news_evidence_score: {
    en: {
      name: "Evidence score",
      short: "relevance × materiality × novelty × source quality × time decay — the product of five factors, each shown.",
      read: "A RANKING of how much attention a story deserves, and explicitly NOT a direction: it says nothing about whether the news is good or bad for the stock, and there is no sentiment anywhere in it. Because it is a product, any single weak factor drags the whole score down — a major headline from three weeks ago scores low on decay alone. Every factor travels with the number, so the arithmetic is checkable by hand; a score you cannot reproduce from its own components is a bug, not a judgement.",
    },
    zh: {
      name: "证据评分",
      short: "相关性 × 重要度 × 新颖度 × 来源质量 × 时间衰减 — 五个因子的乘积,且逐项展示。",
      read: "它衡量的是「一条消息值得多少注意力」的排序,明确不代表方向:它不判断消息对股价是利好还是利空,整个体系中没有任何情绪判断。由于是乘积,任一因子偏弱都会拉低总分 — 三周前的重大新闻,仅凭时间衰减一项就得分很低。每个因子都随分数一并给出,因此可以手工复核;若某个分数无法由其自身因子还原,那是缺陷,而非判断。",
    },
  },
  news_relevance: {
    en: {
      name: "Relevance (factor)",
      short: "How centrally this ticker figures in the article: tagged or in the headline 1.0, body mention only 0.7.",
      read: "Ternary on purpose. A ticker named in the headline or tagged by the provider is what the story is ABOUT; a ticker appearing only in the body is usually a comparison or a list. An article that never names the ticker is EXCLUDED entirely rather than scored near zero — a tiny non-zero relevance would let a large volume of unrelated coverage accumulate into an apparent signal.",
    },
    zh: {
      name: "相关性(因子)",
      short: "该标的在文章中的核心程度:被标注或出现在标题中为 1.0,仅出现在正文中为 0.7。",
      read: "刻意采用三档取值。出现在标题中或被数据源标注的标的,才是文章真正「讲的对象」;仅出现在正文中的,通常只是对比或名单的一部分。完全未提及该标的的文章会被「整体排除」,而不是给一个接近零的分值 — 若保留极小的非零相关性,大量无关报道累积起来会伪装成信号。",
    },
  },
  news_materiality: {
    en: {
      name: "Materiality (factor)",
      short: "A category weight — how much this KIND of development typically moves a stock. Guidance 0.9, industry colour 0.3.",
      read: "Materiality is not sentiment and not certainty. \"Guidance cut\" and \"guidance raised\" are both GUIDANCE at 0.9, because the category describes what the news is about, not which way it points. The category is assigned by a term lexicon, and the terms that matched travel with it — so a category with no visible evidence behind it can be spotted and disbelieved rather than taken on faith.",
    },
    zh: {
      name: "重要度(因子)",
      short: "类别权重 — 这「一类」进展通常对股价的影响程度。业绩指引 0.9,行业动态 0.3。",
      read: "重要度既非情绪判断,也非确定性判断。「下调指引」与「上调指引」同属 GUIDANCE 类,权重都是 0.9,因为类别描述的是「这是什么事」,而非「朝哪个方向」。类别由词表匹配得出,且命中的词条随结果一并给出 — 因此若某个类别背后没有可见证据,可以被识别并质疑,而不必盲目采信。",
    },
  },
  news_novelty: {
    en: {
      name: "Novelty (factor)",
      short: "1 minus how much this story's headline overlaps the stories that came BEFORE it in the window.",
      read: "The first story in a window is fully novel by construction (1.0). A follow-up rehashing the same headline scores low even when the category is heavyweight — the point is to stop one development from being counted five times as it is re-reported. Novelty is measured against earlier clusters only, so it changes as the window's start moves; it is a property of this window, not of the news itself.",
    },
    zh: {
      name: "新颖度(因子)",
      short: "1 减去该消息标题与窗口内「更早」消息的重合程度。",
      read: "窗口内第一条消息按定义完全新颖(1.0)。后续对同一标题的翻炒,即便类别权重很高,得分也会很低 — 目的是防止同一件事在被反复转述时被计算五次。新颖度只对更早的聚合组衡量,因此窗口起点变动时它也会变;它是「该窗口」的属性,而非新闻本身的属性。",
    },
  },
  news_source_quality: {
    en: {
      name: "Source quality (factor)",
      short: "A per-publisher weight: wire services and company filings 1.0, mid-tier outlets 0.8, aggregators and commentary 0.5.",
      read: "A weight on RELIABILITY OF REPORTING, not on how interesting the writing is. An unrecognised publisher is treated as mid (0.5) rather than zero — unknown is not the same as untrustworthy, and zeroing it would silently delete a real story. The table is a plain substring mapping and is meant to be extended; it encodes a judgement about outlets, and you should disagree with it where your own experience differs.",
    },
    zh: {
      name: "来源质量(因子)",
      short: "按发布方赋权:通讯社与公司公告 1.0,中档媒体 0.8,聚合与评论类 0.5。",
      read: "衡量的是「报道的可靠程度」,而非文章是否好看。未识别的发布方按中档(0.5)处理,而非零 — 「未知」不等于「不可信」,若归零则会悄悄抹掉一条真实消息。该表是简单的子串映射,本就设计为可扩展;它编码的是对各家媒体的判断,若与你的经验不符,你完全可以不认同。",
    },
  },
  news_decay: {
    en: {
      name: "Time decay (factor)",
      short: "Halves every 14 days relative to the as-of instant, with a floor of 0.2.",
      read: "Old news is still news, and that is why the decay has a FLOOR rather than reaching zero: a month-old article that is the only evidence for a development should rank last, not disappear. The half-life is a research parameter about how quickly the market absorbs a story, not a measured constant — it is one of the numbers to change first if the ranking feels wrong for your holding period.",
    },
    zh: {
      name: "时间衰减(因子)",
      short: "相对计算时点,每 14 天减半,并设有 0.2 的下限。",
      read: "旧消息仍然是消息 — 这正是衰减设有「下限」而非归零的原因:一个月前的文章若是某项进展的唯一证据,应当排在最后,而不是消失。半衰期是关于「市场吸收一条消息有多快」的研究参数,而非实测常数 — 若排序与你的持仓周期不符,它是最该优先调整的参数之一。",
    },
  },
  news_theme: {
    en: {
      name: "Key theme",
      short: "Material stories grouped by materiality category, labelled with the category plus its two most salient terms.",
      read: "A theme with four developments means four DISTINCT clustered stories in that category, not four articles. Themes are a grouping of what was published, not an explanation of it: the platform has not reasoned about whether the developments reinforce or contradict each other, and stacking four of them does not make any of them more likely to matter.",
    },
    zh: {
      name: "关键主题",
      short: "按重要度类别归并的重要消息,标签为类别加该类别下最显著的两个词条。",
      read: "某主题下有 4 项进展,指的是该类别下有 4 个「彼此不同」的聚合事件,而非 4 篇文章。主题只是对「已发布内容」的归并,而非对其含义的解释:平台并未判断这些进展彼此是印证还是矛盾,数量堆到 4 项也不会让其中任何一项更可能产生影响。",
    },
  },
  news_window: {
    en: {
      name: "News window",
      short: "The span of time the analysis covers: from just before the previous comparable event up to the as-of instant.",
      read: "The window is anchored on the LAST comparable event so the question it answers is \"what has happened since we last heard from this company\" rather than \"what is in the last N days\". Its start comes from the payload's own basis line — when no previous event is linked the server falls back to a fixed lookback and says so. Everything on the tab is scoped to this window, so counts from two events with different windows are not comparable.",
    },
    zh: {
      name: "新闻窗口",
      short: "分析所覆盖的时间跨度:自上一次可比事件前夕起,至计算时点为止。",
      read: "窗口以「上一次可比事件」为锚点,因此它回答的是「自上次该公司发声以来发生了什么」,而非「最近 N 天有什么」。窗口起点取自返回数据自身的依据说明 — 若未关联到上一次事件,服务端会退回固定回溯期并明确标注。本页所有内容都以该窗口为范围,因此两个窗口不同的事件之间,计数不可直接比较。",
    },
  },
  news_as_of: {
    en: {
      name: "As-of (news)",
      short: "The look-ahead gate, applied to publication time: an article published after this instant is excluded.",
      read: "This is what makes a past as-of honest. Reading an event with as-of set to the day before it happened shows the story as it actually stood then — without the post-event coverage that explains the move, which is the single easiest way to fool yourself into thinking a catalyst was readable in advance. Excluded articles are counted, not silently dropped, so you can see how much the gate removed.",
    },
    zh: {
      name: "计算时点(新闻)",
      short: "防未来函数的关卡,作用于发布时间:发布时间晚于该时刻的文章会被排除。",
      read: "这正是「回溯到过去某一时点」得以诚实的原因。把计算时点设为事件发生前一天来查看,呈现的是当时真实可见的信息 — 不含事后解释行情的报道,而后者是最容易让人误以为「当初本可预见该催化剂」的因素。被排除的文章会被计数,而非悄悄丢弃,因此你能看到关卡究竟滤掉了多少。",
    },
  },
  news_backfill: {
    en: {
      name: "Fetch news for this window",
      short: "Fetches this event's news window from every configured provider and stores it. Only when you ask.",
      read: "The tab reads STORED articles and never fetches on load, so scrolling through events costs nothing. Pressing this asks each configured provider for the window and writes what is new. It is throttled per ticker, so a second press within the throttle answers \"already fetched recently\" rather than spending a call — that is a state with a reason, not a failure, and an empty window afterwards means the providers served nothing for it.",
    },
    zh: {
      name: "抓取该窗口的新闻",
      short: "向所有已配置的数据源抓取该事件窗口的新闻并存储。仅在你主动点击时执行。",
      read: "本页读取的是「已存储」的文章,加载时绝不抓取,因此浏览事件不产生任何调用成本。点击此按钮会向每个已配置数据源请求该窗口,并写入新增内容。它按标的做了节流,因此节流期内的第二次点击会返回「近期已抓取」而不再消耗调用 — 这是带原因的状态,而非失败;若抓取后窗口仍为空,则说明数据源对该窗口确实没有内容。",
    },
  },
  news_untrusted_text: {
    en: {
      name: "Untrusted article text (§81)",
      short: "Article headlines and summaries are third-party input: laundered before any model sees them, and never executed as instructions.",
      read: "A news feed is text written by strangers, and some of it is written to be read by machines. Before any of it reaches a language model the platform strips markup, control characters and URLs, caps the length, and FLAGS lines shaped like instructions (\"ignore previous instructions…\"). A flagged article is still shown to you in full — the flag warns the reader and blocks the model, it does not censor the news.",
    },
    zh: {
      name: "不可信的文章文本 (§81)",
      short: "文章标题与摘要属第三方输入:交给模型前先做净化处理,且绝不作为指令执行。",
      read: "新闻源是陌生人撰写的文本,其中部分内容本就是写给机器看的。在这些文本进入语言模型之前,平台会剥离标记语言、控制字符与链接,限制长度,并「标记」出形如指令的语句(如「忽略此前的指令……」)。被标记的文章仍会完整展示给你 — 标记的作用是提醒读者、拦截模型,而不是屏蔽新闻。",
    },
  },
};
