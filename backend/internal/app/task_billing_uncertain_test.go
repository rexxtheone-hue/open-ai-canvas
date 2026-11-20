package app

import (
	"errors"
	"testing"
)

func TestBillingFailureUncertainIgnoresTimeoutFalse(t *testing.T) {
	if billingFailureUncertain(errors.New("vendor attempt failed (vendor=volcengine_ark, model=wand-vega-video-1.5-pro, status=400, timeout=false)")) {
		t.Fatal("timeout=false is a definite upstream rejection")
	}
	if !billingFailureUncertain(errors.New("vendor attempt failed (vendor=x, status=504, timeout=true)")) {
		t.Fatal("timeout=true stays uncertain")
	}
	if !billingFailureUncertain(errors.New("context deadline exceeded")) {
		t.Fatal("deadline exceeded stays uncertain")
	}
}
