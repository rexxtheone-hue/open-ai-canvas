package repository

import (
	"errors"
	"math/big"

	"yingce/backend/internal/model"
)

// 代理商批发计费的金额换算。全部用整数（microcredits、sen）计算，中间值用 big.Int 防溢出。
//
// 取整规则：
//   - 充值积分 = sen × 10^9 / 773，向下取整（RM / 0.773 × 100 积分，不多给）。
//   - 池扣减 = 平台积分 × (100 − 折扣) / 85，向上取整到 1 microcredit。
//   - 月费换算成积分 = 月费 sen × 10^9 / 773，向上取整。
//   - 用量折合 RM（sen） = microcredits × 773 / 10^9，四舍五入到 1 sen；月费在精确值上算，最后四舍五入到 1 sen。

const (
	MonthlyMinimumUsageSen int64 = 500_000 // RM 5,000
	MonthlyFeeCapSen       int64 = 150_000 // RM 1,500
	MonthlyFeeRatePercent  int64 = 30
	FirstTopupWarningSen   int64 = 500_000
)

var errTenantAmountOverflow = errors.New("代理商计费金额超出范围")

var bigBillion = big.NewInt(1_000_000_000)

func bigToInt64(value *big.Int) (int64, error) {
	if !value.IsInt64() {
		return 0, errTenantAmountOverflow
	}
	return value.Int64(), nil
}

// MulDivCeil 返回 ceil(a × b / c)，a、b ≥ 0，c > 0。
func MulDivCeil(a, b, c int64) (int64, error) {
	if c <= 0 || a < 0 || b < 0 {
		return 0, errors.New("计费换算参数无效")
	}
	product := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
	product.Add(product, big.NewInt(c-1))
	return bigToInt64(product.Quo(product, big.NewInt(c)))
}

// ValidAgencyDiscount 只允许 15/25/30/40。
func ValidAgencyDiscount(percent int) bool {
	return percent == 15 || percent == 25 || percent == 30 || percent == 40
}

// WholesaleMicrocredits 是平台积分对应的批发池扣减：15% 折扣时与平台积分相同。
func WholesaleMicrocredits(platform int64, discountPercent int) (int64, error) {
	if platform <= 0 {
		return 0, nil
	}
	if !ValidAgencyDiscount(discountPercent) {
		discountPercent = model.AgencyDefaultDiscountPercent
	}
	return MulDivCeil(platform, int64(100-discountPercent), 85)
}

// TopupMicrocredits 把银行转账金额（sen）换成批发积分。
func TopupMicrocredits(sen int64) (int64, error) {
	if sen <= 0 {
		return 0, errors.New("充值金额必须大于 0")
	}
	value := new(big.Int).Mul(big.NewInt(sen), bigBillion)
	return bigToInt64(value.Quo(value, big.NewInt(model.AgencyWholesaleMilliRMPer100Credits)))
}

// FeeMicrocredits 把月费（sen）换成批发积分。
func FeeMicrocredits(sen int64) (int64, error) {
	if sen <= 0 {
		return 0, nil
	}
	return MulDivCeil(sen, 1_000_000_000, model.AgencyWholesaleMilliRMPer100Credits)
}

// UsageSen 把批发积分折合成 sen（四舍五入）。
func UsageSen(microcredits int64) int64 {
	if microcredits <= 0 {
		return 0
	}
	value := new(big.Int).Mul(big.NewInt(microcredits), big.NewInt(model.AgencyWholesaleMilliRMPer100Credits))
	value.Add(value, big.NewInt(500_000_000))
	result, err := bigToInt64(value.Quo(value, bigBillion))
	if err != nil {
		return int64(^uint64(0) >> 1)
	}
	return result
}

// MonthlyFeeSen = min(RM 1,500, max(0, RM 5,000 − 用量) × 30%)，用量为上月已结算的批发池扣减。
func MonthlyFeeSen(usageMicrocredits int64) int64 {
	// 以 10^-9 sen 为单位精确计算缺口。
	shortfall := new(big.Int).Mul(big.NewInt(MonthlyMinimumUsageSen), bigBillion)
	if usageMicrocredits > 0 {
		shortfall.Sub(shortfall, new(big.Int).Mul(big.NewInt(usageMicrocredits), big.NewInt(model.AgencyWholesaleMilliRMPer100Credits)))
	}
	if shortfall.Sign() <= 0 {
		return 0
	}
	fee := shortfall.Mul(shortfall, big.NewInt(MonthlyFeeRatePercent))
	unit := new(big.Int).Mul(bigBillion, big.NewInt(100))
	fee.Add(fee, new(big.Int).Quo(unit, big.NewInt(2)))
	fee.Quo(fee, unit)
	if fee.Cmp(big.NewInt(MonthlyFeeCapSen)) > 0 {
		return MonthlyFeeCapSen
	}
	return fee.Int64()
}
