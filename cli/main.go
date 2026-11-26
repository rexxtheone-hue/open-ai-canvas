package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"
)

var version = "dev"

const usage = `OmniMuse CLI: generate AI images and videos with your OmniMuse credits.

Usage:
  omnimuse login [--key <api-key>] [--host <url>]   Log in (opens your browser; --key for servers/CI)
  omnimuse logout                                     Remove saved credentials
  omnimuse whoami                                     Show account and credit balance
  omnimuse models [image|video]                       List models with prices and options
  omnimuse image "<prompt>" [flags]                   Generate images
  omnimuse video "<prompt>" [flags]                   Generate a video
  omnimuse status <id> [--wait] [-o dir]              Check a generation (and download it)
  omnimuse list [image|video] [-n 20]                 Recent generations
  omnimuse cancel <id>                                Cancel a running generation
  omnimuse assets [image|video|audio|character] [-q name]   Find files in your library (use the id as a reference)
  omnimuse edit <operation> <source> "<prompt>" [flags]     Edit a video (see Edit operations below)
  omnimuse batch <file.csv|file.jsonl> [-o dir] [-y]        Generate many images or videos from a file
  omnimuse version

Generation flags:
  -m, --model <id|name>    Model (see: omnimuse models). Default: first available model
  -r, --ratio <ratio>      Aspect ratio, e.g. 16:9, 9:16, 1:1
      --res <resolution>   Resolution, e.g. 2k, 4k (images) or 720p, 1080p (video)
  -q, --quality <tier>     Image quality tier, when the model supports it
  -d, --duration <sec>     Video length in seconds
      --no-audio           Make a silent video (sound is on by default when the model supports it)
  -i, --ref <file|url>     Reference image, video or audio (repeatable). Local files are uploaded
      --first <file|url>   First frame image (video)
      --last <file|url>    Last frame image (video)
  -n, --count <1-4>        Number of outputs (each is charged)
  -o, --out <dir>          Download results to this folder (default: current folder)
      --no-wait            Submit and return the id without waiting
      --no-download        Wait but do not download files
      --estimate           Only show the credit cost, do not generate
  -y, --yes                Skip the cost confirmation
      --json               Print JSON (for scripts and AI agents)

References (-i, --first, --last, edit source) can be a local file (uploaded), an https URL,
or an asset id from "omnimuse assets" or a previous generation.

Edit operations (the source goes first; add more files with -i):
  edit       <video>  "what to change"          Change something in a video by text
  replace    <video>  -i <image> "..."          Swap a person or object for the image
  style      <video>  "watercolor style"        Restyle a video
  camera     <video>  "slow orbit"              Change the camera movement
  extend     <video>  "what happens next"       Continue a video
  lipsync    <image|video> -i <audio>           Make the person speak the audio
  motion     <image>  -i <motion video>         Make the character copy the motion
  Example: omnimuse edit replace clip.mp4 -i product.png "replace the bottle with this product"

Batch file: one generation per CSV row or JSONL line. Columns / keys:
  kind (image|video), prompt, model, ratio, res, quality, duration, audio (true|false),
  ref (several separated by |), first, last, count, op
  Every row is quoted first and the total is confirmed once before anything starts.

Environment: OMNIMUSE_API_KEY, OMNIMUSE_HOST, OMNIMUSE_CONFIG
`

type account struct {
	Username         string  `json:"username"`
	DisplayName      string  `json:"displayName"`
	Email            string  `json:"email"`
	AvailableCredits float64 `json:"availableCredits"`
	ReservedCredits  float64 `json:"reservedCredits"`
	StudioURL        string  `json:"studioUrl"`
}

type modelInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Price  string `json:"price"`
	Prices []struct {
		Unit    string  `json:"unit"`
		Credits float64 `json:"credits"`
	} `json:"prices"`
	AspectRatios       []string `json:"aspectRatios"`
	Resolutions        []string `json:"resolutions"`
	Durations          []int    `json:"durations"`
	MinDuration        int      `json:"minDuration"`
	MaxDuration        int      `json:"maxDuration"`
	MaxReferenceImages int      `json:"maxReferenceImages"`
	Operations         []string `json:"operations"`
}

type output struct {
	Type     string `json:"type"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

type generation struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Status    string    `json:"status"`
	Stage     string    `json:"stage"`
	Progress  int       `json:"progress"`
	Model     string    `json:"model"`
	Prompt    string    `json:"prompt"`
	Error     string    `json:"error"`
	Credits   float64   `json:"credits"`
	Outputs   []output  `json:"outputs"`
	CreatedAt time.Time `json:"createdAt"`
	Files     []string  `json:"files,omitempty"`
}

type reference struct {
	ResourceID string `json:"resourceId,omitempty"`
	URL        string `json:"url,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Role       string `json:"role,omitempty"`
}

