# Stripe（银行卡 / FPX）

官方 `yingce.payment/v1` 支付插件，使用 Stripe Checkout 收款。用户点充值后跳转到 Stripe 收银台，可以用国际银行卡或马来西亚 FPX 网银付款，付款完成后自动回到网站并入账。

## 开通步骤

1. 在 Stripe 后台 Settings → Payment methods 里开通要用的支付方式（FPX 需要马来西亚账号，只能用 MYR 结算）。
2. Developers → API keys 复制 Secret key，填到插件配置的 `secretKey`。
3. Developers → Webhooks → Add endpoint：
   - Endpoint URL 填 `https://你的域名/api/payments/notify/stripe-checkout/<配置 ID>`。配置 ID 在后台「支付渠道」保存配置后显示；以后每次保存配置都会生成新的配置 ID，要同步更新这里的地址。
   - Events 只勾选 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`。
   - 保存后复制 Signing secret，填到 `webhookSecret`。
4. 在后台「充值商品」里新建商品时把币种选成和渠道一致（例如 MYR）。钱包只展示同币种的商品。

Webhook 只是加速：即使 Webhook 没配好，宿主每 15 秒会按订单号查一次 Stripe，付款后最多约 1 分钟入账。
