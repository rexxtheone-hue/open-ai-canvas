## yingce.payment/v1

支持 `validate_config`、`create_order`、`query_order`、`close_order`、`verify_notification`、`manage_subscription` 和 `download_trade_bill`，统一返回 JSON 响应。

- 下单：`POST /v1/checkout/sessions`（mode=payment），`client_reference_id` 和 PaymentIntent metadata 都写入商户订单号，`Idempotency-Key` 为 `create:<商户订单号>`。收银台有效期与订单关闭时间一致，限制在 30 分钟到 24 小时之间。请求带 `Interval`（month 或 year）时改用 mode=subscription，`subscription_data[metadata]` 写入商户订单号，价格带 `recurring[interval]`，支付方式只用 card。
- 查单：`GET /v1/payment_intents/search`，按 `metadata['merchant_order_no']` 查找；`succeeded` 视为已支付，`canceled` 视为已关闭，其余为未支付。找不到支付意图时按同样的 metadata 搜索订阅（`GET /v1/subscriptions/search`），首期账单（billing_reason=subscription_create）已支付即视为已支付，交易号为账单号。
- 关单：在打开的收银台中找到该订单并调用 `POST /v1/checkout/sessions/{id}/expire`，之后再查一次单；已付款时返回已支付，付款处理中时稍后重试。
- 通知：校验 `Stripe-Signature`（HMAC-SHA256，时间容差 5 分钟）。`checkout.session.completed` 且 `payment_status=paid`、`checkout.session.async_payment_succeeded` 视为已支付；`checkout.session.expired`、`checkout.session.async_payment_failed` 视为已关闭；FPX 等异步付款的 `completed`（unpaid）只记录状态，不入账。订阅收银台的交易号为首期账单号。`invoice.paid` 的 subscription_create 账单视为首期已支付，subscription_cycle 账单返回 `renewal=true`（宿主据此生成续费订单），其他账单只记录。`customer.subscription.updated/deleted` 返回 `subscriptionStatus`（active / canceling / ended）。
- 自动续费：`manage_subscription` 的 `cancel_at_period_end`、`resume` 调用 `POST /v1/subscriptions/{id}` 设置 `cancel_at_period_end`，`cancel_now` 调用 `DELETE /v1/subscriptions/{id}`。
- 对账账单：不提供，返回 not found，请在 Stripe 后台导出 Balance 报表。

配置字段：`publicBaseUrl`、`secretKey`、`webhookSecret`、`currency`、`paymentMethods`。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v1",
  "id": "official-payment-stripe",
  "name": "Stripe（银行卡 / FPX）",
  "version": "1.1.0",
  "author": "Stripe",
  "description": "Stripe Checkout 充值适配器，支持国际银行卡和马来西亚 FPX 网银，按配置的币种结算；会员商品支持银行卡自动续费。",
  "enabled": true,
  "installable": true,
  "runtime": {
    "backend": "rpc",
    "backendEntry": "backend/provider"
  },
  "surfaces": [
    "wallet",
    "settings"
  ],
  "permissions": [
    "payment.create",
    "payment.query",
    "payment.close",
    "payment.reconcile"
  ],
  "configuration": {
    "fields": [
      {
        "name": "publicBaseUrl",
        "type": "url",
        "label": "服务器公网地址",
        "required": true,
        "description": "用于生成付款完成后的返回地址和 Webhook 地址，必须是 https 并能被 Stripe 访问。"
      },
      {
        "name": "secretKey",
        "type": "password",
        "label": "Stripe Secret key",
        "required": true,
        "secret": true,
        "description": "Stripe 后台 Developers → API keys 的 Secret key（sk_live_ 或 sk_test_ 开头），也可以用只开放 Checkout Sessions 和 PaymentIntents 的 Restricted key（rk_ 开头）。"
      },
      {
        "name": "webhookSecret",
        "type": "password",
        "label": "Webhook signing secret",
        "required": true,
        "secret": true,
        "description": "在 Stripe 后台添加 Webhook 后得到的 Signing secret（whsec_ 开头）。"
      },
      {
        "name": "currency",
        "type": "string",
        "label": "结算币种",
        "required": true,
        "default": "MYR",
        "values": [
          "MYR",
          "USD",
          "SGD",
          "HKD",
          "EUR",
          "GBP",
          "AUD",
          "CNY"
        ],
        "description": "钱包只展示同币种的充值商品。已有订单后不能再修改。"
      },
      {
        "name": "paymentMethods",
        "type": "string",
        "label": "支付方式",
        "required": false,
        "default": "card,fpx",
        "description": "逗号分隔，例如 card,fpx 或 card,fpx,grabpay。FPX 只支持 MYR；需要先在 Stripe 后台开通对应支付方式。"
      }
    ]
  },
  "contributes": {
    "paymentProviders": [
      {
        "id": "stripe-checkout",
        "label": "Stripe（银行卡 / FPX）",
        "icon": "assets/icon.svg",
        "checkoutMode": "redirect",
        "identityFields": [
          "currency"
        ],
        "expiryPolicy": {
          "defaultMinutes": 60,
          "minMinutes": 30,
          "maxMinutes": 1440
        },
        "notificationSuccess": {
          "status": 200,
          "contentType": "application/json",
          "body": "{\"received\":true}"
        },
        "notificationFailure": {
          "status": 400,
          "contentType": "application/json",
          "body": "{\"received\":false}"
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