type generationRequest struct {
	Model         string      `json:"model"`
	Prompt        string      `json:"prompt"`
	AspectRatio   string      `json:"aspectRatio,omitempty"`
	Resolution    string      `json:"resolution,omitempty"`
	Quality       string      `json:"quality,omitempty"`
	Duration      int         `json:"duration,omitempty"`
	GenerateAudio *bool       `json:"generateAudio,omitempty"`
	References    []reference `json:"references,omitempty"`
	Count         int         `json:"count,omitempty"`
	Operation     string      `json:"operation,omitempty"`
}

type stringList []string

func (s *stringList) String() string     { return strings.Join(*s, ",") }
func (s *stringList) Set(v string) error { *s = append(*s, v); return nil }

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

// parseInterspersed 让参数可以写在提示词前后，例如 omnimuse image "a cat" -r 16:9。
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		rest := fs.Args()
		if len(rest) == 0 {
			return positional, nil
		}
		positional = append(positional, rest[0])
		args = rest[1:]
	}
}

func run(args []string) error {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Print(usage)
		return nil
	}
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	command, rest := args[0], args[1:]
	switch command {
	case "version", "--version", "-v":
		fmt.Println("omnimuse", version)
		return nil
	case "login":
		return cmdLogin(cfg, rest)
	case "logout":
		path, err := configPath()
		if err != nil {
			return err
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		fmt.Println("Logged out.")
		return nil
	}
	c := newClient(cfg)
	if !c.loggedIn() {
		return errors.New("not logged in. Run: omnimuse login")
	}
	switch command {
	case "whoami", "me", "balance":
		return cmdWhoami(c, rest)
	case "models":
		return cmdModels(c, rest)
	case "image", "video":
		return cmdGenerate(c, command, rest)
	case "status", "get":
		return cmdStatus(c, rest)
	case "list", "ls":
		return cmdList(c, rest)
	case "cancel":
		return cmdCancel(c, rest)
	case "assets", "asset":
		return cmdAssets(c, rest)
	case "edit":
		return cmdEdit(c, rest)
	case "batch":
		return cmdBatch(c, rest)
	}
	return fmt.Errorf("unknown command %q. Run: omnimuse help", command)
}

