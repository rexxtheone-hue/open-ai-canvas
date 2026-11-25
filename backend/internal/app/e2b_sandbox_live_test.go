package app

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// 真连 E2B 的测试：只有设了 E2B_LIVE_TEST=1 和 E2B_API_KEY 才跑。
func TestE2BSandboxLive(t *testing.T) {
	if os.Getenv("E2B_LIVE_TEST") != "1" {
		t.Skip("E2B_LIVE_TEST not set")
	}
	client, err := newE2BClient()
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	sbx, err := client.create(ctx, map[string]string{"test": "1"})
	if err != nil {
		t.Fatal(err)
	}
	defer client.kill(ctx, sbx.ID)
	res, err := sbx.exec(ctx, "echo hello; echo oops >&2; python3 /opt/workflows/drama-ads/scripts/stems.py check; exit 3", 60*time.Second, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(res.Stdout, "hello") || !strings.Contains(res.Stdout, "demucs") || !strings.Contains(res.Stderr, "oops") || res.ExitCode != 3 {
		t.Fatalf("exec = %+v", res)
	}
	if err := sbx.writeFile(ctx, "/home/user/films/a.txt", []byte("中文 ok")); err != nil {
		t.Fatal(err)
	}
	data, err := sbx.readFile(ctx, "/home/user/films/a.txt", 1<<20)
	if err != nil || string(data) != "中文 ok" {
		t.Fatalf("read = %q %v", data, err)
	}
	slow, err := sbx.exec(ctx, "sleep 5; echo late", 2*time.Second, nil)
	if err != nil || !slow.TimedOut {
		t.Fatalf("timeout = %+v %v", slow, err)
	}
	again, ok, err := client.connect(ctx, sbx.ID)
	if err != nil || !ok {
		t.Fatalf("connect = %v %v", ok, err)
	}
	if res, err := again.exec(ctx, "cat /home/user/films/a.txt", 30*time.Second, nil); err != nil || res.Stdout != "中文 ok" {
		t.Fatalf("after connect = %+v %v", res, err)
	}
}
