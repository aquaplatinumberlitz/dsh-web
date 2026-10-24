# Agent Note: Spend display currency on a CNY ledger

Status: implemented

## 问题

`dsh-usage` 按 DeepSeek 公布的 CNY 价目表为官方家族计价（`src/core/pricing.ts`），因此折叠进台账的每个 `cost` 都是 CNY 金额，而所有消费面都以硬编码的 `¥` 渲染这个金额：侧栏速览卡头条、用量页签的当日行与 provider 行、Token 银行的实测与估算消费行。

由此产生两个问题。其一，provider 以其他币种计费的账号会在同一张卡里读到两种货币——余额行按端点返回的币种渲染：DeepSeek 国际站账号返回 `{"currency":"USD","totalBalance":"5.67"}`，于是卡片同时显示 `¥31.44` 的消费与 `$5.67` 的余额，二者对比只能靠用户手工换算。其二，插件根本没有显示其他币种的手段：Config schema 只有 `enabled`、`pollIntervalSec`、`retainDays` 三项。

## 决策

- **台账保持 CNY。** `cost` 沿用价目表的单位，因此没有迁移、重折叠或设置写入会改动已记录的一天。切换显示货币或修正汇率，都是纯粹的渲染期换算。
- **换算只有一个家。** 新增 `src/core/currency.ts` 拥有设置词汇与格式化：`UsageCurrency = 'CNY' | 'USD'`、`USAGE_CURRENCIES`、`DEFAULT_CURRENCY = 'CNY'`、`DEFAULT_USD_RATE = 6.67`（2026-10-23 参考中间价）、允许的 `1`-`20` 汇率区间、`resolveCurrency` / `resolveUsdRate` 的回落、`convertSpend` 与 `formatSpend(costCny, display)`。两个 program 都编译 `src/core/`，因此速览卡、设置分区以及后续任何消费面都经同一个函数格式化，而不是各自拼符号。
- **两个 Config 字段，由客户端读取。** `currency: z.union([...USAGE_CURRENCIES]).default('CNY').volatile()` 与 `usdRate: z.number().min(1).max(20).default(6.67).volatile()`，各带一条 Host 设置页会展示的说明。宿主半区接受但忽略它们；客户端半区是唯一的读取方，因为由它决定已存金额如何渲染。分区的自带设置行在既有控件旁增加货币下拉框与汇率输入框，因此卡片与 Host 设置页都能到达该选择。
- **按币种定精度。** CNY 保持台账的两位小数，与既有行为一致。USD 在 1 美元以上用两位、以下用四位：没有这条规则时，轻量一天的几分钱会被舍入成 `$0.00`，这不是假想——报告账号上 1,679 次调用约合 $4.71，该日十分之一的用量在统一 `toFixed(2)` 下就读作零。
- **余额不做换算。** `formatBalance` 继续渲染端点报告的币种（国内 Moonshot 账号为 `CNY`、国际账号为 `USD`），其他情况回落为 ISO 代码。该设置只描述消费估算。
- **文案键。** `usage.config.currency` 与 `usage.config.usdRate` 进入 zh 字典（键源）、en 镜像与中央 ru 语言包。`usage.bank.spend.observed` / `usage.bank.spend.estimated` 去掉字面量 `¥`，改为在 `{cost}` 中接收已格式化的金额，于是符号跟随设置，而不是由各语言译文各自复述。

## 备选方案

- **自动跟随 provider 余额的币种**（把 `currency: 'follow'` 作为唯一模式）。它不需要汇率设置，对报告账号也刚好正确；但没有余额端点的 provider——中转路由或订阅套餐——无从提供币种，用户也无法选择与端点不一致的货币。手动选择器覆盖两种情况；`follow` 之后仍可作为第三种选项加入。
- **在折叠时换算并存入显示金额。** 否决理由与价目表是随包快照相同：把某次汇率烘进历史后，后来的汇率修正要么无法生效，要么静默改写用户已经读过的那几天。
- **运行时抓取汇率。** 否决：给一条本地渲染路径加上出站网络依赖与无界失败模式，而[价目表笔记](../bug-fix/2026-09-10-deepseek-v41-flash-price-book.md)已经以同样的理由拒绝了运行时抓取价目表。手动汇率加随包默认值让消费行保持离线，并让测试保持确定性。
- **保留硬编码 `¥`，用文档说明换算。** 否决：混币正是报告指出的问题，而一段 README 无法在这张「就是为回答该问题而生」的卡片里回答「今天花掉了我余额的多少」。
- **两种币种一律两位小数。** 否决：实现最简单，但会把每个不足 1 美元的 USD 日舍成 `$0.00`，恰好在用户最常查看的轻量用量上让头条看起来是坏的。

## 后果

- 选择 USD 的用户在消费估算出现的每一处都看到一个换算后的数字；余额行保留自身单位，卡片不再把未换算的估算与报告的余额并置。
- 汇率是手动的，插件从不刷新它，因此长期不更新的汇率会与市场价偏离；README 的已知限制一节写明了这一点。
- `currency` 与 `usdRate` 都是实时（`volatile()`）设置，改动会重绘卡片与分区，无需重载插件行。
- 台账存储格式不变：没有版本号提升，降级回 0.4.8 仍能读取本构建写出的每个文件。

## 测试

`packages/dsh-usage/tests/currency.spec.ts` 固定了 CNY 直通（`31.444756` 读作 `¥31.44`）、按配置汇率换算的 USD（同一金额在 `6.67` 下读作 `$4.71`）、不足 1 美元时的四位小数规则（`$0.0750`）、未知货币与越界或非数字汇率的回落，以及区间辅助函数。`foot-card.spec.tsx` 在 USD 表单下渲染卡片，同时断言换算后的头条与未被改动的 CNY 余额行；`section-card.spec.tsx` 以 USD 渲染 Token 银行的消费行，并驱动新增的设置控件，断言精确的表单写入。包内测试套件（196 项）、`pnpm typecheck`、`pnpm test:standards`、`pnpm docs:check`、`pnpm i18n:check` 与 `pnpm libs:check` 均通过；`pnpm build` 之后重新记录了 `scripts/lib-artifact-fingerprints.json` 中聚合包的源指纹。