func printJSON(value any) error {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func cmdLogin(cfg *config, args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	key := fs.String("key", "", "API key (om_...)")
	useKey := fs.Bool("api-key", false, "paste an API key instead of opening the browser")
	host := fs.String("host", "", "site URL, e.g. https://omnimuse.io")
	if _, err := parseInterspersed(fs, args); err != nil {
		return err
	}
	if *host != "" {
		cfg.Host = strings.TrimRight(strings.TrimSpace(*host), "/")
	}
	var err error
	if *key != "" || *useKey {
		err = keyLogin(cfg, *key)
	} else {
		err = browserLogin(cfg)
	}
	if err != nil {
		return err
	}
	var me account
	if err := newClient(cfg).getJSON("/v1/me", &me); err != nil {
		return err
	}
	fmt.Printf("Logged in as %s (%s credits available).\n", me.Username, formatCredits(me.AvailableCredits))
	return nil
}

func formatCredits(value float64) string {
	if value == float64(int64(value)) {
		return fmt.Sprintf("%d", int64(value))
	}
	return fmt.Sprintf("%.2f", value)
}

func cmdWhoami(c *client, args []string) error {
	fs := flag.NewFlagSet("whoami", flag.ContinueOnError)
	asJSON := fs.Bool("json", false, "print JSON")
	if _, err := parseInterspersed(fs, args); err != nil {
		return err
	}
	var me account
	if err := c.getJSON("/v1/me", &me); err != nil {
		return err
	}
	if *asJSON {
		return printJSON(me)
	}
	fmt.Printf("Account:  %s (@%s)\n", firstNonEmpty(me.DisplayName, me.Username), me.Username)
	fmt.Printf("Credits:  %s available", formatCredits(me.AvailableCredits))
	if me.ReservedCredits > 0 {
		fmt.Printf(", %s reserved for running jobs", formatCredits(me.ReservedCredits))
	}
	fmt.Printf("\nSite:     %s\n", c.cfg.Host)
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func cmdModels(c *client, args []string) error {
	fs := flag.NewFlagSet("models", flag.ContinueOnError)
	asJSON := fs.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	path := "/v1/models"
	if len(positional) > 0 {
		path += "?kind=" + positional[0]
	}
	var result struct {
		Models []json.RawMessage `json:"models"`
	}
	if err := c.getJSON(path, &result); err != nil {
		return err
	}
	if *asJSON {
		return printJSON(result.Models)
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tNAME\tKIND\tPRICE\tRATIOS\tRESOLUTIONS\tDURATION")
	for _, raw := range result.Models {
		var m modelInfo
		_ = json.Unmarshal(raw, &m)
		duration := ""
		if len(m.Durations) > 0 {
			parts := make([]string, len(m.Durations))
			for i, d := range m.Durations {
				parts[i] = fmt.Sprint(d)
			}
			duration = strings.Join(parts, "/") + "s"
		} else if m.MaxDuration > 0 {
			duration = fmt.Sprintf("%d-%ds", m.MinDuration, m.MaxDuration)
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\t%s\n", m.ID, m.Name, m.Kind, m.Price, strings.Join(m.AspectRatios, " "), strings.Join(m.Resolutions, " "), duration)
	}
	return w.Flush()
}

func (c *client) resolveReference(value, kind, role string) (reference, error) {
	if strings.HasPrefix(value, "https://") || strings.HasPrefix(value, "http://") {
		return reference{URL: value, Kind: kind, Role: role}, nil
	}
	if _, err := os.Stat(value); err != nil {
		if id := strings.TrimPrefix(strings.TrimPrefix(value, "asset:"), "resource:"); assetIDPattern.MatchString(id) {
			return reference{ResourceID: id, Kind: kind, Role: role}, nil
		}
		return reference{}, fmt.Errorf("reference %q is not a file, https URL or asset id", value)
	}
	fmt.Fprintf(os.Stderr, "Uploading %s...\n", filepath.Base(value))
	uploaded, err := c.upload(value)
	if err != nil {
		return reference{}, err
	}
	return reference{ResourceID: uploaded.ResourceID, Kind: firstNonEmpty(kind, uploaded.Kind), Role: role}, nil
}

func cmdGenerate(c *client, kind string, args []string) error {
	fs := flag.NewFlagSet(kind, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var req generationRequest
	var refs stringList
	var first, last, outDir string
	var audio, noAudio, noWait, noDownload, estimate, yes, asJSON bool
	for _, name := range []string{"m", "model"} {
		fs.StringVar(&req.Model, name, "", "")
	}
	for _, name := range []string{"r", "ratio"} {
		fs.StringVar(&req.AspectRatio, name, "", "")
	}
	fs.StringVar(&req.Resolution, "res", "", "")
	for _, name := range []string{"q", "quality"} {
		fs.StringVar(&req.Quality, name, "", "")
	}
	for _, name := range []string{"d", "duration"} {
		fs.IntVar(&req.Duration, name, 0, "")
	}
	for _, name := range []string{"n", "count"} {
		fs.IntVar(&req.Count, name, 1, "")
	}
	for _, name := range []string{"i", "ref"} {
		fs.Var(&refs, name, "")
	}
	for _, name := range []string{"o", "out"} {
		fs.StringVar(&outDir, name, ".", "")
	}
	for _, name := range []string{"y", "yes"} {
		fs.BoolVar(&yes, name, false, "")
	}
	fs.StringVar(&first, "first", "", "")
	fs.StringVar(&last, "last", "", "")
	fs.BoolVar(&audio, "audio", false, "")
	fs.BoolVar(&noAudio, "no-audio", false, "")
	fs.BoolVar(&noWait, "no-wait", false, "")
	fs.BoolVar(&noDownload, "no-download", false, "")
	fs.BoolVar(&estimate, "estimate", false, "")
	fs.BoolVar(&asJSON, "json", false, "")
	fs.StringVar(&req.Operation, "op", "", "")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return fmt.Errorf("%w (run: omnimuse help)", err)
	}
	req.Prompt = strings.TrimSpace(strings.Join(positional, " "))
	if req.Prompt == "" {
		req.Prompt = defaultEditPrompts[req.Operation]
	}
	if req.Prompt == "" {
		return fmt.Errorf("missing prompt. Example: omnimuse %s \"a red sports car on a coastal road\"", kind)
	}
	// 默认有声（按模型默认）；--no-audio 才关闭。--audio 保留兼容。
	if noAudio {
		off := false
		req.GenerateAudio = &off
	} else if audio {
		req.GenerateAudio = &audio
	}
	if req.Model == "" {
		var models struct {
			Models []modelInfo `json:"models"`
		}
		if err := c.getJSON("/v1/models?kind="+kind, &models); err != nil {
			return err
		}
		if len(models.Models) == 0 {
			return fmt.Errorf("no %s models are available", kind)
		}
		chosen := -1
		for i, m := range models.Models {
			if req.Operation == "" || slices.Contains(m.Operations, req.Operation) {
				chosen = i
				break
			}
		}
		if chosen < 0 {
			return fmt.Errorf("no %s model supports %s right now", kind, req.Operation)
		}
		req.Model = models.Models[chosen].ID
		if !asJSON {
			fmt.Fprintf(os.Stderr, "Model: %s (choose another with -m, see: omnimuse models %s)\n", models.Models[chosen].Name, kind)
		}
	}
	if kind == "video" {
		for _, frame := range []struct{ value, role string }{{first, "first_frame"}, {last, "last_frame"}} {
			if frame.value == "" {
				continue
			}
			ref, err := c.resolveReference(frame.value, "image", frame.role)
			if err != nil {
				return err
			}
			req.References = append(req.References, ref)
		}
	}
	for _, value := range refs {
		ref, err := c.resolveReference(value, "", "")
		if err != nil {
			return err
		}
		// -i 是参考素材；图片明确标成 reference，后台才会走参考生视频而不是把两张图当首尾帧。
		if ref.Kind == "image" || (ref.Kind == "" && imageURLPattern.MatchString(strings.ToLower(ref.URL))) {
			ref.Role = "reference"
		}
		req.References = append(req.References, ref)
	}

	var quote struct {
		Credits     float64 `json:"credits"`
		CreditsEach float64 `json:"creditsEach"`
		Count       int     `json:"count"`
		ModelName   string  `json:"modelName"`
	}
	if err := c.postJSON("/v1/quote", req, &quote); err != nil {
		return err
	}
	if estimate {
		if asJSON {
			return printJSON(quote)
		}
		fmt.Printf("%s: %s credits (%d x %s)\n", quote.ModelName, formatCredits(quote.Credits), quote.Count, formatCredits(quote.CreditsEach))
		return nil
	}
	if !yes && !asJSON && isTerminal() {
		fmt.Fprintf(os.Stderr, "This will use %s credits. Continue? [Y/n] ", formatCredits(quote.Credits))
		var answer string
		_, _ = fmt.Scanln(&answer)
		if answer = strings.ToLower(strings.TrimSpace(answer)); answer != "" && answer != "y" && answer != "yes" {
			return errors.New("cancelled")
		}
	}

	var submitted struct {
		Generations []generation `json:"generations"`
		Warning     string       `json:"warning"`
	}
	if err := c.postJSON("/v1/generations", req, &submitted); err != nil {
		return err
	}
	if submitted.Warning != "" {
		fmt.Fprintln(os.Stderr, "Warning:", submitted.Warning)
	}
	if noWait {
		if asJSON {
			return printJSON(submitted.Generations)
		}
		for _, g := range submitted.Generations {
			fmt.Printf("Submitted %s. Check it with: omnimuse status %s --wait\n", g.ID, g.ID)
		}
		return nil
	}
	results := make([]generation, 0, len(submitted.Generations))
	var failed error
	for _, g := range submitted.Generations {
		done, err := c.waitFor(g.ID, !asJSON)
		if err != nil {
			return err
		}
		if done.Status == "succeeded" && !noDownload {
			if err := c.downloadOutputs(done, outDir, !asJSON); err != nil {
				return err
			}
		}
		if done.Status != "succeeded" && failed == nil {
			failed = fmt.Errorf("generation %s %s: %s", done.ID, done.Status, done.Error)
		}
		results = append(results, *done)
	}
	if asJSON {
		if err := printJSON(results); err != nil {
			return err
		}
	}
	return failed
}

func isTerminal() bool {
	info, err := os.Stdin.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

func (c *client) waitFor(id string, show bool) (*generation, error) {
	started := time.Now()
	lastLine := ""
	for {
		var g generation
		if err := c.getJSON("/v1/generations/"+id, &g); err != nil {
			return nil, err
		}
		if show {
			line := fmt.Sprintf("\r%s  %-10s %3d%%  %s", id[:min(8, len(id))], g.Status, g.Progress, time.Since(started).Round(time.Second))
			if line != lastLine {
				fmt.Fprint(os.Stderr, line+"   ")
				lastLine = line
			}
		}
		switch g.Status {
		case "succeeded", "failed", "cancelled":
			if show {
				fmt.Fprintln(os.Stderr)
				if g.Status == "succeeded" {
					fmt.Fprintf(os.Stderr, "Done in %s, %s credits.\n", time.Since(started).Round(time.Second), formatCredits(g.Credits))
				} else {
					fmt.Fprintf(os.Stderr, "Generation %s: %s (credits are refunded automatically)\n", g.Status, g.Error)
				}
			}
			return &g, nil
		}
		time.Sleep(3 * time.Second)
	}
}

func (c *client) downloadOutputs(g *generation, dir string, show bool) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for i, out := range g.Outputs {
		name := fmt.Sprintf("omnimuse-%s", g.ID[:min(8, len(g.ID))])
		if len(g.Outputs) > 1 {
			name += fmt.Sprintf("-%d", i+1)
		}
		dest := filepath.Join(dir, name+extensionFor(out.MimeType, out.URL, out.Type))
		if err := c.download(out.URL, dest); err != nil {
			return err
		}
		g.Files = append(g.Files, dest)
		if show {
			fmt.Println("Saved", dest)
		}
	}
	return nil
}

func cmdStatus(c *client, args []string) error {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	wait := fs.Bool("wait", false, "wait until finished")
	outDir := fs.String("o", "", "download results to this folder")
	asJSON := fs.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	if len(positional) != 1 {
		return errors.New("usage: omnimuse status <id> [--wait] [-o dir]")
	}
	var g *generation
	if *wait {
		g, err = c.waitFor(positional[0], !*asJSON)
	} else {
		g = &generation{}
		err = c.getJSON("/v1/generations/"+positional[0], g)
	}
	if err != nil {
		return err
	}
	if *outDir != "" && g.Status == "succeeded" {
		if err := c.downloadOutputs(g, *outDir, !*asJSON); err != nil {
			return err
		}
	}
	if *asJSON {
		return printJSON(g)
	}
	fmt.Printf("ID:       %s\nStatus:   %s (%d%%)\nModel:    %s\n", g.ID, g.Status, g.Progress, g.Model)
	if g.Credits > 0 {
		fmt.Printf("Credits:  %s\n", formatCredits(g.Credits))
	}
	if g.Error != "" {
		fmt.Printf("Error:    %s\n", g.Error)
	}
	for _, out := range g.Outputs {
		fmt.Printf("%-9s %s\n", out.Type+":", out.URL)
	}
	return nil
}

func cmdList(c *client, args []string) error {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	limit := fs.Int("n", 20, "how many")
	asJSON := fs.Bool("json", false, "print JSON")
	positional, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	path := fmt.Sprintf("/v1/generations?limit=%d", *limit)
	if len(positional) > 0 {
		path += "&kind=" + positional[0]
	}
	var page struct {
		Generations []generation `json:"generations"`
	}
	if err := c.getJSON(path, &page); err != nil {
		return err
	}
	if *asJSON {
		return printJSON(page.Generations)
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tKIND\tSTATUS\tCREATED\tPROMPT")
	for _, g := range page.Generations {
		prompt := strings.ReplaceAll(g.Prompt, "\n", " ")
		if runes := []rune(prompt); len(runes) > 48 {
			prompt = string(runes[:48]) + "..."
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", g.ID, g.Kind, g.Status, g.CreatedAt.Local().Format("01-02 15:04"), prompt)
	}
	return w.Flush()
}

func cmdCancel(c *client, args []string) error {
	if len(args) != 1 {
		return errors.New("usage: omnimuse cancel <id>")
	}
	var g generation
	if err := c.postJSON("/v1/generations/"+args[0]+"/cancel", map[string]any{}, &g); err != nil {
		return err
	}
	fmt.Printf("%s is now %s.\n", g.ID, g.Status)
	return nil
}

// priceSummary 显示最低一档的价格；按 token 计费的模型提示用 --estimate 估价。
func priceSummary(m modelInfo) string {
	lowest, unit := 0.0, ""
	for _, p := range m.Prices {
		if p.Credits > 0 && (lowest == 0 || p.Credits < lowest) {
			lowest, unit = p.Credits, p.Unit
		}
	}
	if lowest == 0 {
		if len(m.Prices) > 0 {
			return "token-based (--estimate)"
		}
		return m.Price
	}
	suffix := ""
	if strings.Contains(unit, "second") {
		suffix = "/s"
	}
	return fmt.Sprintf("from %s credits%s", strconv.FormatFloat(lowest, 'f', -1, 64), suffix)
}
